"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/app/actions/auth";

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

function formatMinutesToText(minutes: number): string {
  if (!minutes || minutes <= 0) return "০ মিনিট";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0)
    return `${toBanglaNumber(h)} ঘণ্টা ${toBanglaNumber(m)} মি.`;
  if (h > 0) return `${toBanglaNumber(h)} ঘণ্টা`;
  return `${toBanglaNumber(m)} মিনিট`;
}

function calculateRecordOvertime(record: any, settings: any): number {
  if (!record.checkOut) return 0;
  const outTime = new Date(record.checkOut);

  let shiftEndStr = settings?.fullDayEnd || "20:00";
  if (record.shiftAttended === "PART_TIME_MORNING") {
    shiftEndStr = settings?.morningEnd || "14:30";
  } else if (record.shiftAttended === "PART_TIME_EVENING") {
    shiftEndStr = settings?.eveningEnd || "20:00";
  }

  const [endH, endM] = shiftEndStr.split(":").map(Number);
  const scheduledEndTime = new Date(outTime);
  scheduledEndTime.setHours(endH, endM, 0, 0);

  if (outTime > scheduledEndTime) {
    return Math.floor(
      (outTime.getTime() - scheduledEndTime.getTime()) / (1000 * 60),
    );
  }
  return 0;
}

