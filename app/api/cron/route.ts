import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { LeaveStatus, ShiftType } from "@prisma/client";

const globalForCron = globalThis as unknown as {
  sentCronAlerts?: Set<string>;
  currentTrackingDate?: string;
};

if (!globalForCron.sentCronAlerts) {
  globalForCron.sentCronAlerts = new Set<string>();
}

// বাংলাদেশ স্থানীয় সময় ও শুক্রবার যাচাই
function getBangladeshDetails() {
  const now = new Date();
  const bstDateStr = now.toLocaleDateString("en-US", {
    timeZone: "Asia/Dhaka",
  });
  const bstTimeStr = now.toLocaleTimeString("en-US", {
    timeZone: "Asia/Dhaka",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });

  const bstDate = new Date(bstDateStr);
  const year = bstDate.getFullYear();
  const month = String(bstDate.getMonth() + 1).padStart(2, "0");
  const day = String(bstDate.getDate()).padStart(2, "0");
  const todayDateString = `${year}-${month}-${day}`;

  const [hours, minutes] = bstTimeStr.split(":").map(Number);
  const totalMinutesOfDay = hours * 60 + minutes;
  const dayOfWeek = bstDate.getDay(); // 0 = Sunday, 5 = Friday

  return {
    today: todayDateString,
    hours,
    minutes,
    totalMinutesOfDay,
    formattedTime: bstTimeStr,
    isFriday: dayOfWeek === 5, // ৫ মানে শুক্রবার
  };
}

