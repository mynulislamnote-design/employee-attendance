"use server";

import { prisma } from "@/lib/prisma";
import { checkLocationBoundary } from "@/lib/geo";
import { notifyAttendance } from "@/lib/whatsapp";
import { AttendanceStatus, ShiftType } from "@prisma/client";

function toBanglaNumber(num: number | string): string {
  const banglaDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return num
    .toString()
    .split("")
    .map((char) =>
      char >= "0" && char <= "9" ? banglaDigits[parseInt(char)] : char,
    )
    .join("");
}

function formatLateDuration(minutes: number): string {
  if (minutes < 60) return `${toBanglaNumber(minutes)} মিনিট`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (remMinutes === 0) return `${toBanglaNumber(hours)} ঘণ্টা`;
  return `${toBanglaNumber(hours)} ঘণ্টা ${toBanglaNumber(remMinutes)} মিনিট`;
}

function getTodayDateString(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ==========================================
// ১. চেক-ইন অ্যাকশন (CHECK-IN)
// ==========================================
export async function checkInAction({
  userId,
  userLat,
  userLng,
}: {
  userId: string;
  userLat: number;
  userLng: number;
}) {
  try {
    const today = getTodayDateString();

    const [user, settings] = await Promise.all([
      prisma.user.findFirst({
        where: { OR: [{ id: userId }, { phone: userId }] },
      }),
      prisma.settings.findFirst({ where: { id: 1 } }),
    ]);

    if (!user || !user.isActive) {
      return {
        success: false,
        message: "ব্যবহারকারী খুঁজে পাওয়া যায়নি অথবা অ্যাকাউন্ট নিষ্ক্রিয়।",
      };
    }

    if (!settings) {
      return { success: false, message: "অফিস সেটিংস খুঁজে পাওয়া যায়নি।" };
    }

    const { isAllowed, distance } = checkLocationBoundary(
      userLat,
      userLng,
      settings.officeLat,
      settings.officeLng,
      settings.allowedRadius,
    );

    if (!isAllowed) {
      return {
        success: false,
        message: `⚠️ আপনি অফিসের সীমানার বাইরে আছেন! আপনার দূরত্ব: ${distance} মিটার। অনুমোদিত দূরত্ব: ${settings.allowedRadius} মিটার।`,
      };
    }

    const existing = await prisma.attendance.findUnique({
      where: {
        userId_date: {
          userId: user.id,
          date: today,
        },
      },
    });

    if (existing) {
      return {
        success: false,
        message: "আপনি আজ ইতিমধ্যে চেক-ইন সম্পন্ন করেছেন।",
      };
    }

    const now = new Date();

    // শিফট অনুযায়ী সময় নির্ধারণ
    let shiftStartTimeStr = settings.fullDayStart;
    if (user.currentShift === ShiftType.PART_TIME_MORNING) {
      shiftStartTimeStr = settings.morningStart;
    } else if (user.currentShift === ShiftType.PART_TIME_EVENING) {
      shiftStartTimeStr = settings.eveningStart;
    }

    const bstTimeParts = now
      .toLocaleTimeString("en-US", {
        timeZone: "Asia/Dhaka",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      })
      .split(":")
      .map(Number);

    const currentBstMinutes = bstTimeParts[0] * 60 + bstTimeParts[1];
    const [startHour, startMinute] = shiftStartTimeStr.split(":").map(Number);
    const scheduledStartMinutes = startHour * 60 + startMinute;

    // গ্রেস লিমিট: ১০ মিনিট
    const graceLimit = 10;
    const graceMinutesAllowed = scheduledStartMinutes + graceLimit;

    let isLate = false;
    let lateMinutes = 0;

    // ৯:০০ টার পর যেকোনো সময় পৌঁছালেই বিলম্বের প্রকৃত মিনিট কাউন্ট হবে
    if (currentBstMinutes > scheduledStartMinutes) {
      lateMinutes = currentBstMinutes - scheduledStartMinutes;
      // ১০ মিনিট পার হয়ে গেলে আনুষ্ঠানিকভাবে 'LATE' হিসেবে চিহ্নিত হবে
      if (currentBstMinutes > graceMinutesAllowed) {
        isLate = true;
      }
    }

    const allowedBreakMinutes =
      user.employmentType === "FULL_TIME"
        ? settings.fullTimeBreakLimit
        : settings.partTimeBreakLimit;

    const attendance = await prisma.attendance.create({
      data: {
        userId: user.id,
        date: today,
        shiftAttended: user.currentShift,
        checkIn: now,
        status: isLate ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
        isLate,
        lateMinutes,
        allowedBreakMinutes,
        checkInLat: userLat,
        checkInLng: userLng,
      },
    });

    const timeFormatted = formatTime(now);
    const lateText = isLate
      ? ` (লেট: ${formatLateDuration(lateMinutes)})`
      : lateMinutes > 0
        ? ` (যথাসময়ে - ${toBanglaNumber(lateMinutes)} মি. বিলম্বে)`
        : "";

    const employeeMsg = `✅ হাজিরা সফল!\n👤 নাম: ${user.name}\n⏰ চেক-ইন: ${timeFormatted}${lateText}\n☕ অনুমোদিত বিরতি: ${allowedBreakMinutes} মিনিট\nশুভ কর্মদিবস!`;
    const managerMsg = `📋 হাজিরা নোটিশ:\n${user.name} চেক-ইন করেছেন।\n⏰ সময়: ${timeFormatted}${lateText}\n📍 দূরত্ব: ${distance} মিটার।`;

    notifyAttendance({
      employeePhone: user.phone,
      managerPhone: settings.managerPhone,
      chairmanPhone: settings.chairmanPhone,
      employeeMsg,
      managementMsg: managerMsg,
    });

    return {
      success: true,
      message: `চেক-ইন সফল হয়েছে! (${timeFormatted})${lateText}`,
      data: attendance,
    };
  } catch (error: any) {
    console.error("CheckIn error:", error);
    return { success: false, message: "সার্ভার এরর, পুনরায় চেষ্টা করুন।" };
  }
}

// ==========================================
// ২. ব্রেক অ্যাকশন (START / END BREAK)
// ==========================================
export async function toggleBreakAction({
  attendanceId,
  forcedBy,
}: {
  attendanceId: string;
  forcedBy?: string;
}) {
  try {
    const [attendance, settings] = await Promise.all([
      prisma.attendance.findUnique({
        where: { id: attendanceId },
        include: { user: true },
      }),
      prisma.settings.findFirst({ where: { id: 1 } }),
    ]);

    if (!attendance) {
      return { success: false, message: "হাজিরা রেকর্ড পাওয়া যায়নি।" };
    }

    if (attendance.checkOut) {
      return { success: false, message: "আজকের দিন ইতোমধ্যে সমাপ্ত হয়েছে।" };
    }

    const now = new Date();
    const timeFormatted = formatTime(now);

    if (attendance.status !== AttendanceStatus.ON_BREAK) {
      const updated = await prisma.attendance.update({
        where: { id: attendanceId },
        data: {
          status: AttendanceStatus.ON_BREAK,
          breakStart: now,
          isForcedBreak: Boolean(forcedBy),
          forcedBy: forcedBy || null,
        },
      });

      const empMsg = forcedBy
        ? `⚠️ অ্যাডমিন আপনাকে ${timeFormatted} মিনিটে বিরতিতে পাঠিয়েছেন। অনুমোদিত কোটা: ${attendance.allowedBreakMinutes} মিনিট।`
        : `☕ বিরতি শুরু হয়েছে!\n⏰ সময়: ${timeFormatted}\nঅনুমোদিত বিরতি কোটা: ${attendance.allowedBreakMinutes} মিনিট। সময়মতো কাজে যোগ দিন।`;

      const mgtMsg = `☕ বিরতি নোটিশ:\n👤 কর্মী: ${attendance.user.name}\n⏰ বিরতি শুরু: ${timeFormatted}\n${forcedBy ? `(অ্যাডমিন কর্তৃক ফোর্সড)` : ""}`;

      notifyAttendance({
        employeePhone: attendance.user.phone,
        managerPhone: settings?.managerPhone,
        chairmanPhone: settings?.chairmanPhone,
        employeeMsg: empMsg,
        managementMsg: mgtMsg,
      });

      return { success: true, message: "বিরতি শুরু হয়েছে।", data: updated };
    }

    const breakStart = attendance.breakStart || now;
    const currentBreakMins = Math.max(
      1,
      Math.round((now.getTime() - breakStart.getTime()) / (1000 * 60)),
    );
    const newTotalBreak = attendance.totalBreakMinutes + currentBreakMins;
    const overBreak = Math.max(
      0,
      newTotalBreak - attendance.allowedBreakMinutes,
    );

    const updated = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        status: attendance.isLate
          ? AttendanceStatus.LATE
          : AttendanceStatus.PRESENT,
        breakStart: null,
        breakEnd: now,
        totalBreakMinutes: newTotalBreak,
        overBreakMinutes: overBreak,
      },
    });

    const overBreakText =
      overBreak > 0 ? ` (⚠️ অতিরিক্ত বিরতি: ${overBreak} মিনিট)` : "";
    const empEndMsg = `✅ বিরতি সমাপ্ত!\n⏰ কাজে যোগদানের সময়: ${timeFormatted}\n☕ এই সেশনের বিরতি: ${currentBreakMins} মিনিট\n📊 আজকের মোট বিরতি: ${newTotalBreak} / ${attendance.allowedBreakMinutes} মিনিট${overBreakText}\nশুভ কর্মপ্রবাহ!`;
    const mgtEndMsg = `✅ বিরতি সমাপ্তি নোটিশ:\n👤 কর্মী: ${attendance.user.name}\n⏰ কাজে ফিরেছেন: ${timeFormatted}\n☕ আজকের মোট বিরতি: ${newTotalBreak} মিনিট${overBreakText}`;

    notifyAttendance({
      employeePhone: attendance.user.phone,
      managerPhone: settings?.managerPhone,
      chairmanPhone: settings?.chairmanPhone,
      employeeMsg: empEndMsg,
      managementMsg: mgtEndMsg,
    });

    return {
      success: true,
      message: `বিরতি সমাপ্ত। (বর্তমান বিরতি: ${currentBreakMins} মিনিট, মোট: ${newTotalBreak} মিনিট)`,
      data: updated,
    };
  } catch (error: any) {
    console.error("ToggleBreak error:", error);
    return { success: false, message: "বিরতি আপডেট ব্যর্থ হয়েছে।" };
  }
}

