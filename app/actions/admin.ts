"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/app/actions/auth";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import {
  AttendanceStatus,
  EmploymentType,
  Role,
  ShiftType,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

// আজকের তারিখ হেল্পার (YYYY-MM-DD)
function getTodayString() {
  return new Date().toISOString().split("T")[0];
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ==========================================
// ১. অ্যাডমিন ড্যাশবোর্ডের সমস্ত লাইভ ডাটা ফেচ
// ==========================================
export async function getAdminDashboardData() {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "ADMIN") {
    return { success: false, message: "অননুমোদিত অ্যাক্সেস।" };
  }

  const today = getTodayString();

  const [users, attendances, settings, pendingLeavesCount] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.attendance.findMany({
      where: { date: today },
      include: { user: true },
    }),
    prisma.settings.findFirst({ where: { id: 1 } }),
    prisma.leave.count({ where: { status: "PENDING" } }),
  ]);

  return {
    success: true,
    data: {
      users,
      attendances,
      settings,
      pendingLeavesCount,
      today,
    },
  };
}

// ==========================================
// ২. নতুন এমপ্লয়ি তৈরি ও স্বয়ংক্রিয় হোয়াটসঅ্যাপ ওয়েলকাম
// ==========================================
export async function createEmployeeAction(formData: FormData) {
  try {
    const admin = await getCurrentUser();
    if (!admin || admin.role !== "ADMIN") {
      return { success: false, message: "অনুমতি নেই।" };
    }

    const name = formData.get("name")?.toString().trim();
    const phone = formData.get("phone")?.toString().trim();
    const password = formData.get("password")?.toString().trim();
    const role = (formData.get("role")?.toString() || "EMPLOYEE") as Role;
    const employmentType = (formData.get("employmentType")?.toString() ||
      "FULL_TIME") as EmploymentType;
    let currentShift = (formData.get("currentShift")?.toString() ||
      "FULL_DAY") as ShiftType;

    // ফুল-টাইম হলে শিফট স্বয়ংক্রিয়ভাবে FULL_DAY হবে
    if (employmentType === "FULL_TIME") {
      currentShift = ShiftType.FULL_DAY;
    }

    if (!name || !phone || !password) {
      return {
        success: false,
        message: "নাম, ফোন নম্বর এবং পাসওয়ার্ড দেওয়া আবশ্যক।",
      };
    }

    // নম্বর আগে থেকেই আছে কি না যাচাই
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      return {
        success: false,
        message: "এই ফোন নম্বরে ইতোমধ্যে একজন কর্মী নিবন্ধিত আছেন।",
      };
    }

    const newUser = await prisma.user.create({
      data: {
        name,
        phone,
        password,
        role,
        employmentType,
        currentShift,
        isActive: true,
      },
    });

    // নতুন কর্মীর হোয়াটসঅ্যাপে স্বয়ংক্রিয় ওয়েলকাম মেসেজ পাঠানো
    const shiftNameMap: Record<string, string> = {
      FULL_DAY: "ফুল-টাইম (সকাল ৯:০০ - রাত ৮:০০)",
      PART_TIME_MORNING: "মর্নিং শিফট (সকাল ৯:০০ - দুপুর ২:৩০)",
      PART_TIME_EVENING: "ইভিনিং শিফট (দুপুর ২:৩০ - রাত ৮:০০)",
    };

    const welcomeMsg =
      `🎉 স্বাগতম ${name}!\n\n` +
      `হাজিরা পোর্টালে আপনার অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে।\n` +
      `📱 লগইন আইডি: ${phone}\n` +
      `🔑 পাসওয়ার্ড: ${password}\n` +
      `⏰ আপনার নির্ধারিত শিফট: ${shiftNameMap[currentShift]}\n\n` +
      `কাজে উপস্থিত হয়ে অনুগ্রহ করে পোর্টালে হাজিরা নিশ্চিত করুন।`;

    sendWhatsAppMessage(phone, welcomeMsg);

    revalidatePath("/admin");
    return { success: true, message: `কর্মী "${name}" সফলভাবে যুক্ত হয়েছেন!` };
  } catch (error: any) {
    console.error("Create Employee Error:", error);
    return { success: false, message: "কর্মী যোগ করতে সমস্যা হয়েছে।" };
  }
}