export async function GET() {
  try {
    const { today, totalMinutesOfDay, formattedTime, isFriday } =
      getBangladeshDetails();

    // নতুন দিনে ক্যাশ ক্লিয়ার করা
    if (globalForCron.currentTrackingDate !== today) {
      globalForCron.sentCronAlerts?.clear();
      globalForCron.currentTrackingDate = today;
    }

    // শুক্রবার হলে কোনো রুটিন চেক-ইন বা লেট অ্যালার্ট চলবে না (সাপ্তাহিক ছুটি)
    if (isFriday) {
      return NextResponse.json({
        success: true,
        message:
          "আজ শুক্রবার (সাপ্তাহিক ছুটি)। স্বয়ংক্রিয় রুটিন অ্যালার্ট বন্ধ আছে।",
        timeZone: "Asia/Dhaka",
        serverTime: formattedTime,
      });
    }

    const [settings, employees, todayAttendances, todayLeaves] =
      await Promise.all([
        prisma.settings.findFirst({ where: { id: 1 } }),
        prisma.user.findMany({ where: { isActive: true, role: "EMPLOYEE" } }),
        prisma.attendance.findMany({
          where: { date: today },
          include: { user: true },
        }),
        prisma.leave.findMany({
          where: {
            status: LeaveStatus.APPROVED,
            startDate: { lte: today },
            endDate: { lte: today },
          },
        }),
      ]);

    if (!settings) {
      return NextResponse.json(
        { success: false, message: "Settings not found" },
        { status: 500 },
      );
    }

    const presentUserIds = new Set(todayAttendances.map((a) => a.userId));
    const onLeaveUserIds = new Set(todayLeaves.map((l) => l.userId));
    const dispatchedEvents: string[] = [];

    // =========================================================================
    // ১. সকাল ৯:১৬ থেকে ৯:৩০ — মর্নিং ও ফুল-টাইম লেট/অনুপস্থিতি অ্যালার্ট
    // =========================================================================
    if (totalMinutesOfDay >= 9 * 60 + 16 && totalMinutesOfDay <= 9 * 60 + 30) {
      for (const emp of employees) {
        // শুধুমাত্র ফুল-টাইম ও মর্নিং শিফট
        if (
          emp.currentShift === ShiftType.FULL_DAY ||
          emp.currentShift === ShiftType.PART_TIME_MORNING
        ) {
          const cacheKey = `${today}_${emp.id}_MORNING_LATE_ALERT`;

          // যদি হাজিরা না দেয় এবং ছুটিতে না থাকে
          if (
            !presentUserIds.has(emp.id) &&
            !onLeaveUserIds.has(emp.id) &&
            !globalForCron.sentCronAlerts?.has(cacheKey)
          ) {
            const empMsg =
              `⚠️ হাজিরা সতর্কতা!\n` +
              `👤 প্রিয় ${emp.name},\n` +
              `সকাল ৯:১৫ পার হয়ে গেছে, কিন্তু আপনি এখনো অফিসে আসেননি বা হাজিরা দেননি। অনুগ্রহ করে দ্রুত হাজিরা নিশ্চিত করুন।`;

            const mgtMsg =
              `🚨 অনুপস্থিতি/লেট নোটিশ:\n` +
              `👤 কর্মী: ${emp.name} (${emp.phone})\n` +
              `⏰ শিফট: ${emp.currentShift === ShiftType.FULL_DAY ? "ফুল-টাইম" : "মর্নিং"}\n` +
              `সকাল ৯:১৫ পার হওয়ার পরও এখনো হাজিরা দেননি।`;

            await sendWhatsAppMessage(emp.phone, empMsg);
            if (settings.managerPhone)
              await sendWhatsAppMessage(settings.managerPhone, mgtMsg);
            if (settings.chairmanPhone)
              await sendWhatsAppMessage(settings.chairmanPhone, mgtMsg);

            globalForCron.sentCronAlerts?.add(cacheKey);
            dispatchedEvents.push(`Morning Late Alert -> ${emp.name}`);
          }
        }
      }
    }

    // =========================================================================
    // ২. দুপুর ২:৩০ থেকে ২:৪০ — শুধুমাত্র মর্নিং শিফটের কর্ম সমাপ্তি নোটিশ
    // =========================================================================
    if (
      totalMinutesOfDay >= 14 * 60 + 30 &&
      totalMinutesOfDay <= 14 * 60 + 40
    ) {
      for (const att of todayAttendances) {
        if (
          att.shiftAttended === ShiftType.PART_TIME_MORNING &&
          !att.checkOut
        ) {
          const cacheKey = `${today}_${att.userId}_MORNING_END_NOTICE`;
          if (!globalForCron.sentCronAlerts?.has(cacheKey)) {
            const emp = employees.find((e) => e.id === att.userId);
            if (emp) {
              const msg =
                `🏁 শিফট সমাপ্তির নোটিশ!\n` +
                `👤 প্রিয় ${emp.name},\n` +
                `আপনার মর্নিং শিফটের সময় (দুপুর ২:৩০) শেষ হয়েছে।\n` +
                `• অতিরিক্ত কাজ করতে চাইলে কাজে থাকুন (ওভারটাইম কাউন্ট হবে)।\n` +
                `• অন্যথায় আজকের কাজের বিবরণ লিখে প্রস্থান (Check-Out) দিয়ে দিন।`;

              await sendWhatsAppMessage(emp.phone, msg);
              globalForCron.sentCronAlerts?.add(cacheKey);
              dispatchedEvents.push(`Morning End Notice -> ${emp.name}`);
            }
          }
        }
      }
    }

    // =========================================================================
    // ৩. দুপুর ২:৪৬ থেকে ৩:০০ — শুধুমাত্র ইভিনিং শিফটের লেট/অনুপস্থিতি অ্যালার্ট
    // =========================================================================
    if (totalMinutesOfDay >= 14 * 60 + 46 && totalMinutesOfDay <= 15 * 60) {
      for (const emp of employees) {
        // শুধুমাত্র ইভিনিং শিফট
        if (emp.currentShift === ShiftType.PART_TIME_EVENING) {
          const cacheKey = `${today}_${emp.id}_EVENING_LATE_ALERT`;

          if (
            !presentUserIds.has(emp.id) &&
            !onLeaveUserIds.has(emp.id) &&
            !globalForCron.sentCronAlerts?.has(cacheKey)
          ) {
            const empMsg =
              `⚠️ হাজিরা সতর্কতা!\n` +
              `👤 প্রিয় ${emp.name},\n` +
              `দুপুর ২:৪৫ পার হয়ে গেছে, কিন্তু আপনি এখনো ইভিনিং শিফটের হাজিরা দেননি। অনুগ্রহ করে দ্রুত হাজিরা দিন।`;

            const mgtMsg =
              `🚨 অনুপস্থিতি/লেট নোটিশ:\n` +
              `👤 কর্মী: ${emp.name} (${emp.phone})\n` +
              `⏰ শিফট: ইভিনিং (দুপুর ২:৩০ - রাত ৮:০০)\n` +
              `দুপুর ২:৪৫ পার হওয়ার পরও এখনো হাজিরা দেননি।`;

            await sendWhatsAppMessage(emp.phone, empMsg);
            if (settings.managerPhone)
              await sendWhatsAppMessage(settings.managerPhone, mgtMsg);
            if (settings.chairmanPhone)
              await sendWhatsAppMessage(settings.chairmanPhone, mgtMsg);

            globalForCron.sentCronAlerts?.add(cacheKey);
            dispatchedEvents.push(`Evening Late Alert -> ${emp.name}`);
          }
        }
      }
    }

    // =========================================================================
    // ৪. রাত ৮:০০ থেকে ৮:১০ — ফুল-টাইম ও ইভিনিং শিফটের কর্ম সমাপ্তি নোটিশ
    // =========================================================================
    if (totalMinutesOfDay >= 20 * 60 && totalMinutesOfDay <= 20 * 60 + 10) {
      for (const att of todayAttendances) {
        if (
          (att.shiftAttended === ShiftType.FULL_DAY ||
            att.shiftAttended === ShiftType.PART_TIME_EVENING) &&
          !att.checkOut
        ) {
          const cacheKey = `${today}_${att.userId}_NIGHT_END_NOTICE`;
          if (!globalForCron.sentCronAlerts?.has(cacheKey)) {
            const emp = employees.find((e) => e.id === att.userId);
            if (emp) {
              const msg =
                `🏁 শিফট সমাপ্তির নোটিশ!\n` +
                `👤 প্রিয় ${emp.name},\n` +
                `আপনার শিফটের নির্ধারিত সময় (রাত ৮:০০) শেষ হয়েছে।\n` +
                `• অতিরিক্ত কাজ করতে চাইলে কাজে থাকুন (ওভারটাইম হিসেবে কাউন্ট হবে)।\n` +
                `• অন্যথায় এখনই কাজের বিবরণ লিখে প্রস্থান (Check-Out) দিন।`;

              await sendWhatsAppMessage(emp.phone, msg);
              globalForCron.sentCronAlerts?.add(cacheKey);
              dispatchedEvents.push(`Night End Notice -> ${emp.name}`);
            }
          }
        }
      }
    }

    // =========================================================================
    // ৫. ১৫ মিনিট অতিরিক্ত ওভার-ব্রেক অ্যালার্ট (সারাদিন যেকোনো সময়)
    // =========================================================================
    for (const att of todayAttendances) {
      if (att.status === "ON_BREAK" && att.breakStart) {
        const breakStartTime = new Date(att.breakStart).getTime();
        const currentElapsedMins = Math.floor(
          (new Date().getTime() - breakStartTime) / 60000,
        );
        const totalUsedMins = att.totalBreakMinutes + currentElapsedMins;
        const extraMins = totalUsedMins - att.allowedBreakMinutes;

        if (extraMins >= 15) {
          const cacheKey = `${today}_${att.userId}_OVERBREAK_ALERT`;
          if (!globalForCron.sentCronAlerts?.has(cacheKey)) {
            const empAlert =
              `🚨 জরুরি বিরতি সতর্কতা!\n` +
              `👤 প্রিয় ${att.user.name},\n` +
              `আপনার বিরতির নির্ধারিত কোটা (${att.allowedBreakMinutes} মি.) পার হওয়ার পরও ১৫ মিনিট অতিরিক্ত পার হয়ে গেছে!\n` +
              `মোট বিরতি: ${totalUsedMins} মিনিট। অনুগ্রহ করে কাজে যোগ দিয়ে বিরতি সমাপ্ত করুন।`;

            const mgtAlert =
              `🚨 ওভার-ব্রেক রিপোর্ট:\n` +
              `👤 কর্মী: ${att.user.name}\n` +
              `অনুমোদিত কোটার চেয়ে ১৫+ মিনিট অতিরিক্ত বিরতিতে আছেন (মোট: ${totalUsedMins} মি.)!`;

            await sendWhatsAppMessage(att.user.phone, empAlert);
            if (settings.managerPhone)
              await sendWhatsAppMessage(settings.managerPhone, mgtAlert);
            if (settings.chairmanPhone)
              await sendWhatsAppMessage(settings.chairmanPhone, mgtAlert);

            globalForCron.sentCronAlerts?.add(cacheKey);
            dispatchedEvents.push(`Overbreak Alert -> ${att.user.name}`);
          }
        }
      }
    }

    // =========================================================================
    // ৬. রাত ৮:৩০ মিনিটে ম্যানেজার ও চেয়ারম্যানের কাছে দিন শেষের সারসংক্ষেপ রিপোর্ট
    // =========================================================================
    if (
      totalMinutesOfDay >= 20 * 60 + 30 &&
      totalMinutesOfDay <= 20 * 60 + 50
    ) {
      const summaryKey = `${today}_DAILY_REPORT_SUMMARY`;
      if (!globalForCron.sentCronAlerts?.has(summaryKey)) {
        const totalStaff = employees.length;
        const presentCount = todayAttendances.length;
        const lateCount = todayAttendances.filter((a) => a.isLate).length;
        const completedCount = todayAttendances.filter(
          (a) => a.checkOut,
        ).length;
        const pendingCount = presentCount - completedCount;
        const leaveCount = todayLeaves.length;
        const absentCount = totalStaff - presentCount - leaveCount;

        const summaryReport =
          `📊 দৈনিক কর্মদিবস সারসংক্ষেপ রিপোর্ট\n` +
          `📅 তারিখ: ${today}\n` +
          `⏰ সময়: রাত ৮:৩০\n\n` +
          `👥 মোট কর্মী: ${totalStaff} জন\n` +
          `✅ আজ উপস্থিত: ${presentCount} জন\n` +
          `❌ অনুপস্থিত: ${Math.max(0, absentCount)} জন\n` +
          `🏖️ ছুটিতে আছেন: ${leaveCount} জন\n` +
          `⏳ লেট আগমন: ${lateCount} জন\n` +
          `🏁 চেক-আউট সম্পন্ন: ${completedCount} জন\n` +
          `⚠️ চেক-আউট বাকি: ${pendingCount} জন\n\n` +
          `বিস্তারিত অডিট দেখতে অ্যাডমিন প্যানেল চেক করুন।`;

        if (settings.managerPhone)
          await sendWhatsAppMessage(settings.managerPhone, summaryReport);
        if (settings.chairmanPhone)
          await sendWhatsAppMessage(settings.chairmanPhone, summaryReport);

        globalForCron.sentCronAlerts?.add(summaryKey);
        dispatchedEvents.push("Daily Summary Dispatched");
      }
    }

    return NextResponse.json({
      success: true,
      timeZone: "Asia/Dhaka",
      serverTime: formattedTime,
      date: today,
      dispatchedCount: dispatchedEvents.length,
      dispatchedEvents,
    });
  } catch (error: any) {
    console.error("Cron Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message },
      { status: 500 },
    );
  }
}