// ==========================================
// ৩. চেক-আউট অ্যাকশন (CHECK-OUT WITH NOTE)
// ==========================================
export async function checkOutAction({
  attendanceId,
  workNote,
  userLat,
  userLng,
}: {
  attendanceId: string;
  workNote: string;
  userLat: number;
  userLng: number;
}) {
  try {
    if (!workNote || workNote.trim().length < 5) {
      return {
        success: false,
        message:
          "চেক-আউট করতে আজকের কাজের বিবরণ (কমপক্ষে ৫ অক্ষর) লেখা আবশ্যক।",
      };
    }

    const [attendance, settings] = await Promise.all([
      prisma.attendance.findUnique({
        where: { id: attendanceId },
        include: { user: true },
      }),
      prisma.settings.findFirst({ where: { id: 1 } }),
    ]);

    if (!attendance || !settings) {
      return { success: false, message: "রেকর্ড খুঁজে পাওয়া যায়নি।" };
    }

    if (attendance.checkOut) {
      return {
        success: false,
        message: "আজকের চেক-আউট ইতোমধ্যেই সম্পন্ন হয়েছে।",
      };
    }

    const { isAllowed, distance } = checkLocationBoundary(
      userLat,
      userLng,
      settings.officeLat,
      settings.officeLng,
      settings.allowedRadius,
    );

    if (!isAllowed) {
      return {
        success: false,
        message: `⚠️ আপনি অফিসের সীমানার বাইরে আছেন! দূরত্ব: ${distance} মিটার।`,
      };
    }

    const now = new Date();

    let finalBreakMinutes = attendance.totalBreakMinutes;
    if (
      attendance.status === AttendanceStatus.ON_BREAK &&
      attendance.breakStart
    ) {
      const remainingBreak = Math.round(
        (now.getTime() - attendance.breakStart.getTime()) / (1000 * 60),
      );
      finalBreakMinutes += remainingBreak;
    }

    const overBreak = Math.max(
      0,
      finalBreakMinutes - attendance.allowedBreakMinutes,
    );

    const updated = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        checkOut: now,
        status: AttendanceStatus.COMPLETED,
        workNote: workNote.trim(),
        totalBreakMinutes: finalBreakMinutes,
        overBreakMinutes: overBreak,
        breakStart: null,
      },
    });

    const inTime = formatTime(attendance.checkIn);
    const outTime = formatTime(now);

    const summaryMsg =
      `🏁 চেক-আউট সম্পন্ন!\n` +
      `👤 কর্মী: ${attendance.user.name}\n` +
      `⏰ আগমন: ${inTime} | প্রস্থান: ${outTime}\n` +
      `☕ মোট বিরতি: ${finalBreakMinutes} মিনিট ${overBreak > 0 ? `(অতিরিক্ত: ${overBreak} মিনিট)` : ""}\n` +
      `📝 আজকের কাজের সারসংক্ষেপ:\n${workNote.trim()}`;

    notifyAttendance({
      employeePhone: attendance.user.phone,
      managerPhone: settings.managerPhone,
      chairmanPhone: settings.chairmanPhone,
      employeeMsg: summaryMsg,
      managementMsg: summaryMsg,
    });

    return {
      success: true,
      message: "চেক-আউট ও কাজের বিবরণ সফলভাবে জমা হয়েছে।",
      data: updated,
    };
  } catch (error: any) {
    console.error("CheckOut error:", error);
    return { success: false, message: "চেক-আউট সম্পন্ন করা যায়নি।" };
  }
}

// ==========================================
// ৪. আজকের হাজিরার লাইভ স্ট্যাটাস ফেচ করা
// ==========================================
export async function getTodayAttendanceAction(userId: string) {
  try {
    const today = getTodayDateString();

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: userId }, { phone: userId }],
      },
    });

    if (!user) {
      return { success: false, message: "ইউজার পাওয়া যায়নি।" };
    }

    const attendance = await prisma.attendance.findUnique({
      where: {
        userId_date: {
          userId: user.id,
          date: today,
        },
      },
    });

    return {
      success: true,
      data: attendance,
    };
  } catch (error) {
    console.error("getTodayAttendanceAction Error:", error);
    return { success: false, message: "হাজিরা লোড করতে সমস্যা হয়েছে।" };
  }
}