// ==========================================
// ৩. এমপ্লয়ি শিফট পরিবর্তন বা আপডেট
// ==========================================
export async function updateEmployeeShiftAction({
  userId,
  employmentType,
  currentShift,
}: {
  userId: string;
  employmentType: EmploymentType;
  currentShift: ShiftType;
}) {
  try {
    const admin = await getCurrentUser();
    if (!admin || admin.role !== "ADMIN")
      return { success: false, message: "অনুমতি নেই।" };

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        employmentType,
        currentShift:
          employmentType === "FULL_TIME" ? ShiftType.FULL_DAY : currentShift,
      },
    });

    // কর্মীকে হোয়াটসঅ্যাপে শিফট পরিবর্তনের নোটিশ
    sendWhatsAppMessage(
      updated.phone,
      `📢 আপনার শিফট আপডেট করা হয়েছে!\nনতুন শিফট: ${updated.currentShift.replace("_", " ")}`,
    );

    revalidatePath("/admin");
    return { success: true, message: "শিফট সফলভাবে পরিবর্তিত হয়েছে।" };
  } catch (error) {
    return { success: false, message: "শিফট আপডেট ব্যর্থ হয়েছে।" };
  }
}

// ==========================================
// ৪. এমপ্লয়ি ডিঅ্যাক্টিভেট / ডিলিট
// ==========================================
export async function deactivateEmployeeAction(userId: string) {
  try {
    const admin = await getCurrentUser();
    if (!admin || admin.role !== "ADMIN")
      return { success: false, message: "অনুমতি নেই।" };

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    revalidatePath("/admin");
    return { success: true, message: "কর্মীর অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে।" };
  } catch (error) {
    return { success: false, message: "নিষ্ক্রিয় করতে ব্যর্থ হয়েছে।" };
  }
}

// ==========================================
// ৫. ম্যানেজার ফোর্স ব্রেক (FORCE START BREAK)
// ==========================================
export async function adminForceBreakAction(attendanceId: string) {
  try {
    const admin = await getCurrentUser();
    if (!admin || admin.role !== "ADMIN")
      return { success: false, message: "অনুমতি নেই।" };

    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { user: true },
    });

    if (!attendance || attendance.checkOut) {
      return { success: false, message: "কার্যক্রম সম্ভব নয়।" };
    }

    const now = new Date();
    await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        status: AttendanceStatus.ON_BREAK,
        breakStart: now,
        isForcedBreak: true,
        forcedBy: admin.name || "Admin",
      },
    });

    // কর্মীকে হোয়াটসঅ্যাপে সতর্কতা
    sendWhatsAppMessage(
      attendance.user.phone,
      `⚠️ ম্যানেজার আপনাকে ${formatTime(now)} মিনিটে ফোর্স ব্রেকে পাঠিয়েছেন। বিরতি শেষে অবিলম্বে কাজে ফিরুন।`,
    );

    revalidatePath("/admin");
    return {
      success: true,
      message: `${attendance.user.name}-কে সফলভাবে ব্রেকে পাঠানো হয়েছে।`,
    };
  } catch (error) {
    return { success: false, message: "ফোর্স ব্রেক সম্পন্ন করা যায়নি।" };
  }
}

