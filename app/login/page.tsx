"use client";

import { useState, useTransition } from "react";
import { loginAction } from "@/app/actions/auth";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Phone,
  Lock,
  ArrowRight,
  ShieldAlert,
  Clock,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await loginAction(formData);

      if (!res.success) {
        setErrorMessage(res.message);
      } else {
        // রোল অনুযায়ী রিডাইরেক্ট
        if (res.role === "ADMIN") {
          router.push("/admin");
        } else {
          router.push("/");
        }
      }
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-2xl rounded-3xl p-6 sm:p-8 space-y-6">
        {/* লোগো ও হেডার */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-2xl text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-600/30">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            স্মার্ট হাজিরা পোর্টাল
          </h1>
          <p className="text-xs text-slate-500">
            আপনার অ্যাকাউন্টে লগইন করতে তথ্য দিন
          </p>
        </div>

        {/* এরর ব্যানার */}
        {errorMessage && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs flex items-center gap-2.5 animate-in fade-in slide-in-from-top-1">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* লগইন ফর্ম */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              ফোন নম্বর / আইডি
            </label>
            <div className="relative flex items-center">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3.5" />
              <input
                type="text"
                name="phone"
                defaultValue="01736738334" // অ্যাডমিনের ডিফল্ট ফোন
                placeholder="017XXXXXXXX"
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              পাসওয়ার্ড / পিন
            </label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5" />
              <input
                type="password"
                name="password"
                defaultValue="admin" // অ্যাডমিনের ডিফল্ট পাসওয়ার্ড
                placeholder="••••••"
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
          >
            <span>{isPending ? "যাচাই করা হচ্ছে..." : "লগইন করুন"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* ফুটার নোট */}
        <div className="pt-2 text-center text-xs text-slate-400">
          পিন বা পাসওয়ার্ড ভুলে গেলে অ্যাডমিনের সাথে যোগাযোগ করুন।
        </div>
      </div>
    </div>
  );
}
