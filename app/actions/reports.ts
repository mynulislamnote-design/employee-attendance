"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/app/actions/auth";

// মিনিটকে ঘণ্টা ও মিনিটে রূপান্তর করার অভ্যন্তরীণ হেল্পার (কোনো export থাকবে না)
function formatMinutesToText(minutes: number): string {
  if (!minutes || minutes <= 0) return "০ মিনিট";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} ঘণ্টা ${m} মি.`;
  if (h > 0) return `${h} ঘণ্টা`;
  return `${m} মিনিট`;
}

// ওভারটাইম ক্যালকুলেশন অভ্যন্তরীণ হেল্পার
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

  // নির্ধারিত সময়ের পর চেক-আউট করলে ওভারটাইম গণ্য হবে
  if (outTime > scheduledEndTime) {
    return Math.floor(
      (outTime.getTime() - scheduledEndTime.getTime()) / (1000 * 60),
    );
  }
  return 0;
}

// ১. এমপ্লয়ি ও অ্যাডমিন উভয়ের জন্য সমন্বিত হিস্ট্রি ও রিপোর্ট অ্যাকশন (অবশ্যই async)
export async function getUnifiedAttendanceReportAction({
  userId, // নির্দিষ্ট ইউজারের আইডি অথবা 'ALL'
  filterType, // 'current_month' | 'prev_month' | 'custom'
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

    // তারিখ রেঞ্জ নির্ধারণ
    let start = "";
    let end = "";
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    if (filterType === "current_month") {
      const monthStr = String(month + 1).padStart(2, "0");
      start = `${year}-${monthStr}-01`;
      end = `${year}-${monthStr}-31`;
    } else if (filterType === "prev_month") {
      const prevDate = new Date(year, month - 1, 1);
      const prevYear = prevDate.getFullYear();
      const prevMonthStr = String(prevDate.getMonth() + 1).padStart(2, "0");
      start = `${prevYear}-${prevMonthStr}-01`;
      end = `${prevYear}-${prevMonthStr}-31`;
    } else if (filterType === "custom" && startDate && endDate) {
      start = startDate;
      end = endDate;
    }

    // ইউজার ফিল্টার লজিক
    let whereClause: any = {};
    if (session.role === "EMPLOYEE") {
      whereClause.userId = session.id;
    } else if (session.role === "ADMIN") {
      if (userId && userId !== "ALL") {
        whereClause.userId = userId;
      }
    }

    if (start && end) {
      whereClause.date = { gte: start, lte: end };
    }

    const records = await prisma.attendance.findMany({
      where: whereClause,
      include: { user: true },
      orderBy: { date: "desc" },
    });

    // পরিসংখ্যান হিসাব (ওভারটাইম ও মোট লেট সময় সহ)
    let totalLateMinutes = 0;
    let totalOvertimeMinutes = 0;
    let totalBreakMinutes = 0;
    let totalOverBreakMinutes = 0;
    let totalLateDays = 0;

    const formattedRecords = records.map((r) => {
      const otMins = calculateRecordOvertime(r, settings);
      totalOvertimeMinutes += otMins;
      totalBreakMinutes += r.totalBreakMinutes;
      totalOverBreakMinutes += r.overBreakMinutes;

      if (r.isLate) {
        totalLateDays += 1;
        totalLateMinutes += r.lateMinutes;
      }

      return {
        ...r,
        overtimeMinutes: otMins,
        overtimeText: formatMinutesToText(otMins),
        lateText: r.isLate ? formatMinutesToText(r.lateMinutes) : "০ মিনিট",
      };
    });

    return {
      success: true,
      data: {
        records: formattedRecords,
        stats: {
          totalDaysPresent: records.length,
          totalLateDays,
          totalLateMinutes,
          totalLateTimeText: formatMinutesToText(totalLateMinutes),
          totalBreakMinutes,
          totalOverBreakMinutes,
          totalOvertimeMinutes,
          totalOvertimeText: formatMinutesToText(totalOvertimeMinutes),
        },
      },
    };
  } catch (error) {
    console.error("getUnifiedAttendanceReportAction error:", error);
    return { success: false, message: "রিপোর্ট ফেচ করতে সমস্যা হয়েছে।" };
  }
}
