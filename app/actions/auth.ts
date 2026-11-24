"use server";

import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// লগইন অ্যাকশন
export async function loginAction(formData: FormData) {
  const phone = formData.get("phone")?.toString().trim();
  const password = formData.get("password")?.toString().trim();

  if (!phone || !password) {
    return { success: false, message: "ফোন নম্বর এবং পাসওয়ার্ড দেওয়া আবশ্যক।" };
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ phone }, { id: phone }],
      },
    });

    if (!user) {
      return {
        success: false,
        message: "এই ফোন নম্বরে কোনো অ্যাকাউন্ট পাওয়া যায়নি।",
      };
    }

    if (!user.isActive) {
      return {
        success: false,
        message:
          "আপনার অ্যাকাউন্টটি নিষ্ক্রিয় করা আছে। অ্যাডমিনের সাথে যোগাযোগ করুন।",
      };
    }

    if (user.password !== password) {
      return { success: false, message: "ভুল পাসওয়ার্ড! আবার চেষ্টা করুন।" };
    }

    // ব্রাউজারে নিরাপদ কুকি সেশন সেভ করা
    const cookieStore = await cookies();
    cookieStore.set(
      "session_user",
      JSON.stringify({
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        currentShift: user.currentShift,
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 30, // ৩০ দিন স্থায়ী থাকবে
        path: "/",
      },
    );

    return {
      success: true,
      role: user.role,
      message: "লগইন সফল হয়েছে!",
    };
  } catch (error) {
    console.error("Login Error:", error);
    return {
      success: false,
      message: "সার্ভারে সমস্যা হয়েছে। পুনরায় চেষ্টা করুন।",
    };
  }
}

// বর্তমান লগইন করা ব্যবহারকারী পাওয়ার ফাংশন
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session_user");

  if (!sessionCookie?.value) {
    return null;
  }

  try {
    return JSON.parse(sessionCookie.value);
  } catch {
    return null;
  }
}

// লগআউট অ্যাকশন
export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete("session_user");
  redirect("/login");
}