// ==========================================
// ৬. ম্যানেজার ফোর্স রিজিউম (FORCE END BREAK)
// ==========================================
export async function adminForceResumeAction(attendanceId: string) {
  try {
    const admin = await getCurrentUser();
    if (!admin || admin.role !== "ADMIN")
      return { success: false, message: "অনুমতি নেই।" };

    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { user: true },
    });

    if (
      !attendance ||
      attendance.status !== AttendanceStatus.ON_BREAK ||
      !attendance.breakStart
    ) {
      return { success: false, message: "কর্মী বর্তমানে বিরতিতে নেই।" };
    }

    const now = new Date();
    const breakDuration = Math.max(
      1,
      Math.round(
        (now.getTime() - attendance.breakStart.getTime()) / (1000 * 60),
      ),
    );
    const newTotalBreak = attendance.totalBreakMinutes + breakDuration;
    const overBreak = Math.max(
      0,
      newTotalBreak - attendance.allowedBreakMinutes,
    );

    await prisma.attendance.update({
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

    sendWhatsAppMessage(
      attendance.user.phone,
      `✅ আপনার বিরতি অ্যাডমিন কর্তৃক সমাপ্ত করা হয়েছে। কাজের হিসাব পুনরায় চালু হয়েছে।`,
    );

    revalidatePath("/admin");
    return {
      success: true,
      message: `${attendance.user.name}-এর বিরতি সমাপ্ত করে কাজে যুক্ত করা হয়েছে।`,
    };
  } catch (error) {
    return { success: false, message: "ফোর্স রিজিউম ব্যর্থ হয়েছে।" };
  }
}

// ==========================================
// ৭. ম্যানেজার ফোর্স চেক-আউট (FORCE CHECK-OUT)
// ==========================================
export async function adminForceCheckOutAction(attendanceId: string) {
  try {
    const admin = await getCurrentUser();
    if (!admin || admin.role !== "ADMIN")
      return { success: false, message: "অনুমতি নেই।" };

    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { user: true },
    });

    if (!attendance || attendance.checkOut) {
      return { success: false, message: "ইতোমধ্যে চেক-আউট সম্পন্ন হয়েছে।" };
    }

    const now = new Date();
    await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        status: AttendanceStatus.COMPLETED,
        checkOut: now,
        workNote:
          "চেক-আউট না করে চলে যাওয়ায় অ্যাডমিন কর্তৃক ফোর্স চেক-আউট সম্পন্ন।",
        breakStart: null,
      },
    });

    sendWhatsAppMessage(
      attendance.user.phone,
      `🏁 আপনার কর্মদিবস অ্যাডমিন কর্তৃক ক্লোজ (ফোর্স চেক-আউট) করা হয়েছে।`,
    );

    revalidatePath("/admin");
    return { success: true, message: "ফোর্স চেক-আউট সফল হয়েছে।" };
  } catch (error) {
    return { success: false, message: "ফোর্স চেক-আউট ব্যর্থ হয়েছে।" };
  }
}

// ==========================================
// ৮. অফিস সেটিংস ও জিপিএস আপডেট (চেয়ারম্যান ফোন সহ)
// ==========================================
export async function updateSettingsAction(formData: FormData) {
  try {
    const admin = await getCurrentUser();
    if (!admin || admin.role !== "ADMIN")
      return { success: false, message: "অনুমতি নেই।" };

    const officeLat = parseFloat(
      formData.get("officeLat")?.toString() || "23.8103",
    );
    const officeLng = parseFloat(
      formData.get("officeLng")?.toString() || "90.4125",
    );
    const allowedRadius = parseInt(
      formData.get("allowedRadius")?.toString() || "100",
    );
    const fullTimeBreakLimit = parseInt(
      formData.get("fullTimeBreakLimit")?.toString() || "60",
    );
    const partTimeBreakLimit = parseInt(
      formData.get("partTimeBreakLimit")?.toString() || "30",
    );
    const managerPhone = formData.get("managerPhone")?.toString().trim() || "";
    const chairmanPhone =
      formData.get("chairmanPhone")?.toString().trim() || "";

    await prisma.settings.update({
      where: { id: 1 },
      data: {
        officeLat,
        officeLng,
        allowedRadius,
        fullTimeBreakLimit,
        partTimeBreakLimit,
        managerPhone,
        chairmanPhone,
      },
    });

    revalidatePath("/admin");
    return { success: true, message: "অফিস সেটিংস সফলভাবে আপডেট হয়েছে!" };
  } catch (error) {
    return { success: false, message: "সেটিংস সংরক্ষণ ব্যর্থ হয়েছে।" };
  }
}
