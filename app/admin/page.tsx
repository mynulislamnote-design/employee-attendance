"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getAdminDashboardData,
  createEmployeeAction,
  updateEmployeeShiftAction,
  deactivateEmployeeAction,
  adminForceBreakAction,
  adminForceResumeAction,
  adminForceCheckOutAction,
  updateSettingsAction,
} from "@/app/actions/admin";
import {
  getAllLeavesAction,
  updateLeaveStatusAction,
} from "@/app/actions/leave";
import { getUnifiedAttendanceReportAction } from "@/app/actions/reports";
import { logoutAction } from "@/app/actions/auth";
import {
  Users,
  Clock,
  Coffee,
  CheckCircle2,
  LogOut,
  AlertTriangle,
  UserPlus,
  Settings,
  ShieldAlert,
  MapPin,
  RefreshCw,
  Search,
  Timer,
  ChevronRight,
  Sparkles,
  Hourglass,
  Calendar,
  Check,
  X,
  TrendingUp,
  Zap,
} from "lucide-react";

function AdminLiveBreakTicker({
  breakStart,
  allowedMinutes,
  totalPreviousMinutes,
}: {
  breakStart: string;
  allowedMinutes: number;
  totalPreviousMinutes: number;
}) {
  const [seconds, setSeconds] = useState<number>(0);

  useEffect(() => {
    const startTime = new Date(breakStart).getTime();
    const update = () => {
      const now = new Date().getTime();
      setSeconds(Math.max(0, Math.floor((now - startTime) / 1000)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [breakStart]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeFormatted = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

  const currentTotal = totalPreviousMinutes + mins;
  const isOver = currentTotal > allowedMinutes;

  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border ${
        isOver
          ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse"
          : "bg-amber-50 text-amber-800 border-amber-200"
      }`}
    >
      <Hourglass className="w-3.5 h-3.5 animate-spin" />
      <span>ব্রেক টাইম: {timeFormatted} মি.</span>
      {isOver && (
        <span className="text-[10px] bg-rose-200 text-rose-900 px-1.5 rounded-md">
          ওভারব্রেক!
        </span>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<
    "live" | "reports" | "leaves" | "employees" | "settings"
  >("live");
  const [isPending, startTransition] = useTransition();
  const [alertMsg, setAlertMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // এমপ্লয়ি মডাল
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [employmentType, setEmploymentType] = useState<string>("FULL_TIME");

  // অ্যাডমিন রিপোর্ট ফিল্টার স্টেট
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>("ALL");
  const [reportFilter, setReportFilter] = useState<
    "current_month" | "prev_month" | "custom"
  >("current_month");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [adminReportData, setAdminReportData] = useState<any>(null);
  const [loadingAdminReport, setLoadingAdminReport] = useState<boolean>(false);

  // ছুটির তালিকা স্টেট
  const [allLeaves, setAllLeaves] = useState<any[]>([]);

  const loadData = async () => {
    setLoading(true);
    const res = await getAdminDashboardData();
    if (!res.success) {
      router.push("/login");
    } else {
      setData(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // অ্যাডমিন রিপোর্ট লোড
  const loadAdminReports = async () => {
    setLoadingAdminReport(true);
    const res = await getUnifiedAttendanceReportAction({
      userId: selectedUserFilter,
      filterType: reportFilter,
      startDate: customStart,
      endDate: customEnd,
    });
    if (res.success) {
      setAdminReportData(res.data);
    }
    setLoadingAdminReport(false);
  };

  const loadAllLeaves = async () => {
    const res = await getAllLeavesAction();
    if (res.success) setAllLeaves(res.data);
  };

  useEffect(() => {
    if (activeTab === "reports") loadAdminReports();
    if (activeTab === "leaves") loadAllLeaves();
  }, [activeTab, selectedUserFilter, reportFilter]);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-sm font-medium">
        অ্যাডমিন প্যানেল লোড হচ্ছে...
      </div>
    );
  }

  const { users, attendances, settings } = data;
  const totalEmployees = users.filter((u: any) => u.role === "EMPLOYEE").length;
  const presentCount = attendances.length;
  const onBreakCount = attendances.filter(
    (a: any) => a.status === "ON_BREAK",
  ).length;
  const completedCount = attendances.filter(
    (a: any) => a.status === "COMPLETED",
  ).length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans pb-12">
      {/* টপ হেডার */}
      <header className="bg-slate-900 text-white sticky top-0 z-40 shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">
                অ্যাডমিন কন্ট্রোল সেন্টার
              </h1>
              <p className="text-xs text-slate-400">
                লাইভ হাজিরা, রিপোর্ট ও স্টাফ ম্যানেজমেন্ট
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/")}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-all cursor-pointer"
            >
              এমপ্লয়ি ভিউ
            </button>
            <button
              onClick={() => logoutAction()}
              className="p-2 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-all cursor-pointer"
              title="লগআউট"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ৫টি ট্যাব নেভিগেশন (ছুটি অনুমোদনে লাল ব্যাজ সহ) */}
        <div className="max-w-6xl mx-auto px-4 flex gap-4 border-t border-slate-800 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab("live")}
            className={`py-3 flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === "live"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>লাইভ ফিড</span>
          </button>

          <button
            onClick={() => setActiveTab("reports")}
            className={`py-3 flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === "reports"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>হিস্ট্রি ও মাসিক রিপোর্ট</span>
          </button>

          <button
            onClick={() => setActiveTab("leaves")}
            className={`py-3 flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer relative ${
              activeTab === "leaves"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>ছুটি অনুমোদন</span>
            {data?.pendingLeavesCount > 0 && (
              <span className="bg-rose-500 text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full animate-bounce shadow-sm">
                {data.pendingLeavesCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("employees")}
            className={`py-3 flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === "employees"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>স্টাফ ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={`py-3 flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === "settings"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>অফিস সেটিংস</span>
          </button>
        </div>
      </header>

      {/* কন্টেন্ট বডি */}
      <main className="max-w-6xl mx-auto px-4 mt-6 space-y-6">
        {alertMsg && (
          <div
            className={`p-4 rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-between shadow-sm animate-in fade-in ${
              alertMsg.type === "success"
                ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                : "bg-rose-50 text-rose-900 border border-rose-200"
            }`}
          >
            <span>{alertMsg.text}</span>
            <button
              onClick={() => setAlertMsg(null)}
              className="text-xs px-2 py-1 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* ট্যাব ১: লাইভ ফিড ও ফোর্স অ্যাকশন */}
        {activeTab === "live" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <span className="text-xs font-medium text-slate-500">
                  মোট কর্মী
                </span>
                <div className="text-2xl font-extrabold text-slate-900 mt-1">
                  {totalEmployees} জন
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <span className="text-xs font-medium text-slate-500">
                  আজ উপস্থিত
                </span>
                <div className="text-2xl font-extrabold text-emerald-600 mt-1">
                  {presentCount} জন
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <span className="text-xs font-medium text-slate-500">
                  বর্তমানে বিরতিতে
                </span>
                <div className="text-2xl font-extrabold text-amber-600 mt-1">
                  {onBreakCount} জন
                </div>
              </div>
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <span className="text-xs font-medium text-slate-500">
                  দিন সমাপ্ত
                </span>
                <div className="text-2xl font-extrabold text-slate-600 mt-1">
                  {completedCount} জন
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden divide-y divide-slate-100">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    আজকের লাইভ অ্যাক্টিভিটি ফিড
                  </h3>
                  <p className="text-xs text-slate-500">তারিখ: {data.today}</p>
                </div>
                <button
                  onClick={loadData}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>রিফ্রেশ</span>
                </button>
              </div>

              {attendances.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-sm">
                  আজকে এখনো কোনো কর্মী হাজিরা দেননি।
                </div>
              ) : (
                attendances.map((att: any) => {
                  const isLate = att.status === "LATE";
                  const isOnBreak = att.status === "ON_BREAK";
                  const isCompleted = att.status === "COMPLETED";

                  return (
                    <div
                      key={att.id}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 transition-all"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
                          {att.user.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-slate-900 text-sm">
                              {att.user.name}
                            </h4>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isOnBreak
                                  ? "bg-amber-100 text-amber-800"
                                  : isCompleted
                                    ? "bg-slate-100 text-slate-700"
                                    : isLate
                                      ? "bg-rose-100 text-rose-800"
                                      : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {isOnBreak
                                ? "বিরতিতে"
                                : isCompleted
                                  ? "সমাপ্ত"
                                  : isLate
                                    ? "লেট"
                                    : "কর্মরত"}
                            </span>
                            {isOnBreak && att.breakStart && (
                              <AdminLiveBreakTicker
                                breakStart={att.breakStart}
                                allowedMinutes={att.allowedBreakMinutes}
                                totalPreviousMinutes={att.totalBreakMinutes}
                              />
                            )}
                          </div>

                          <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap gap-x-3">
                            <span>
                              ⏰ আগমন:{" "}
                              {new Date(att.checkIn).toLocaleTimeString(
                                "en-US",
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </span>
                            <span>
                              ☕ কোটা: {att.allowedBreakMinutes} মি. (পূর্বের
                              বিরতি: {att.totalBreakMinutes} মি.)
                            </span>
                          </div>

                          {att.workNote && (
                            <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl mt-2 border border-slate-200/60">
                              📝 <strong>কাজের সামারি:</strong> {att.workNote}
                            </p>
                          )}
                        </div>
                      </div>

                      {!isCompleted && (
                        <div className="flex items-center gap-2 self-end sm:self-center">
                          {isOnBreak ? (
                            <button
                              onClick={() =>
                                startTransition(async () => {
                                  const res = await adminForceResumeAction(
                                    att.id,
                                  );
                                  setAlertMsg({
                                    type: res.success ? "success" : "error",
                                    text: res.message,
                                  });
                                  loadData();
                                })
                              }
                              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                            >
                              ▶ Force Resume
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                startTransition(async () => {
                                  const res = await adminForceBreakAction(
                                    att.id,
                                  );
                                  setAlertMsg({
                                    type: res.success ? "success" : "error",
                                    text: res.message,
                                  });
                                  loadData();
                                })
                              }
                              className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl cursor-pointer"
                            >
                              ☕ Force Break
                            </button>
                          )}

                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `${att.user.name}-কে কি চেক-আউট করাতে চান?`,
                                )
                              ) {
                                startTransition(async () => {
                                  const res = await adminForceCheckOutAction(
                                    att.id,
                                  );
                                  setAlertMsg({
                                    type: res.success ? "success" : "error",
                                    text: res.message,
                                  });
                                  loadData();
                                });
                              }
                            }}
                            className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                          >
                            🚪 Force Check-out
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ট্যাব ২: হিস্ট্রি ও মাসিক রিপোর্ট (সম্পূর্ণ ফিল্টারিং, ড্রপডাউন ও ওভারটাইম সহ) */}
        {activeTab === "reports" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    কর্মী নির্বাচন করুন:
                  </label>
                  <select
                    value={selectedUserFilter}
                    onChange={(e) => setSelectedUserFilter(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium cursor-pointer"
                  >
                    <option value="ALL">👥 সকল কর্মী (All Employees)</option>
                    {users.map((u: any) => (
                      <option key={u.id} value={u.id}>
                        👤 {u.name} ({u.phone})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    সময়সীমা নির্বাচন করুন:
                  </label>
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
                </div>
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
                    onClick={loadAdminReports}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold cursor-pointer"
                  >
                    সার্চ
                  </button>
                </div>
              )}
            </div>

            {/* অ্যাডমিনের ৬টি পরিসংখ্যান কার্ড */}
            {adminReportData?.stats && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 text-center shadow-sm">
                  <span className="text-[11px] text-slate-500 font-medium">
                    উপস্থিতি
                  </span>
                  <div className="text-xl font-extrabold text-emerald-600 mt-1">
                    {adminReportData.stats.totalDaysPresent} দিন
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 text-center shadow-sm">
                  <span className="text-[11px] text-slate-500 font-medium">
                    লেট সংখ্যা
                  </span>
                  <div className="text-xl font-extrabold text-rose-600 mt-1">
                    {adminReportData.stats.totalLateDays} দিন
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-rose-100 bg-rose-50/40 text-center shadow-sm">
                  <span className="text-[11px] text-rose-600 font-bold">
                    মোট লেট সময়
                  </span>
                  <div className="text-xs font-extrabold text-rose-700 mt-1.5">
                    {adminReportData.stats.totalLateTimeText}
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 text-center shadow-sm">
                  <span className="text-[11px] text-slate-500 font-medium">
                    মোট বিরতি
                  </span>
                  <div className="text-xl font-extrabold text-amber-600 mt-1">
                    {adminReportData.stats.totalBreakMinutes} মি.
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 text-center shadow-sm">
                  <span className="text-[11px] text-slate-500 font-medium">
                    অতিরিক্ত বিরতি
                  </span>
                  <div className="text-xl font-extrabold text-slate-700 mt-1">
                    {adminReportData.stats.totalOverBreakMinutes} মি.
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-emerald-100 bg-emerald-50/40 text-center shadow-sm">
                  <span className="text-[11px] text-emerald-700 font-bold flex items-center justify-center gap-1">
                    <Zap className="w-3 h-3 text-emerald-600 fill-emerald-600" />
                    মোট ওভারটাইম
                  </span>
                  <div className="text-xs font-extrabold text-emerald-700 mt-1.5">
                    {adminReportData.stats.totalOvertimeText}
                  </div>
                </div>
              </div>
            )}

            {/* বিস্তারিত রিপোর্ট তালিকা */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-3">
              <h3 className="font-bold text-slate-900 text-base">
                হাজিরা রিপোর্ট তালিকা
              </h3>

              {loadingAdminReport ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  ডাটা লোড হচ্ছে...
                </div>
              ) : adminReportData?.records.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  কোনো রেকর্ড পাওয়া যায়নি।
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {adminReportData?.records.map((r: any) => (
                    <div key={r.id} className="py-4 space-y-1.5">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">
                            {r.user.name}
                          </span>
                          <span className="text-xs text-slate-400">
                            ({r.date})
                          </span>
                        </div>
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
                          ⏰ আগমন:{" "}
                          {new Date(r.checkIn).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span>
                          🚪 প্রস্থান:{" "}
                          {r.checkOut
                            ? new Date(r.checkOut).toLocaleTimeString("en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "এখনো নেই"}
                        </span>
                        <span>☕ বিরতি: {r.totalBreakMinutes} মি.</span>
                        {r.overBreakMinutes > 0 && (
                          <span className="text-rose-600 font-bold">
                            (অতিরিক্ত বিরতি: {r.overBreakMinutes} মি.)
                          </span>
                        )}
                      </div>

                      {r.workNote && (
                        <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl mt-1.5 border border-slate-100">
                          📝 <strong>কাজের বিবরণ:</strong> {r.workNote}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ট্যাব ৩: ছুটি অনুমোদন */}
        {activeTab === "leaves" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  ছুটির আবেদন তালিকা
                </h3>
                <p className="text-xs text-slate-500">
                  কর্মীদের ছুটির আবেদন অনুমোদন বা বাতিল করুন
                </p>
              </div>
              <button
                onClick={loadAllLeaves}
                className="px-3 py-1.5 bg-slate-100 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>রিফ্রেশ</span>
              </button>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden divide-y divide-slate-100">
              {allLeaves.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  কোনো ছুটির আবেদন জমা নেই।
                </div>
              ) : (
                allLeaves.map((l: any) => (
                  <div
                    key={l.id}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-sm">
                          {l.user.name} ({l.user.phone})
                        </h4>
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
                      <p className="text-xs text-slate-500 mt-1">
                        📅 {l.startDate} থেকে {l.endDate} ({l.totalDays} দিন) |
                        ধরন: {l.leaveType}
                      </p>
                      <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl mt-2 border border-slate-100">
                        <strong>কারণ:</strong> {l.reason}
                      </p>
                    </div>

                    {l.status === "PENDING" && (
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          onClick={() => {
                            startTransition(async () => {
                              const res = await updateLeaveStatusAction({
                                leaveId: l.id,
                                status: "APPROVED",
                              });
                              setAlertMsg({
                                type: res.success ? "success" : "error",
                                text: res.message,
                              });
                              loadAllLeaves();
                            });
                          }}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>

                        <button
                          onClick={() => {
                            const reason = prompt(
                              "বাতিল করার কারণ লিখুন (ঐচ্ছিক):",
                            );
                            startTransition(async () => {
                              const res = await updateLeaveStatusAction({
                                leaveId: l.id,
                                status: "REJECTED",
                                adminNote: reason || undefined,
                              });
                              setAlertMsg({
                                type: res.success ? "success" : "error",
                                text: res.message,
                              });
                              loadAllLeaves();
                            });
                          }}
                          className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ট্যাব ৪: এমপ্লয়ি ম্যানেজমেন্ট */}
        {activeTab === "employees" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  সকল স্টাফ তালিকা
                </h3>
                <p className="text-xs text-slate-500">
                  কর্মীদের শিফট ও অ্যাকাউন্ট নিয়ন্ত্রণ করুন
                </p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>নতুন এমপ্লয়ি যোগ করুন</span>
              </button>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden divide-y divide-slate-100">
              {users.map((u: any) => (
                <div
                  key={u.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-700 font-bold flex items-center justify-center">
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-sm">
                          {u.name}
                        </h4>
                        <span className="text-[10px] font-semibold bg-slate-100 px-2 py-0.5 rounded-full text-slate-600">
                          {u.role}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        📱 {u.phone} | 🔑 পিন: {u.password}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <select
                      value={u.currentShift}
                      onChange={(e) => {
                        const newShift = e.target.value as any;
                        startTransition(async () => {
                          const res = await updateEmployeeShiftAction({
                            userId: u.id,
                            employmentType: u.employmentType,
                            currentShift: newShift,
                          });
                          setAlertMsg({
                            type: res.success ? "success" : "error",
                            text: res.message,
                          });
                          loadData();
                        });
                      }}
                      className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 font-medium text-slate-700 cursor-pointer"
                    >
                      <option value="FULL_DAY">Full Day (৯টা-৮টা)</option>
                      <option value="PART_TIME_MORNING">
                        মর্নিং (৯টা-২:৩০টা)
                      </option>
                      <option value="PART_TIME_EVENING">
                        ইভিনিং (২:৩০টা-৮টা)
                      </option>
                    </select>

                    {u.role !== "ADMIN" && (
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `আপনি কি ${u.name}-এর অ্যাকাউন্ট নিষ্ক্রিয় করতে চান?`,
                            )
                          ) {
                            startTransition(async () => {
                              const res = await deactivateEmployeeAction(u.id);
                              setAlertMsg({
                                type: res.success ? "success" : "error",
                                text: res.message,
                              });
                              loadData();
                            });
                          }
                        }}
                        className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                        title="নিষ্ক্রিয় করুন"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ট্যাব ৫: অফিস সেটিংস ও জিপিএস (চেয়ারম্যান ফোন ইনপুট সহ) */}
        {activeTab === "settings" && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 max-w-2xl mx-auto space-y-6 animate-in fade-in">
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                অফিস সেটিংস ও জিওফেন্সিং কনফিগারেশন
              </h3>
              <p className="text-xs text-slate-500">
                হাজিরা দেওয়ার দূরত্ব ও ব্রেক লিমিট নির্ধারণ করুন
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                startTransition(async () => {
                  const res = await updateSettingsAction(formData);
                  setAlertMsg({
                    type: res.success ? "success" : "error",
                    text: res.message,
                  });
                  loadData();
                });
              }}
              className="space-y-4 text-xs font-semibold text-slate-600"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1">অফিস Latitude</label>
                  <input
                    type="number"
                    step="any"
                    name="officeLat"
                    defaultValue={settings?.officeLat || 23.8103}
                    required
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-normal"
                  />
                </div>
                <div>
                  <label className="block mb-1">অফিস Longitude</label>
                  <input
                    type="number"
                    step="any"
                    name="officeLng"
                    defaultValue={settings?.officeLng || 90.4125}
                    required
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-normal"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  navigator.geolocation.getCurrentPosition(
                    (pos) => {
                      const latInput = document.querySelector(
                        'input[name="officeLat"]',
                      ) as HTMLInputElement;
                      const lngInput = document.querySelector(
                        'input[name="officeLng"]',
                      ) as HTMLInputElement;
                      if (latInput && lngInput) {
                        latInput.value = pos.coords.latitude.toString();
                        lngInput.value = pos.coords.longitude.toString();
                        alert(
                          "বর্তমান অবস্থান ইনপুটে নেওয়া হয়েছে। সংরক্ষণ করতে নিচের বাটনে চাপ দিন।",
                        );
                      }
                    },
                    () => alert("লোকেশন পাওয়া যায়নি।"),
                  );
                }}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs flex items-center justify-center gap-1.5 font-semibold cursor-pointer"
              >
                <MapPin className="w-4 h-4 text-emerald-600" />
                <span>আমার বর্তমান অবস্থানকে অফিস লোকেশন হিসেবে সেট করুন</span>
              </button>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block mb-1">অনুমোদিত দূরত্ব (মিটার)</label>
                  <input
                    type="number"
                    name="allowedRadius"
                    defaultValue={settings?.allowedRadius || 100}
                    required
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-normal"
                  />
                </div>
                <div>
                  <label className="block mb-1">
                    ম্যানেজারের WhatsApp নম্বর
                  </label>
                  <input
                    type="text"
                    name="managerPhone"
                    defaultValue={settings?.managerPhone || ""}
                    placeholder="017XXXXXXXX"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-normal"
                  />
                </div>
              </div>

              {/* চেয়ারম্যানের WhatsApp নম্বর ইনপুট */}
              <div className="pt-2">
                <label className="block mb-1">
                  চেয়ারম্যানের WhatsApp নম্বর
                </label>
                <input
                  type="text"
                  name="chairmanPhone"
                  defaultValue={settings?.chairmanPhone || ""}
                  placeholder="018XXXXXXXX"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-normal"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block mb-1">
                    ফুল-টাইম ব্রেক কোটা (মিনিট)
                  </label>
                  <input
                    type="number"
                    name="fullTimeBreakLimit"
                    defaultValue={settings?.fullTimeBreakLimit || 60}
                    required
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-normal"
                  />
                </div>
                <div>
                  <label className="block mb-1">
                    পার্ট-টাইম ব্রেক কোটা (মিনিট)
                  </label>
                  <input
                    type="number"
                    name="partTimeBreakLimit"
                    defaultValue={settings?.partTimeBreakLimit || 30}
                    required
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-normal"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 text-sm mt-4 cursor-pointer"
              >
                {isPending ? "সংরক্ষণ করা হচ্ছে..." : "সেটিংস সংরক্ষণ করুন"}
              </button>
            </form>
          </div>
        )}
      </main>

      {/* নতুন এমপ্লয়ি মডাল */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-600" />
                <span>নতুন এমপ্লয়ি অ্যাকাউন্ট তৈরি</span>
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                startTransition(async () => {
                  const res = await createEmployeeAction(formData);
                  setAlertMsg({
                    type: res.success ? "success" : "error",
                    text: res.message,
                  });
                  if (res.success) {
                    setIsAddModalOpen(false);
                    loadData();
                  }
                });
              }}
              className="space-y-3.5 text-xs font-semibold text-slate-600"
            >
              <div>
                <label className="block mb-1">কর্মীর পূর্ণ নাম</label>
                <input
                  type="text"
                  name="name"
                  placeholder="যেমন: মো: আরিফুল ইসলাম"
                  required
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-normal"
                />
              </div>
              <div>
                <label className="block mb-1">
                  ফোন নম্বর (WhatsApp & Login)
                </label>
                <input
                  type="text"
                  name="phone"
                  placeholder="017XXXXXXXX"
                  required
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-normal"
                />
              </div>
              <div>
                <label className="block mb-1">লগইন পাসওয়ার্ড / পিন</label>
                <input
                  type="text"
                  name="password"
                  defaultValue="123456"
                  required
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-normal"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">চাকরির ধরন</label>
                  <select
                    name="employmentType"
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-normal"
                  >
                    <option value="FULL_TIME">ফুল-টাইম</option>
                    <option value="PART_TIME">পার্ট-টাইম (অর্ধেক বেলা)</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1">নির্ধারিত শিফট</label>
                  <select
                    name="currentShift"
                    disabled={employmentType === "FULL_TIME"}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-normal disabled:bg-slate-100"
                  >
                    {employmentType === "FULL_TIME" ? (
                      <option value="FULL_DAY">Full Day (৯টা - ৮টা)</option>
                    ) : (
                      <>
                        <option value="PART_TIME_MORNING">
                          মর্নিং (৯:০০ - ২:৩০)
                        </option>
                        <option value="PART_TIME_EVENING">
                          ইভিনিং (২:৩০ - ৮:০০)
                        </option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg text-sm mt-4 cursor-pointer"
              >
                {isPending ? "তৈরি করা হচ্ছে..." : "কনফার্ম ও সেভ করুন"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
