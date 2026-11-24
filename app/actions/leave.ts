"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/app/actions/auth";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { LeaveStatus, LeaveType } from "@prisma/client";
import { revalidatePath } from "next/cache";

// ১. এমপ্লয়ির ছুটির আবেদন জমা দেওয়া (নিরাপদ লজিক)
export async function applyLeaveAction(formData: FormData) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        message: "লগইন সেশন পাওয়া যায়নি। পুনরায় লগইন করুন।",
      };
    }

    const leaveType = (formData.get("leaveType")?.toString() ||
      "CASUAL") as LeaveType;
    const startDate = formData.get("startDate")?.toString().trim();
    const endDate = formData.get("endDate")?.toString().trim();
    const reason = formData.get("reason")?.toString().trim();

    if (!startDate || !endDate || !reason) {
      return {
        success: false,
        message: "শুরুর তারিখ, শেষের তারিখ এবং কারণ উল্লেখ করা বাধ্যতামূলক।",
      };
    }

    // দিন গণনা
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const totalDays = Math.max(
      1,
      Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1,
    );

    // ডাটাবেজে ছুটি তৈরি
    const leave = await prisma.leave.create({
      data: {
        userId: user.id,
        leaveType,
        startDate,
        endDate,
        totalDays,
        reason,
        status: LeaveStatus.PENDING,
      },
    });

    // ব্যাকগ্রাউন্ডে কর্মী, ম্যানেজার ও চেয়ারম্যান সবাইকে মেসেজ পাঠানো
    Promise.resolve().then(async () => {
      try {
        const settings = await prisma.settings.findFirst({ where: { id: 1 } });
        const typeLabel =
          leaveType === "SICK"
            ? "অসুস্থতাজনিত"
            : leaveType === "CASUAL"
              ? "নৈমিত্তিক"
              : "বার্ষিক";

        // কর্মীর নিজের জন্য কনফার্মেশন মেসেজ
        const empConfirmMsg =
          `📩 আপনার ছুটির আবেদন গৃহীত হয়েছে!\n` +
          `📅 তারিখ: ${startDate} থেকে ${endDate} (${totalDays} দিন)\n` +
          `📌 ধরন: ${typeLabel}\n` +
          `⏳ বর্তমান অবস্থা: অপেক্ষমাণ (Pending)\n` +
          `অনুমোদন হওয়া মাত্র আপনাকে জানানো হবে।`;

        await sendWhatsAppMessage(user.phone, empConfirmMsg);

        // ম্যানেজমেন্টের জন্য মেসেজ
        const managementMsg =
          `📩 নতুন ছুটির আবেদন!\n` +
          `👤 কর্মী: ${user.name} (${user.phone})\n` +
          `📅 তারিখ: ${startDate} থেকে ${endDate} (${totalDays} দিন)\n` +
          `📌 ধরন: ${typeLabel}\n` +
          `📝 কারণ: ${reason}\n\n` +
          `অনুমোদনের জন্য অ্যাডমিন প্যানেল চেক করুন।`;

        if (settings?.managerPhone) {
          await sendWhatsAppMessage(settings.managerPhone, managementMsg);
        }
        if (settings?.chairmanPhone) {
          await sendWhatsAppMessage(settings.chairmanPhone, managementMsg);
        }
      } catch (err) {
        console.error("WhatsApp notification error for leave:", err);
      }
    });

    revalidatePath("/");
    return { success: true, message: "ছুটির আবেদন সফলভাবে জমা হয়েছে!" };
  } catch (error: any) {
    console.error("ApplyLeave error:", error);
    return {
      success: false,
      message: error?.message || "ডাটাবেজে আবেদন সংরক্ষণে সমস্যা হয়েছে।",
    };
  }
}

// ২. কর্মীর নিজস্ব ছুটির তালিকা ফেচ করা
export async function getMyLeavesAction() {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, data: [] };

    const leaves = await prisma.leave.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: leaves };
  } catch (error) {
    return { success: false, data: [] };
  }
}

// ৩. অ্যাডমিনের জন্য সকল ছুটির আবেদন ফেচ করা
export async function getAllLeavesAction() {
  try {
    const admin = await getCurrentUser();
    if (!admin || admin.role !== "ADMIN") return { success: false, data: [] };

    const leaves = await prisma.leave.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: leaves };
  } catch (error) {
    return { success: false, data: [] };
  }
}

// ৪. অ্যাডমিন কর্তৃক ছুটি অনুমোদন বা বাতিল
export async function updateLeaveStatusAction({
  leaveId,
  status,
  adminNote,
}: {
  leaveId: string;
  status: LeaveStatus;
  adminNote?: string;
}) {
  try {
    const admin = await getCurrentUser();
    if (!admin || admin.role !== "ADMIN")
      return { success: false, message: "অনুমতি নেই।" };

    const updatedLeave = await prisma.leave.update({
      where: { id: leaveId },
      data: {
        status,
        adminNote: adminNote || null,
      },
      include: { user: true },
    });

    // কর্মীকে হোয়াটসঅ্যাপে জানানো
    Promise.resolve().then(async () => {
      try {
        const isApproved = status === LeaveStatus.APPROVED;
        const statusText = isApproved
          ? "✅ অনুমোদিত (Approved)"
          : "❌ বাতিল (Rejected)";
        const noteText = adminNote ? `\nমন্তব্য: ${adminNote}` : "";

        const empMsg =
          `📢 ছুটির আবেদন আপডেট:\n` +
          `আপনার ${updatedLeave.startDate} থেকে ${updatedLeave.endDate} তারিখের ছুটির আবেদনটি ${statusText} হয়েছে।${noteText}`;

        await sendWhatsAppMessage(updatedLeave.user.phone, empMsg);
      } catch (e) {}
    });

    revalidatePath("/admin");
    return {
      success: true,
      message: `ছুটি সফলভাবে ${status === LeaveStatus.APPROVED ? "অনুমোদন" : "বাতিল"} করা হয়েছে।`,
    };
  } catch (error) {
    return { success: false, message: "স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে।" };
  }
}
