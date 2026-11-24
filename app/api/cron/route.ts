import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { LeaveStatus, ShiftType } from "@prisma/client";

// অ্যান্টি-ডুপ্লিকেট মেমোরি (যাতে ৫ মিনিট পর পর ক্রন চললেও দিনে একই মেসেজ ২ বার না যায়)
const globalForCron = globalThis as unknown as {
  sentCronAlerts?: Set<string>;
  currentTrackingDate?: string;
};

if (!globalForCron.sentCronAlerts) {
  globalForCron.sentCronAlerts = new Set<string>();
}

// বাংলাদেশ স্থানীয় সময় ও তারিখ বের করার হেল্পার
function getBangladeshTimeDetails() {
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

  return {
    today: todayDateString,
    hours,
    minutes,
    totalMinutesOfDay,
    formattedTime: bstTimeStr,
  };
}

export async function GET() {
  try {
    const { today, hours, minutes, totalMinutesOfDay, formattedTime } =
      getBangladeshTimeDetails();

    // নতুন দিন শুরু হলে আগের দিনের ক্যাশ মেমোরি পরিষ্কার করা
    if (globalForCron.currentTrackingDate !== today) {
      globalForCron.sentCronAlerts?.clear();
      globalForCron.currentTrackingDate = today;
    }

    const [settings, employees, todayAttendances, todayLeaves] =
      await Promise.all([
        prisma.settings.findFirst({ where: { id: 1 } }),
        prisma.user.findMany({ where: { isActive: true, role: "EMPLOYEE" } }),
        prisma.attendance.findMany({ where: { date: today } }),
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

    // উপস্থিত কর্মী এবং ছুটিতে থাকা কর্মীদের আইডি সেট
    const presentUserIds = new Set(todayAttendances.map((a) => a.userId));
    const onLeaveUserIds = new Set(todayLeaves.map((l) => l.userId));

    const dispatchedEvents: string[] = [];

    // =========================================================================
    // ১. শিফট শুরু হওয়ার চেক-ইন রিমাইন্ডার (Shift Start Reminder)
    // =========================================================================
    // সকাল ৯:০৫ থেকে ৯:১৫ এর মধ্যে (মর্নিং ও ফুল-টাইম কর্মীদের জন্য)
    if (totalMinutesOfDay >= 9 * 60 + 5 && totalMinutesOfDay <= 9 * 60 + 20) {
      for (const emp of employees) {
        if (
          emp.currentShift === ShiftType.FULL_DAY ||
          emp.currentShift === ShiftType.PART_TIME_MORNING
        ) {
          const cacheKey = `${today}_${emp.id}_SHIFT_START_REMINDER`;
          if (
            !presentUserIds.has(emp.id) &&
            !onLeaveUserIds.has(emp.id) &&
            !globalForCron.sentCronAlerts?.has(cacheKey)
          ) {
            const msg =
              `⏰ সকালের হাজিরা রিমাইন্ডার!\n` +
              `👤 প্রিয় ${emp.name},\n` +
              `সকাল ৯:০০ টায় আপনার শিফট শুরু হয়েছে। আপনি অফিসে উপস্থিত থাকলে অনুগ্রহ করে স্মার্ট হাজিরা পোর্টালে ঢুকে দ্রুত চেক-ইন (Check-In) সম্পন্ন করুন।`;

            await sendWhatsAppMessage(emp.phone, msg);
            globalForCron.sentCronAlerts?.add(cacheKey);
            dispatchedEvents.push(`CheckIn Reminder -> ${emp.name}`);
          }
        }
      }
    }

    // দুপুর ২:৩৫ থেকে ২:৪৫ এর মধ্যে (ইভিনিং শিফটের কর্মীদের জন্য)
    if (
      totalMinutesOfDay >= 14 * 60 + 35 &&
      totalMinutesOfDay <= 14 * 60 + 50
    ) {
      for (const emp of employees) {
        if (emp.currentShift === ShiftType.PART_TIME_EVENING) {
          const cacheKey = `${today}_${emp.id}_EVENING_START_REMINDER`;
          if (
            !presentUserIds.has(emp.id) &&
            !onLeaveUserIds.has(emp.id) &&
            !globalForCron.sentCronAlerts?.has(cacheKey)
          ) {
            const msg =
              `⏰ বিকেলের হাজিরা রিমাইন্ডার!\n` +
              `👤 প্রিয় ${emp.name},\n` +
              `দুপুর ২:৩০ এ আপনার ইভিনিং শিফট শুরু হয়েছে। অফিসে উপস্থিত থাকলে অনুগ্রহ করে পোর্টালে চেক-ইন (Check-In) সম্পন্ন করুন।`;

            await sendWhatsAppMessage(emp.phone, msg);
            globalForCron.sentCronAlerts?.add(cacheKey);
            dispatchedEvents.push(`Evening CheckIn Reminder -> ${emp.name}`);
          }
        }
      }
    }

    // =========================================================================
    // ২. শিফট শেষ হওয়ার চেক-আউট রিমাইন্ডার (Shift End Reminder)
    // =========================================================================
    // দুপুর ২:৩০ থেকে ২:৪৫ এর মধ্যে (মর্নিং শিফট সমাপ্তি)
    if (
      totalMinutesOfDay >= 14 * 60 + 30 &&
      totalMinutesOfDay <= 14 * 60 + 45
    ) {
      for (const att of todayAttendances) {
        if (
          att.shiftAttended === ShiftType.PART_TIME_MORNING &&
          !att.checkOut
        ) {
          const cacheKey = `${today}_${att.userId}_SHIFT_END_REMINDER`;
          if (!globalForCron.sentCronAlerts?.has(cacheKey)) {
            const emp = employees.find((e) => e.id === att.userId);
            if (emp) {
              const msg =
                `🏁 শিফট সমাপ্তির নোটিশ!\n` +
                `👤 প্রিয় ${emp.name},\n` +
                `আপনার মর্নিং শিফটের সময় (দুপুর ২:৩০) শেষ হয়েছে। অনুগ্রহ করে আজকের কাজের বিবরণ (Work Note) লিখে চেক-আউট সম্পন্ন করুন।`;

              await sendWhatsAppMessage(emp.phone, msg);
              globalForCron.sentCronAlerts?.add(cacheKey);
              dispatchedEvents.push(
                `Morning Shift End Reminder -> ${emp.name}`,
              );
            }
          }
        }
      }
    }

    // রাত ৮:০০ থেকে ৮:১৫ এর মধ্যে (ফুল-টাইম ও ইভিনিং শিফট সমাপ্তি)
    if (totalMinutesOfDay >= 20 * 60 && totalMinutesOfDay <= 20 * 60 + 15) {
      for (const att of todayAttendances) {
        if (
          (att.shiftAttended === ShiftType.FULL_DAY ||
            att.shiftAttended === ShiftType.PART_TIME_EVENING) &&
          !att.checkOut
        ) {
          const cacheKey = `${today}_${att.userId}_NIGHT_END_REMINDER`;
          if (!globalForCron.sentCronAlerts?.has(cacheKey)) {
            const emp = employees.find((e) => e.id === att.userId);
            if (emp) {
              const msg =
                `🏁 শিফট সমাপ্তির নোটিশ!\n` +
                `👤 প্রিয় ${emp.name},\n` +
                `আপনার শিফটের নির্ধারিত সময় (রাত ৮:০০) শেষ হয়েছে। অনুগ্রহ করে আজকের কাজের বিবরণ (Work Note) লিখে চেক-আউট সম্পন্ন করুন।`;

              await sendWhatsAppMessage(emp.phone, msg);
              globalForCron.sentCronAlerts?.add(cacheKey);
              dispatchedEvents.push(`Night Shift End Reminder -> ${emp.name}`);
            }
          }
        }
      }
    }

    // =========================================================================
    // ৩. ওভারটাইম / ওভারডিউ ফলো-আপ (শিফট শেষ হওয়ার ৩০-৪৫ মিনিট পর বিশেষ নোটিশ)
    // =========================================================================
    // দুপুর ৩:১৫ থেকে ৩:৩০ এর মধ্যে (মর্নিং শিফটের ওভারটাইম ফলো-আপ)
    if (
      totalMinutesOfDay >= 15 * 60 + 15 &&
      totalMinutesOfDay <= 15 * 60 + 35
    ) {
      for (const att of todayAttendances) {
        if (
          att.shiftAttended === ShiftType.PART_TIME_MORNING &&
          !att.checkOut
        ) {
          const cacheKey = `${today}_${att.userId}_MORNING_OVERDUE_ALERT`;
          if (!globalForCron.sentCronAlerts?.has(cacheKey)) {
            const emp = employees.find((e) => e.id === att.userId);
            if (emp) {
              const msg =
                `⚠️ ফলো-আপ নোটিশ (ওভারটাইম সংক্রান্ত):\n` +
                `👤 প্রিয় ${emp.name},\n` +
                `আপনার মর্নিং শিফট শেষ হওয়ার পর ৪৫ মিনিট অতিক্রান্ত হয়েছে।\n` +
                `• আপনি কি এখনো কাজ করছেন? ওভারটাইম চালিয়ে যেতে চাইলে কাজে থাকতে পারেন।\n` +
                `• অন্যথায় কাজ সম্পন্ন হয়ে থাকলে অবিলম্বে পোর্টালে কাজের বিবরণ লিখে চেক-আউট করুন।`;

              await sendWhatsAppMessage(emp.phone, msg);
              globalForCron.sentCronAlerts?.add(cacheKey);
              dispatchedEvents.push(`Morning Overdue Alert -> ${emp.name}`);
            }
          }
        }
      }
    }

    // রাত ৮:৪৫ থেকে ৯:০০ এর মধ্যে (ফুল-টাইম ও ইভিনিং শিফটের ওভারটাইম ফলো-আপ)
    if (totalMinutesOfDay >= 20 * 60 + 45 && totalMinutesOfDay <= 21 * 60 + 5) {
      for (const att of todayAttendances) {
        if (
          (att.shiftAttended === ShiftType.FULL_DAY ||
            att.shiftAttended === ShiftType.PART_TIME_EVENING) &&
          !att.checkOut
        ) {
          const cacheKey = `${today}_${att.userId}_NIGHT_OVERDUE_ALERT`;
          if (!globalForCron.sentCronAlerts?.has(cacheKey)) {
            const emp = employees.find((e) => e.id === att.userId);
            if (emp) {
              const msg =
                `⚠️ ফলো-আপ নোটিশ (ওভারটাইম সংক্রান্ত):\n` +
                `👤 প্রিয় ${emp.name},\n` +
                `আপনার শিফটের নির্ধারিত সময় শেষ হওয়ার পর ৪৫ মিনিট অতিক্রান্ত হয়েছে।\n` +
                `• আপনি যদি অতিরিক্ত কাজ (Overtime) চালিয়ে যেতে চান, তবে কাজে থাকতে পারেন।\n` +
                `• আর কাজ শেষ হয়ে থাকলে অনুগ্রহ করে ভুল না করে এখনি কাজের বিবরণ জমা দিয়ে চেক-আউট সম্পন্ন করুন।`;

              await sendWhatsAppMessage(emp.phone, msg);
              globalForCron.sentCronAlerts?.add(cacheKey);
              dispatchedEvents.push(`Night Overdue Alert -> ${emp.name}`);
            }
          }
        }
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
    console.error("Cron Job Execution Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message },
      { status: 500 },
    );
  }
}