export async function getUnifiedAttendanceReportAction({
  userId,
  filterType,
  startDate,
  endDate,
}: {
  userId?: string;
  filterType: "current_month" | "prev_month" | "custom";
  startDate?: string;
  endDate?: string;
}) {
  try {
    const session = await getCurrentUser();
    if (!session) return { success: false, message: "লগইন আবশ্যক।" };

    const settings = await prisma.settings.findFirst({ where: { id: 1 } });

    let start = "";
    let end = "";
    const now = new Date();
    const bstNowStr = now.toLocaleDateString("en-US", {
      timeZone: "Asia/Dhaka",
    });
    const bstDate = new Date(bstNowStr);
    const year = bstDate.getFullYear();
    const month = bstDate.getMonth();

    if (filterType === "current_month") {
      const monthStr = String(month + 1).padStart(2, "0");
      start = `${year}-${monthStr}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      end = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`;
    } else if (filterType === "prev_month") {
      const prevDate = new Date(year, month - 1, 1);
      const prevYear = prevDate.getFullYear();
      const prevMonth = prevDate.getMonth();
      const prevMonthStr = String(prevMonth + 1).padStart(2, "0");
      start = `${prevYear}-${prevMonthStr}-01`;
      const lastDay = new Date(prevYear, prevMonth + 1, 0).getDate();
      end = `${prevYear}-${prevMonthStr}-${String(lastDay).padStart(2, "0")}`;
    } else if (filterType === "custom" && startDate && endDate) {
      start = startDate;
      end = endDate;
    }

    let targetUserId = "";
    if (session.role === "EMPLOYEE") {
      targetUserId = session.id;
    } else if (session.role === "ADMIN") {
      if (userId && userId !== "ALL") {
        targetUserId = userId;
      }
    }

    let whereClause: any = {};
    if (targetUserId) {
      whereClause.userId = targetUserId;
    }
    if (start && end) {
      whereClause.date = { gte: start, lte: end };
    }

    const [records, approvedLeaves, targetUser] = await Promise.all([
      prisma.attendance.findMany({
        where: whereClause,
        include: { user: true },
        orderBy: { date: "desc" },
      }),
      prisma.leave.findMany({
        where: {
          status: "APPROVED",
          ...(targetUserId ? { userId: targetUserId } : {}),
        },
      }),
      targetUserId
        ? prisma.user.findUnique({ where: { id: targetUserId } })
        : null,
    ]);

    let totalLateMinutes = 0;
    let totalOvertimeMinutes = 0;
    let totalOverBreakMinutes = 0;
    let totalLateDays = 0;

    const attendanceMap = new Map<string, any>();

    records.forEach((r) => {
      const otMins = calculateRecordOvertime(r, settings);
      totalOvertimeMinutes += otMins;
      totalOverBreakMinutes += r.overBreakMinutes;
      totalLateMinutes += r.lateMinutes;

      if (r.isLate) {
        totalLateDays += 1;
      }

      const formatted = {
        ...r,
        overtimeMinutes: otMins,
        overtimeText: formatMinutesToText(otMins),
        lateText: formatMinutesToText(r.lateMinutes),
      };
      attendanceMap.set(r.date, formatted);
    });

    // যোগদানের তারিখ / প্রথম হাজিরার তারিখ
    let firstJoinDateString = "";
    if (targetUser) {
      const firstAtt = await prisma.attendance.findFirst({
        where: { userId: targetUser.id },
        orderBy: { date: "asc" },
      });
      if (firstAtt) {
        firstJoinDateString = firstAtt.date;
      } else {
        firstJoinDateString = targetUser.createdAt.toISOString().split("T")[0];
      }
    }

    // বাংলাদেশ আজকের তারিখ (YYYY-MM-DD)
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    let timeline: any[] = [];
    let absentDays = 0;
    let leaveDays = 0;
    let weekendDays = 0;
    let presentDays = records.length;

    if (start && end) {
      const [sY, sM, sD] = start.split("-").map(Number);
      const cur = new Date(sY, sM - 1, sD);

      // লুপটি শুধুমাত্র শুরু থেকে আজকের দিন অথবা সিলেক্টেড শেষ দিন (যেটি আগে আসবে) পর্যন্ত চলবে
      while (true) {
        const curY = cur.getFullYear();
        const curM = String(cur.getMonth() + 1).padStart(2, "0");
        const curD = String(cur.getDate()).padStart(2, "0");
        const dStr = `${curY}-${curM}-${curD}`;

        // শেষ তারিখ পার হলে অথবা আজকের তারিখ পার হয়ে গেলে লুপ বন্ধ হবে (ভবিষ্যতের কোনো দিন আসবে না)
        if (dStr > end || dStr > todayStr) {
          break;
        }

        const dayOfWeek = cur.getDay(); // 5 = Friday

        // ১. ওই দিনে হাজিরা রেকর্ড আছে কি না?
        if (attendanceMap.has(dStr)) {
          const att = attendanceMap.get(dStr);
          timeline.push({
            date: dStr,
            type: att.isLate ? "LATE" : "PRESENT",
            badgeText: att.isLate
              ? `লেট (${att.lateText})`
              : att.lateMinutes > 0
                ? `যথাসময়ে (${att.lateText} বিলম্বে)`
                : "যথাসময়ে",
            data: att,
          });
        }
        // ২. শুক্রবার (সাপ্তাহিক ছুটি)
        else if (dayOfWeek === 5) {
          weekendDays++;
          timeline.push({
            date: dStr,
            type: "WEEKEND",
            badgeText: "সাপ্তাহিক ছুটি (শুক্রবার)",
            data: null,
          });
        }
        // ৩. অনুমোদিত ছুটি
        else {
          const leaveMatch = approvedLeaves.find(
            (l) => l.startDate <= dStr && l.endDate >= dStr,
          );
          if (leaveMatch) {
            leaveDays++;
            timeline.push({
              date: dStr,
              type: "LEAVE",
              badgeText: `ছুটিতে ছিলেন (${leaveMatch.leaveType})`,
              reason: leaveMatch.reason,
              data: null,
            });
          }
          // ৪. যোগদানের আগের দিন হলে তালিকায় আসবে না এবং অনুপস্থিত দেখাবে না
          else if (firstJoinDateString && dStr < firstJoinDateString) {
            // যোগদানের পূর্বের দিন সম্পূর্ণ এড়িয়ে যাওয়া হলো
          }
          // ৫. অফিস খোলা ছিল কিন্তু আসেনি ও ছুটি নেয়নি = অনুপস্থিত
          else {
            absentDays++;
            timeline.push({
              date: dStr,
              type: "ABSENT",
              badgeText: "অনুপস্থিত (Absent)",
              data: null,
            });
          }
        }

        cur.setDate(cur.getDate() + 1);
      }
    }

    // সাম্প্রতিকতম দিন (আজকের দিন) তালিকার একদম উপরে দেখানোর জন্য রিভার্স
    timeline.reverse();

    return {
      success: true,
      data: {
        records: targetUserId ? timeline : records,
        isTimeline: Boolean(targetUserId),
        stats: {
          totalDaysPresent: presentDays,
          totalLateDays,
          absentDays,
          leaveDays,
          weekendDays,
          totalLateMinutes,
          totalLateTimeText: formatMinutesToText(totalLateMinutes),
          totalOverBreakMinutes,
          totalOvertimeMinutes,
          totalOvertimeText: formatMinutesToText(totalOvertimeMinutes),
        },
      },
    };
  } catch (error) {
    console.error("Report Action error:", error);
    return { success: false, message: "রিপোর্ট ফেচ ব্যর্থ হয়েছে।" };
  }
}
