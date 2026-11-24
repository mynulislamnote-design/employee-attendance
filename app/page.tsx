"use client";

import { useState, useEffect, useTransition } from "react";
import React from "react";
import {
  checkInAction,
  toggleBreakAction,
  checkOutAction,
  getTodayAttendanceAction,
} from "@/app/actions/attendance";
import { getCurrentUser, logoutAction } from "@/app/actions/auth";
import { applyLeaveAction, getMyLeavesAction } from "@/app/actions/leave";
import { getUnifiedAttendanceReportAction } from "@/app/actions/reports";
import { useRouter } from "next/navigation";
import {
  Clock,
  MapPin,
  Coffee,
  CheckCircle2,
  LogOut,
  AlertTriangle,
  Briefcase,
  User,
  ShieldCheck,
  Sparkles,
  Timer,
  Shield,
  Loader2,
  Hourglass,
  Calendar,
  Send,
  TrendingUp,
  Zap,
} from "lucide-react";

export default function AttendancePortal() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentAttendance, setCurrentAttendance] = useState<any>(null);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<
    "attendance" | "reports" | "leaves"
  >("attendance");

  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [breakElapsedSeconds, setBreakElapsedSeconds] = useState<number>(0);

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locating, setLocating] = useState<boolean>(true);
  const [locError, setLocError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [workNote, setWorkNote] = useState<string>("");

  // রিপোর্ট স্টেট
  const [reportFilter, setReportFilter] = useState<
    "current_month" | "prev_month" | "custom"
  >("current_month");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [reportData, setReportData] = useState<any>(null);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);

  // ছুটি স্টেট
  const [leaves, setLeaves] = useState<any[]>([]);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState<boolean>(false);

  useEffect(() => {
    async function init() {
      setInitialLoading(true);
      const user = await getCurrentUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setCurrentUser(user);

      const attRes = await getTodayAttendanceAction(user.id);
      if (attRes.success && attRes.data) {
        setCurrentAttendance(attRes.data);
      }
      setInitialLoading(false);
    }
    init();
  }, [router]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }),
      );
      setCurrentDate(
        now.toLocaleDateString("bn-BD", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (
      !currentAttendance ||
      currentAttendance.status !== "ON_BREAK" ||
      !currentAttendance.breakStart
    ) {
      setBreakElapsedSeconds(0);
      return;
    }
    const breakStartTime = new Date(currentAttendance.breakStart).getTime();
    const interval = setInterval(() => {
      const now = new Date().getTime();
      setBreakElapsedSeconds(
        Math.max(0, Math.floor((now - breakStartTime) / 1000)),
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [currentAttendance]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocError("ব্রাউজার জিপিএস সাপোর্ট করে না।");
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocError("লোকেশন পারমিশন পাওয়া যায়নি।");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }, []);

  const loadReports = async () => {
    setLoadingReport(true);
    const res = await getUnifiedAttendanceReportAction({
      filterType: reportFilter,
      startDate: customStart,
      endDate: customEnd,
    });
    if (res.success) {
      setReportData(res.data);
    }
    setLoadingReport(false);
  };

  useEffect(() => {
    if (activeTab === "reports") loadReports();
    if (activeTab === "leaves") {
      getMyLeavesAction().then((res) => {
        if (res.success) setLeaves(res.data);
      });
    }
  }, [activeTab, reportFilter]);

  const handleCheckIn = () => {
    if (!location || !currentUser) return;
    setMessage(null);
    startTransition(async () => {
      const res = await checkInAction({
        userId: currentUser.id,
        userLat: location.lat,
        userLng: location.lng,
      });

      if (res.success && res.data) {
        setCurrentAttendance(res.data);
        setMessage({ type: "success", text: res.message });
      } else {
        setMessage({ type: "error", text: res.message });
      }
    });
  };

  const handleToggleBreak = () => {
    if (!currentAttendance?.id) return;
    setMessage(null);
    startTransition(async () => {
      const res = await toggleBreakAction({
        attendanceId: currentAttendance.id,
      });
      if (res.success && res.data) {
        setCurrentAttendance(res.data);
        setMessage({ type: "success", text: res.message });
      } else {
        setMessage({ type: "error", text: res.message });
      }
    });
  };

  const handleCheckOut = () => {
    if (!currentAttendance?.id || !location) return;
    if (!workNote || workNote.trim().length < 5) {
      alert("আজকের কাজের বিবরণ কমপক্ষে ৫ অক্ষরের হতে হবে।");
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const res = await checkOutAction({
        attendanceId: currentAttendance.id,
        workNote: workNote.trim(),
        userLat: location.lat,
        userLng: location.lng,
      });

      if (res.success && res.data) {
        setCurrentAttendance(res.data);
        setIsModalOpen(false);
        setMessage({ type: "success", text: res.message });
      } else {
        setMessage({ type: "error", text: res.message });
      }
    });
  };

  if (initialLoading || !currentUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-500 gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        <span className="text-xs font-semibold">হাজিরা লোড হচ্ছে...</span>
      </div>
    );
  }

  const isWorking =
    currentAttendance &&
    currentAttendance.status !== "COMPLETED" &&
    currentAttendance.status !== "ON_BREAK";
  const isOnBreak =
    currentAttendance && currentAttendance.status === "ON_BREAK";
  const isCompleted =
    currentAttendance && currentAttendance.status === "COMPLETED";

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const allowedMins = currentAttendance?.allowedBreakMinutes || 60;
  const previousBreakMins = currentAttendance?.totalBreakMinutes || 0;
  const currentBreakMins = Math.floor(breakElapsedSeconds / 60);
  const totalUsedBreakMins = previousBreakMins + currentBreakMins;
  const isOverBreak = totalUsedBreakMins > allowedMins;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans pb-10">
      {/* টপ হেডার বার */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 text-sm sm:text-base leading-tight">
                {currentUser.name}
              </h1>
              <p className="text-[11px] text-slate-500">{currentUser.phone}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentUser.role === "ADMIN" && (
              <button
                onClick={() => router.push("/admin")}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-all"
              >
                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                <span>Admin</span>
              </button>
            )}

            <button
              onClick={() => logoutAction()}
              className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 transition-all cursor-pointer"
              title="লগআউট"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ৩টি ট্যাব নেভিগেশন */}
        <div className="max-w-lg mx-auto px-4 flex gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("attendance")}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
              activeTab === "attendance"
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>আজকের হাজিরা</span>
          </button>

          <button
            onClick={() => setActiveTab("reports")}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
              activeTab === "reports"
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>মাসিক রিপোর্ট</span>
          </button>

          <button
            onClick={() => setActiveTab("leaves")}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
              activeTab === "leaves"
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>ছুটির আবেদন</span>
          </button>
        </div>
      </header>

      {/* মূল কন্টেইনার */}
      <main className="max-w-lg mx-auto px-4 mt-5 space-y-4">
        {/* ট্যাব ১: আজকের হাজিরা */}
        {activeTab === "attendance" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="relative overflow-hidden rounded-3xl bg-slate-900 text-white p-6 shadow-2xl border border-slate-800">
              <div className="relative z-10 flex items-center justify-between text-slate-400 text-xs font-medium mb-3">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  {currentDate}
                </span>
                <span className="text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-semibold">
                  {currentUser.currentShift.replace(/_/g, " ")}
                </span>
              </div>

              <div className="relative z-10 text-4xl sm:text-5xl font-extrabold tracking-tight font-mono text-white my-2">
                {currentTime || "00:00:00 AM"}
              </div>

              <div className="relative z-10 mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <MapPin
                    className={`w-4 h-4 ${locating ? "text-amber-400 animate-bounce" : locError ? "text-rose-400" : "text-emerald-400"}`}
                  />
                  <span
                    className={
                      locating
                        ? "text-amber-300"
                        : locError
                          ? "text-rose-300"
                          : "text-slate-300"
                    }
                  >
                    {locating
                      ? "জিপিএস খোঁজা হচ্ছে..."
                      : locError
                        ? locError
                        : "অফিস জিপিএস সক্রিয়"}
                  </span>
                </div>

                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                    isOnBreak
                      ? "bg-amber-500/20 text-amber-300"
                      : isWorking
                        ? "bg-emerald-500/20 text-emerald-300"
                        : isCompleted
                          ? "bg-slate-700 text-slate-300"
                          : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {isOnBreak
                    ? "বিরতিতে"
                    : isWorking
                      ? "কাজে উপস্থিত"
                      : isCompleted
                        ? "দিন সমাপ্ত"
                        : "অপেক্ষমাণ"}
                </span>
              </div>
            </div>

            {message && (
              <div
                className={`p-4 rounded-2xl text-xs sm:text-sm font-medium flex items-start gap-3 ${
                  message.type === "success"
                    ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                    : "bg-rose-50 text-rose-900 border border-rose-200"
                }`}
              >
                {message.type === "success" ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="leading-relaxed">{message.text}</div>
              </div>
            )}

            {isOnBreak && (
              <div
                className={`p-5 rounded-3xl border shadow-lg ${isOverBreak ? "bg-rose-50 border-rose-200 text-rose-950" : "bg-amber-50 border-amber-200 text-amber-950"}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Hourglass
                      className={`w-5 h-5 ${isOverBreak ? "text-rose-600 animate-spin" : "text-amber-600 animate-pulse"}`}
                    />
                    <span className="font-bold text-sm">
                      {isOverBreak
                        ? "⚠️ বিরতির সীমা অতিক্রান্ত!"
                        : "☕ চলমান বিরতি"}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-extrabold px-3 py-1 rounded-full ${isOverBreak ? "bg-rose-200 text-rose-800" : "bg-amber-200 text-amber-800"}`}
                  >
                    কোটা: {allowedMins} মি.
                  </span>
                </div>
                <div className="text-center py-3 bg-white/70 backdrop-blur-sm rounded-2xl my-2">
                  <span className="text-4xl font-extrabold font-mono tracking-wider">
                    {formatTimer(breakElapsedSeconds)}
                  </span>
                </div>
                <div className="text-xs text-center mt-2 font-medium">
                  {isOverBreak ? (
                    <span className="text-rose-600 font-bold">
                      অনুমোদিত কোটার চেয়ে {totalUsedBreakMins - allowedMins}{" "}
                      মিনিট অতিরিক্ত বিরতি নিয়েছেন!
                    </span>
                  ) : (
                    <span>
                      ব্যবহৃত: {totalUsedBreakMins} মি. | বাকি:{" "}
                      {allowedMins - totalUsedBreakMins} মি.
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {!currentAttendance && (
                <button
                  onClick={handleCheckIn}
                  disabled={isPending || locating}
                  className="w-full py-4 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-2xl shadow-xl shadow-emerald-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="w-6 h-6" />
                  <span className="text-base">
                    {isPending ? "যাচাই করা হচ্ছে..." : "হাজিরা দিন (Check-In)"}
                  </span>
                </button>
              )}

              {currentAttendance && !isCompleted && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleToggleBreak}
                    disabled={isPending}
                    className={`py-4 px-4 font-bold rounded-2xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm cursor-pointer ${
                      isOnBreak
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20"
                        : "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20"
                    }`}
                  >
                    <Coffee className="w-5 h-5" />
                    <span>{isOnBreak ? "কাজে ফিরুন" : "বিরতি নিন"}</span>
                  </button>

                  <button
                    onClick={() => setIsModalOpen(true)}
                    disabled={isPending}
                    className="py-4 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-2xl shadow-md shadow-rose-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
                  >
                    <LogOut className="w-5 h-5" />
                    <span>ছুটি (Check-Out)</span>
                  </button>
                </div>
              )}

              {isCompleted && (
                <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm text-center space-y-2">
                  <ShieldCheck className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                  <h3 className="font-bold text-slate-900 text-base">
                    আজকের কর্মদিবস সমাপ্ত!
                  </h3>
                  <p className="text-xs text-slate-500">
                    আপনার আজকের হাজিরা ও কাজের বিবরণ সফলভাবে সংরক্ষিত হয়েছে।
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ট্যাব ২: মাসিক রিপোর্ট (৬টি বিস্তারিত স্ট্যাটাস কার্ড) */}
        {activeTab === "reports" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200 space-y-3">
              <span className="text-xs font-bold text-slate-700 block">
                ফিল্টারিং নির্বাচন করুন:
              </span>
              <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
                <button
                  onClick={() => setReportFilter("current_month")}
                  className={`py-2 rounded-xl transition-all cursor-pointer ${
                    reportFilter === "current_month"
                      ? "bg-emerald-600 text-white shadow-md"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  চলতি মাস
                </button>
                <button
                  onClick={() => setReportFilter("prev_month")}
                  className={`py-2 rounded-xl transition-all cursor-pointer ${
                    reportFilter === "prev_month"
                      ? "bg-emerald-600 text-white shadow-md"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  বিগত মাস
                </button>
                <button
                  onClick={() => setReportFilter("custom")}
                  className={`py-2 rounded-xl transition-all cursor-pointer ${
                    reportFilter === "custom"
                      ? "bg-emerald-600 text-white shadow-md"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  কাস্টম তারিখ
                </button>
              </div>

              {reportFilter === "custom" && (
                <div className="pt-2 flex items-center gap-2 text-xs">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                  <span>থেকে</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="flex-1 p-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                  <button
                    onClick={loadReports}
                    className="px-3 py-2 bg-emerald-600 text-white rounded-xl font-bold"
                  >
                    সার্চ
                  </button>
                </div>
              )}
            </div>

            {/* ৬টি প্রধান পরিসংখ্যান কার্ড (ওভারটাইম ও মোট লেট সময় সহ) */}
            {reportData?.stats && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 text-center">
                  <span className="text-[11px] text-slate-500 font-medium">
                    উপস্থিতি
                  </span>
                  <div className="text-xl font-extrabold text-emerald-600 mt-1">
                    {reportData.stats.totalDaysPresent} দিন
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 text-center">
                  <span className="text-[11px] text-slate-500 font-medium">
                    লেট সংখ্যা
                  </span>
                  <div className="text-xl font-extrabold text-rose-600 mt-1">
                    {reportData.stats.totalLateDays} দিন
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-rose-100 bg-rose-50/30 text-center">
                  <span className="text-[11px] text-rose-600 font-bold">
                    মোট লেট সময়
                  </span>
                  <div className="text-sm font-extrabold text-rose-700 mt-1">
                    {reportData.stats.totalLateTimeText}
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 text-center">
                  <span className="text-[11px] text-slate-500 font-medium">
                    মোট বিরতি
                  </span>
                  <div className="text-xl font-extrabold text-amber-600 mt-1">
                    {reportData.stats.totalBreakMinutes} মি.
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 text-center">
                  <span className="text-[11px] text-slate-500 font-medium">
                    অতিরিক্ত বিরতি
                  </span>
                  <div className="text-xl font-extrabold text-slate-700 mt-1">
                    {reportData.stats.totalOverBreakMinutes} মি.
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-emerald-100 bg-emerald-50/40 text-center">
                  <span className="text-[11px] text-emerald-700 font-bold flex items-center justify-center gap-1">
                    <Zap className="w-3 h-3 text-emerald-600 fill-emerald-600" />
                    মোট ওভারটাইম
                  </span>
                  <div className="text-sm font-extrabold text-emerald-700 mt-1">
                    {reportData.stats.totalOvertimeText}
                  </div>
                </div>
              </div>
            )}

            {/* হাজিরার বিবরণ তালিকা */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-3">
              <h3 className="font-bold text-slate-900 text-sm">
                হাজিরা হিস্ট্রি বিবরণ
              </h3>

              {loadingReport ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  লোড হচ্ছে...
                </div>
              ) : reportData?.records.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  কোনো রেকর্ড পাওয়া যায়নি।
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {reportData?.records.map((r: any) => (
                    <div key={r.id} className="py-3.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-sm">
                          {r.date}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {r.overtimeMinutes > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                              +OT: {r.overtimeText}
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              r.isLate
                                ? "bg-rose-100 text-rose-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {r.isLate ? `লেট (${r.lateText})` : "যথাসময়ে"}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 flex flex-wrap gap-x-4">
                        <span>
                          ⏰ ইন:{" "}
                          {new Date(r.checkIn).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span>
                          🚪 আউট:{" "}
                          {r.checkOut
                            ? new Date(r.checkOut).toLocaleTimeString("en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "এখনো নেই"}
                        </span>
                        <span>☕ ব্রেক: {r.totalBreakMinutes} মি.</span>
                      </div>
                      {r.workNote && (
                        <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-xl mt-1 border border-slate-100">
                          📝 {r.workNote}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ট্যাব ৩: ছুটির আবেদন */}
        {activeTab === "leaves" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  আমার ছুটির আবেদনসমূহ
                </h3>
                <p className="text-xs text-slate-500">
                  অনুমোদনের অবস্থা ও ইতিহাস দেখুন
                </p>
              </div>
              <button
                onClick={() => setIsLeaveModalOpen(true)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>নতুন আবেদন</span>
              </button>
            </div>

            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 divide-y divide-slate-100">
              {leaves.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  আপনার কোনো ছুটির আবেদন নেই।
                </div>
              ) : (
                leaves.map((l: any) => (
                  <div key={l.id} className="py-3.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-sm">
                        {l.startDate} থেকে {l.endDate} ({l.totalDays} দিন)
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          l.status === "APPROVED"
                            ? "bg-emerald-100 text-emerald-800"
                            : l.status === "REJECTED"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {l.status === "APPROVED"
                          ? "অনুমোদিত"
                          : l.status === "REJECTED"
                            ? "বাতিল"
                            : "অপেক্ষমাণ"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <strong>কারণ:</strong> {l.reason}
                    </p>
                    {l.adminNote && (
                      <p className="text-xs text-rose-600 font-medium">
                        অ্যাডমিনের মন্তব্য: {l.adminNote}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* কাজের বিবরণ মডাল */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-sm font-bold text-slate-900">
                কাজের বিবরণ (Work Note)
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-sm font-bold text-slate-400"
              >
                ✕
              </button>
            </div>
            <textarea
              rows={4}
              value={workNote}
              onChange={(e) => setWorkNote(e.target.value)}
              placeholder="আজকের কাজের সারসংক্ষেপ লিখুন..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 rounded-xl text-xs font-bold"
              >
                বাতিল
              </button>
              <button
                onClick={handleCheckOut}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold"
              >
                কনফার্ম চেক-আউট
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ছুটির আবেদন মডাল */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span>ছুটির আবেদন ফরম</span>
              </h3>
              <button
                onClick={() => setIsLeaveModalOpen(false)}
                className="text-sm font-bold text-slate-400"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                startTransition(async () => {
                  const res = await applyLeaveAction(formData);
                  alert(res.message);
                  if (res.success) {
                    setIsLeaveModalOpen(false);
                    getMyLeavesAction().then(
                      (r) => r.success && setLeaves(r.data),
                    );
                  }
                });
              }}
              className="space-y-3 text-xs font-semibold text-slate-600"
            >
              <div>
                <label className="block mb-1">ছুটির ধরন</label>
                <select
                  name="leaveType"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-normal"
                >
                  <option value="CASUAL">নৈমিত্তিক ছুটি (Casual Leave)</option>
                  <option value="SICK">অসুস্থতাজনিত ছুটি (Sick Leave)</option>
                  <option value="ANNUAL">বার্ষিক ছুটি (Annual Leave)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">শুরুর তারিখ</label>
                  <input
                    type="date"
                    name="startDate"
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-normal"
                  />
                </div>
                <div>
                  <label className="block mb-1">শেষের তারিখ</label>
                  <input
                    type="date"
                    name="endDate"
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-normal"
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1">ছুটির বিস্তারিত কারণ</label>
                <textarea
                  name="reason"
                  rows={3}
                  required
                  placeholder="ছুটি নেওয়ার সঠিক কারণ লিখুন..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-normal resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md text-xs transition-all cursor-pointer"
              >
                {isPending ? "পাঠানো হচ্ছে..." : "আবেদন জমা দিন"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ফুটার */}
      <footer className="w-full max-w-lg mx-auto text-center text-xs text-slate-400 py-3">
        &copy; {new Date().getFullYear()} আধুনিক হাজিরা সিস্টেম | সর্বস্বত্ব
        সংরক্ষিত
      </footer>
    </div>
  );
}
