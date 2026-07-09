'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api, ApiError } from '@/lib/api';
import { useRequireRole } from '@/lib/useRequireRole';
import { PageLoader } from '@/components/PageLoader';
import { QueueManager } from '@/components/QueueManager';
import { Toast, type ToastMessage } from '@/components/Toast';
import { DepartmentPicker, type DepartmentOption } from '@/components/DepartmentPicker';
import { PhoneInput, type PhoneValidationResult } from '@/components/PhoneInput';
import { DoctorCredentialsModal, type DoctorCredentials } from '@/components/DoctorCredentialsModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'queue' | 'history' | 'staff';

interface DashboardDoctor {
  id: string; name: string; department: string;
  status: 'AVAILABLE' | 'PAUSED' | 'OFFLINE';
  waiting: number; inConsultation: number;
  completed: number; missed: number; skipped: number; cancelled: number;
}
interface TrafficPoint { date: string; label: string; count: number }
interface AnalyticsPoint {
  date: string; label: string;
  completed: number; missed: number; cancelled: number; skipped: number; total: number;
}
interface DoctorAnalyticsRow {
  id: string; name: string; department: string; status: string;
  completed: number; missed: number; cancelled: number; skipped: number;
}
interface HistoryEntry {
  id: string; tokenNumber: number; status: string;
  serviceDay: string; completedAt: string | null;
  patient: { name: string; phone: string };
  doctor: { name: string; department: string };
}
interface HistorySummary { completed: number; missed: number; cancelled: number; skipped: number; total: number }
interface HistoryResponse {
  entries: HistoryEntry[]; total: number; page: number; pages: number;
  summary: HistorySummary;
}
interface ClinicDashboard {
  clinic: { id: string; name: string; address?: string };
  today: { waiting: number; inConsultation: number; completed: number; skipped: number; cancelled: number };
  doctors: DashboardDoctor[];
  weeklyTraffic: TrafficPoint[];
}
interface ClinicAnalytics { period: string; points: AnalyticsPoint[] }
interface DoctorAnalytics { from: string; to: string; doctors: DoctorAnalyticsRow[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_TABS: Tab[] = ['dashboard', 'queue', 'history', 'staff'];
const TODAY = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const SEVEN_AGO = daysAgo(6);

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV: { label: string; tab: Tab; icon: (p: { className?: string }) => JSX.Element }[] = [
  { label: 'Dashboard', tab: 'dashboard', icon: GridIcon  },
  { label: 'Queue',     tab: 'queue',     icon: ListIcon  },
  { label: 'History',  tab: 'history',   icon: ClockIcon },
  { label: 'Staff',    tab: 'staff',     icon: UsersIcon },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

type BookingPeriod = '7d' | '30d' | '3m' | '12m' | 'hourly' | 'custom';
type DocPeriod     = '7d' | '30d' | '3m' | '12m' | 'today'  | 'custom';

export default function ReceptionPage() {
  const { ready } = useRequireRole(['RECEPTIONIST', 'ADMIN']);

  // ── Tab — persisted in localStorage so refresh keeps the user here ──
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  useEffect(() => {
    const saved = localStorage.getItem('cq_reception_tab');
    if (saved && VALID_TABS.includes(saved as Tab)) setActiveTab(saved as Tab);
  }, []);
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    localStorage.setItem('cq_reception_tab', tab);
  };

  const [data, setData]                         = useState<ClinicDashboard | null>(null);
  const [analytics, setAnalytics]               = useState<ClinicAnalytics | null>(null);
  const [doctorAnalytics, setDoctorAnalytics]   = useState<DoctorAnalytics | null>(null);
  const [history, setHistory]                   = useState<HistoryResponse | null>(null);
  const [historyAnalytics, setHistoryAnalytics] = useState<ClinicAnalytics | null>(null);
  const [loading, setLoading]                   = useState(true);
  const [refreshing, setRefreshing]             = useState(false);

  // Booking overview
  const [bookingPeriod, setBookingPeriod]     = useState<BookingPeriod>('30d');
  const [bookingFrom, setBookingFrom]         = useState(SEVEN_AGO);
  const [bookingTo, setBookingTo]             = useState(TODAY);
  const [bookingHourlyDate, setBookingHourlyDate] = useState(TODAY);

  // Doctor histogram — period presets
  const [histPeriod, setHistPeriod] = useState<DocPeriod>('today');
  const [histFrom, setHistFrom]     = useState(TODAY);
  const [histTo, setHistTo]         = useState(TODAY);

  // Compute from/to when a preset is picked
  useEffect(() => {
    if (histPeriod === 'custom') return;
    const map: Record<string, { from: string; to: string }> = {
      today: { from: TODAY, to: TODAY },
      '7d':  { from: daysAgo(6),   to: TODAY },
      '30d': { from: daysAgo(29),  to: TODAY },
      '3m':  { from: daysAgo(89),  to: TODAY },
      '12m': { from: daysAgo(364), to: TODAY },
    };
    const d = map[histPeriod];
    if (d) { setHistFrom(d.from); setHistTo(d.to); }
  }, [histPeriod]); // eslint-disable-line react-hooks/exhaustive-deps

  // History tab
  const [historyFrom, setHistoryFrom] = useState(SEVEN_AGO);
  const [historyTo, setHistoryTo]     = useState(TODAY);
  const [historyPage, setHistoryPage] = useState(1);

  // Add-doctor form (staff tab)
  const [docName, setDocName]               = useState('');
  const [docEmail, setDocEmail]             = useState('');
  const [docPhone, setDocPhone]             = useState('');
  const [docPhoneResult, setDocPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [docDeptId, setDocDeptId]           = useState('');
  const [docAvg, setDocAvg]                 = useState(7);
  const [docBusy, setDocBusy]               = useState(false);
  const [departments, setDepartments]       = useState<DepartmentOption[]>([]);
  const [creds, setCreds]                   = useState<DoctorCredentials | null>(null);
  const [toast, setToast]                   = useState<ToastMessage | null>(null);

  // ── Data loaders ──────────────────────────────────────────────────────────

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try { setData(await api<ClinicDashboard>('/clinics/my/dashboard')); }
    catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  const loadAnalytics = useCallback(async (period: BookingPeriod, from?: string, to?: string, hourlyDate?: string) => {
    try {
      let qs: string;
      if (period === 'hourly') {
        qs = `period=hourly&date=${hourlyDate ?? TODAY}`;
      } else if (period === 'custom') {
        qs = `period=daily&from=${from ?? SEVEN_AGO}&to=${to ?? TODAY}`;
      } else {
        const map: Record<string, string> = { '7d': 'period=daily&count=7', '30d': 'period=daily&count=30', '3m': 'period=daily&count=90', '12m': 'period=monthly&count=12' };
        qs = map[period] ?? 'period=daily&count=30';
      }
      setAnalytics(await api<ClinicAnalytics>(`/clinics/my/analytics?${qs}`));
    } catch { /* ignore */ }
  }, []);

  const loadDoctorAnalytics = useCallback(async (from: string, to: string) => {
    try { setDoctorAnalytics(await api<DoctorAnalytics>(`/clinics/my/doctor-analytics?from=${from}&to=${to}`)); }
    catch { /* ignore */ }
  }, []);

  const loadHistory = useCallback(async (from: string, to: string, page: number) => {
    try { setHistory(await api<HistoryResponse>(`/clinics/my/history?from=${from}&to=${to}&page=${page}&limit=100`)); }
    catch { /* ignore */ }
  }, []);

  const loadHistoryAnalytics = useCallback(async (from: string, to: string) => {
    try { setHistoryAnalytics(await api<ClinicAnalytics>(`/clinics/my/analytics?period=daily&from=${from}&to=${to}`)); }
    catch { /* ignore */ }
  }, []);

  const loadDepartments = useCallback(async () => {
    if (departments.length > 0) return;
    try { setDepartments(await api<DepartmentOption[]>('/clinics/my/departments')); }
    catch { /* ignore */ }
  }, [departments.length]);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!ready) return;
    void loadDashboard();
    void loadAnalytics(bookingPeriod, bookingFrom, bookingTo, bookingHourlyDate);
    void loadDoctorAnalytics(histFrom, histTo);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    void loadAnalytics(bookingPeriod, bookingFrom, bookingTo, bookingHourlyDate);
  }, [bookingPeriod, bookingFrom, bookingTo, bookingHourlyDate, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    void loadDoctorAnalytics(histFrom, histTo);
  }, [histFrom, histTo, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || activeTab !== 'history') return;
    void loadHistory(historyFrom, historyTo, historyPage);
    void loadHistoryAnalytics(historyFrom, historyTo);
  }, [activeTab, historyFrom, historyTo, historyPage, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || activeTab !== 'staff') return;
    void loadDepartments();
  }, [activeTab, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      void loadDashboard(true);
      void loadAnalytics(bookingPeriod, bookingFrom, bookingTo, bookingHourlyDate);
    }, 30_000);
    return () => clearInterval(id);
  }, [ready, bookingPeriod, bookingFrom, bookingTo, bookingHourlyDate]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addDoctor(e: React.FormEvent) {
    e.preventDefault();
    if (!docEmail && !docPhoneResult.ok) {
      setToast({ type: 'err', msg: 'Provide either an email or a valid mobile number for the doctor.' });
      return;
    }
    setDocBusy(true);
    try {
      const result = await api<{
        doctor: { id: string; user: { name: string; email: string | null; phone: string | null } };
        tempPassword: string;
      }>('/clinics/my/doctors', {
        method: 'POST',
        body: {
          name: docName,
          email: docEmail || undefined,
          phone: docPhoneResult.e164 || undefined,
          departmentId: docDeptId,
          avgConsultMinutes: docAvg,
        },
      });
      setDocName(''); setDocEmail(''); setDocPhone('');
      setDocPhoneResult({ ok: false }); setDocDeptId(''); setDocAvg(7);
      setCreds({
        role: 'doctor',
        name: result.doctor.user.name,
        email: result.doctor.user.email,
        phone: result.doctor.user.phone,
        tempPassword: result.tempPassword,
      });
      await loadDashboard(true);
    } catch (err) {
      setToast({ type: 'err', msg: err instanceof ApiError ? err.message : 'Failed to add doctor' });
    } finally {
      setDocBusy(false);
    }
  }

  if (!ready || loading) return <PageLoader label="Loading…" />;

  const today   = data?.today ?? { waiting: 0, inConsultation: 0, completed: 0, skipped: 0, cancelled: 0 };
  const doctors = data?.doctors ?? [];
  const histDoctors = doctorAnalytics?.doctors ?? doctors;

  const todayDate = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const refresh = () => {
    void loadDashboard(true);
    void loadAnalytics(bookingPeriod, bookingFrom, bookingTo, bookingHourlyDate);
    void loadDoctorAnalytics(histFrom, histTo);
    if (activeTab === 'history') { void loadHistory(historyFrom, historyTo, historyPage); void loadHistoryAnalytics(historyFrom, historyTo); }
  };

  const tabLabel: Record<Tab, string> = { dashboard: 'Dashboard', queue: 'Live Queue', history: 'History', staff: 'Staff' };

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-900 overflow-hidden">
      <DoctorCredentialsModal credentials={creds} onClose={() => setCreds(null)} />
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      {/* ── Sidebar ── */}
      <aside className="w-16 sm:w-56 flex-shrink-0 bg-slate-900 dark:bg-slate-950 flex flex-col">
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700/60">
          <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center font-bold text-white text-sm shrink-0">CQ</div>
          <span className="hidden sm:block font-semibold text-white text-sm leading-tight">{data?.clinic?.name ?? 'Clinic Queue'}</span>
        </div>
        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {NAV.map(({ label, tab, icon: Icon }) => (
            <button key={tab} type="button" onClick={() => handleTabChange(tab)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                activeTab === tab ? 'bg-teal-600 text-white font-medium' : 'text-slate-400 hover:text-white hover:bg-slate-700/60 cursor-pointer'
              }`}>
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:block">{label}</span>
            </button>
          ))}
          {[{ label: 'Patients', icon: HeartIcon }, { label: 'Settings', icon: GearIcon }].map(({ label, icon: Icon }) => (
            <button key={label} type="button" disabled className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-600 cursor-not-allowed">
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:block">{label}</span>
              <span className="hidden sm:block ml-auto text-[10px] text-slate-600">Soon</span>
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-700/60">
          <a href="/" className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 transition-colors">
            <ArrowLeftIcon className="w-4 h-4 shrink-0" />
            <span className="hidden sm:block">Back to home</span>
          </a>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{tabLabel[activeTab]}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{todayDate}</p>
          </div>
          <button type="button" onClick={refresh} disabled={refreshing}
            className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 font-medium disabled:opacity-50">
            <RefreshIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:block">Refresh</span>
          </button>
        </div>

        {/* ── Dashboard ── */}
        {activeTab === 'dashboard' && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <StatCard label="Waiting"         value={today.waiting}        color="teal"  />
              <StatCard label="In Consultation"  value={today.inConsultation} color="blue"  />
              <StatCard label="Completed"        value={today.completed}      color="green" />
              <StatCard label="Skipped"          value={today.skipped}        color="amber" />
              <StatCard label="Cancelled"        value={today.cancelled}      color="red"   />
            </div>

            {/* Booking Overview */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Booking Overview</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Completed, missed, and cancelled visits over time</p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
                  {(['7d', '30d', '3m', '12m', 'hourly', 'custom'] as BookingPeriod[]).map((p) => (
                    <button key={p} type="button" onClick={() => setBookingPeriod(p)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                        bookingPeriod === p ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}>
                      {p === 'hourly' ? 'Today/hr' : p === 'custom' ? 'Custom' : p === '12m' ? '12 mo' : p === '3m' ? '3 mo' : p}
                    </button>
                  ))}
                </div>
              </div>
              {bookingPeriod === 'custom' && (
                <div className="flex flex-wrap items-center gap-3 mb-3 p-3 bg-slate-50 dark:bg-slate-700/40 rounded-lg">
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    From <input type="date" value={bookingFrom} max={bookingTo} onChange={(e) => setBookingFrom(e.target.value)}
                      className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs" />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    To <input type="date" value={bookingTo} min={bookingFrom} max={TODAY} onChange={(e) => setBookingTo(e.target.value)}
                      className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs" />
                  </label>
                </div>
              )}
              {bookingPeriod === 'hourly' && (
                <div className="flex items-center gap-3 mb-3 p-3 bg-slate-50 dark:bg-slate-700/40 rounded-lg">
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    Date <input type="date" value={bookingHourlyDate} max={TODAY} onChange={(e) => setBookingHourlyDate(e.target.value)}
                      className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs" />
                  </label>
                  <span className="text-xs text-slate-400">Visits distributed by hour of day</span>
                </div>
              )}
              <div className="flex items-center gap-4 mb-3 flex-wrap">
                <LegendDot color="#14b8a6" label="Completed" />
                <LegendDot color="#f59e0b" label="Missed"    />
                <LegendDot color="#ef4444" label="Cancelled" />
              </div>
              <BookingLineChart points={analytics?.points ?? []} />
            </div>

            {/* Doctor Histogram — with period presets */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Breakdown by Doctor</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Completed / Missed / Cancelled / Skipped per doctor</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
                    {(['today', '7d', '30d', '3m', '12m', 'custom'] as DocPeriod[]).map((p) => (
                      <button key={p} type="button" onClick={() => setHistPeriod(p)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                          histPeriod === p ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}>
                        {p === 'today' ? 'Today' : p === 'custom' ? 'Custom' : p === '12m' ? '12 mo' : p === '3m' ? '3 mo' : p}
                      </button>
                    ))}
                  </div>
                  {histPeriod === 'custom' && (
                    <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-700/40 rounded-lg">
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                        From <input type="date" value={histFrom} max={histTo} onChange={(e) => setHistFrom(e.target.value)}
                          className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs" />
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                        To <input type="date" value={histTo} min={histFrom} max={TODAY} onChange={(e) => setHistTo(e.target.value)}
                          className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs" />
                      </label>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 mb-3 flex-wrap">
                <LegendDot color="#14b8a6" label="Completed" />
                <LegendDot color="#f59e0b" label="Missed"    />
                <LegendDot color="#ef4444" label="Cancelled" />
                <LegendDot color="#94a3b8" label="Skipped"   />
              </div>
              <DoctorHistogram doctors={histDoctors} />
            </div>
          </div>
        )}

        {/* ── Queue ── */}
        {activeTab === 'queue' && (
          <div className="px-4 py-5 mx-auto max-w-7xl">
            <QueueManager />
          </div>
        )}

        {/* ── History ── */}
        {activeTab === 'history' && (
          <HistoryTab
            from={historyFrom} to={historyTo} page={historyPage}
            data={history} trendPoints={historyAnalytics?.points ?? []}
            onDateChange={(f, t) => { setHistoryFrom(f); setHistoryTo(t); setHistoryPage(1); }}
            onPageChange={setHistoryPage}
          />
        )}

        {/* ── Staff ── */}
        {activeTab === 'staff' && (
          <div className="p-6 space-y-6">

            {/* Add doctor form */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm mb-4 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-teal-100 text-teal-700 text-xs font-bold">+</span>
                Add doctor
              </h2>
              <form onSubmit={addDoctor} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl">
                <input className="input sm:col-span-2" placeholder="Full name" value={docName} onChange={(e) => setDocName(e.target.value)} required />
                <input className="input" type="email" placeholder="Email (for login)" value={docEmail} onChange={(e) => setDocEmail(e.target.value)} />
                <PhoneInput label={null} value={docPhone} onChange={(raw, result) => { setDocPhone(raw); setDocPhoneResult(result); }} autoComplete="off" />
                <p className="text-[11px] text-slate-400 sm:col-span-2 -mt-1">At least one of email / mobile is required.</p>
                <div className="sm:col-span-2">
                  <DepartmentPicker options={departments} value={docDeptId} onChange={setDocDeptId} required />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <span className="text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">Avg consult time:</span>
                  <input className="input flex-1" type="number" min={1} max={120} value={docAvg}
                    onChange={(e) => setDocAvg(Number(e.target.value))} required />
                  <span className="text-xs text-slate-400 shrink-0">min/patient</span>
                </label>
                <button type="submit" className="btn-primary sm:col-span-2" disabled={docBusy || (!docEmail && !docPhoneResult.ok)}>
                  {docBusy ? 'Adding…' : 'Add doctor'}
                </button>
              </form>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm mb-4">
                Doctors <span className="text-slate-400 font-normal">({doctors.length})</span>
              </h2>
              {doctors.length === 0 ? (
                <p className="text-slate-400 text-sm">No doctors yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {doctors.map((doc) => (
                    <div key={doc.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-sm font-bold text-teal-700 dark:text-teal-300 shrink-0">
                          {doc.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{doc.name}</p>
                          <p className="text-xs text-slate-400 truncate">{doc.department}</p>
                        </div>
                        <div className="ml-auto shrink-0"><DoctorStatusBadge status={doc.status} /></div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center text-xs pt-1 border-t border-slate-100 dark:border-slate-700">
                        <div><p className="text-emerald-600 font-bold text-base">{doc.completed}</p><p className="text-slate-400">Done</p></div>
                        <div><p className="text-amber-600 font-bold text-base">{doc.missed}</p><p className="text-slate-400">Missed</p></div>
                        <div><p className="text-rose-600 font-bold text-base">{doc.cancelled}</p><p className="text-slate-400">Cancel</p></div>
                        <div><p className="text-slate-500 font-bold text-base">{doc.skipped}</p><p className="text-slate-400">Skip</p></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center text-xs">
                        <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg p-2">
                          <p className="text-teal-700 dark:text-teal-300 font-bold">{doc.waiting}</p><p className="text-slate-400">Waiting</p>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2">
                          <p className="text-blue-700 dark:text-blue-300 font-bold">{doc.inConsultation ? '1' : '0'}</p><p className="text-slate-400">In consult</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── History Tab (redesigned) ─────────────────────────────────────────────────

type HistorySubTab = 'entries' | 'by-doctor';
type StatusFilter  = 'ALL' | 'COMPLETED' | 'MISSED' | 'CANCELLED' | 'SKIPPED';

function HistoryTab({
  from, to, page, data, trendPoints,
  onDateChange, onPageChange,
}: {
  from: string; to: string; page: number;
  data: HistoryResponse | null;
  trendPoints: AnalyticsPoint[];
  onDateChange: (f: string, t: string) => void;
  onPageChange: (p: number) => void;
}) {
  const [subTab, setSubTab]           = useState<HistorySubTab>('entries');
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [doctorFilter, setDoctorFilter] = useState('ALL');

  const summary = data?.summary ?? { completed: 0, missed: 0, cancelled: 0, skipped: 0, total: 0 };

  const presets = [
    { label: 'Today', from: TODAY,       to: TODAY },
    { label: '7d',    from: daysAgo(6),  to: TODAY },
    { label: '30d',   from: daysAgo(29), to: TODAY },
    { label: '3 mo',  from: daysAgo(89), to: TODAY },
  ];

  // Build doctor list for filter dropdown
  const allDoctors = Array.from(new Map((data?.entries ?? []).map((e) => [e.doctor.name, e.doctor.name])).entries()).map(([v]) => v).sort();

  // Client-side filtering
  const filtered = (data?.entries ?? []).filter((e) => {
    if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
    if (doctorFilter !== 'ALL' && e.doctor.name !== doctorFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.patient.name.toLowerCase().includes(q) && !e.doctor.name.toLowerCase().includes(q) && !e.doctor.department.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const statusColors: Record<string, string> = {
    COMPLETED: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30',
    MISSED:    'text-amber-700 bg-amber-50 dark:bg-amber-900/30',
    CANCELLED: 'text-rose-700 bg-rose-50 dark:bg-rose-900/30',
    SKIPPED:   'text-slate-600 bg-slate-100 dark:bg-slate-700',
  };

  const statusBtns: { value: StatusFilter; label: string; color: string }[] = [
    { value: 'ALL',       label: 'All',       color: 'bg-slate-700 text-white' },
    { value: 'COMPLETED', label: 'Completed', color: 'bg-emerald-600 text-white' },
    { value: 'MISSED',    label: 'Missed',    color: 'bg-amber-500 text-white' },
    { value: 'CANCELLED', label: 'Cancelled', color: 'bg-rose-500 text-white' },
    { value: 'SKIPPED',   label: 'Skipped',   color: 'bg-slate-500 text-white' },
  ];

  const hasFilters = search || statusFilter !== 'ALL' || doctorFilter !== 'ALL';

  return (
    <div className="p-6 space-y-5">

      {/* ── Filter bar ── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Date presets */}
          <div className="flex gap-1">
            {presets.map((pr) => (
              <button key={pr.label} type="button" onClick={() => onDateChange(pr.from, pr.to)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  from === pr.from && to === pr.to
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}>{pr.label}</button>
            ))}
          </div>
          {/* Custom date range */}
          <div className="flex items-center gap-1.5 ml-2">
            <input type="date" value={from} max={to} onChange={(e) => onDateChange(e.target.value, to)}
              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs" />
            <span className="text-slate-400 text-xs">→</span>
            <input type="date" value={to} min={from} max={TODAY} onChange={(e) => onDateChange(from, e.target.value)}
              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs" />
          </div>
          {/* Search */}
          <div className="flex items-center gap-2 ml-auto flex-1 min-w-[160px] max-w-xs">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text" placeholder="Search patient, doctor…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
            {hasFilters && (
              <button type="button" onClick={() => { setSearch(''); setStatusFilter('ALL'); setDoctorFilter('ALL'); }}
                className="text-xs text-rose-500 hover:text-rose-600 whitespace-nowrap">Clear</button>
            )}
          </div>
        </div>

        {/* Status + doctor filters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Status:</span>
          <div className="flex gap-1 flex-wrap">
            {statusBtns.map(({ value, label, color }) => (
              <button key={value} type="button" onClick={() => setStatusFilter(value)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-opacity ${
                  statusFilter === value ? color : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                }`}>{label}</button>
            ))}
          </div>
          {allDoctors.length > 0 && (
            <>
              <span className="text-xs text-slate-400 font-medium ml-2">Doctor:</span>
              <select value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}
                className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs">
                <option value="ALL">All doctors</option>
                {allDoctors.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </>
          )}
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Total"     value={summary.total}     color="teal"  />
        <StatCard label="Completed" value={summary.completed} color="green" />
        <StatCard label="Missed"    value={summary.missed}    color="amber" />
        <StatCard label="Cancelled" value={summary.cancelled} color="red"   />
        <StatCard label="Skipped"   value={summary.skipped}   color="slate" />
      </div>

      {/* ── Trend chart ── */}
      {trendPoints.length > 1 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Visit Trend</h3>
            <div className="flex items-center gap-3">
              <LegendDot color="#14b8a6" label="Completed" />
              <LegendDot color="#f59e0b" label="Missed"    />
              <LegendDot color="#ef4444" label="Cancelled" />
            </div>
          </div>
          <BookingLineChart points={trendPoints} />
        </div>
      )}

      {/* ── Sub-tabs ── */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        {([['entries', `Visit Entries${hasFilters ? ` (${filtered.length})` : ''}`], ['by-doctor', 'By Doctor']] as [HistorySubTab, string][]).map(([t, label]) => (
          <button key={t} type="button" onClick={() => setSubTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              subTab === t ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}>{label}</button>
        ))}
      </div>

      {/* ── Entries table ── */}
      {subTab === 'entries' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              {hasFilters ? 'No entries match your filters.' : 'No visit records for this period.'}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-700/40">
                    <tr>
                      {['Token', 'Date', 'Patient', 'Phone', 'Doctor', 'Dept', 'Status'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {filtered.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">#{e.tokenNumber}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{e.serviceDay}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">{e.patient.name}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap font-mono">{e.patient.phone}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{e.doctor.name}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{e.doctor.department}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[e.status] ?? 'text-slate-500 bg-slate-100'}`}>
                            {e.status.charAt(0) + e.status.slice(1).toLowerCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination — only shown when not filtered client-side */}
              {!hasFilters && data && data.pages > 1 && (
                <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-xs text-slate-500">{data.total} total entries</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => onPageChange(data.page - 1)} disabled={data.page <= 1}
                      className="px-3 py-1 rounded-lg text-xs border border-slate-200 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">← Prev</button>
                    <span className="text-xs text-slate-500">{data.page} / {data.pages}</span>
                    <button type="button" onClick={() => onPageChange(data.page + 1)} disabled={data.page >= data.pages}
                      className="px-3 py-1 rounded-lg text-xs border border-slate-200 dark:border-slate-600 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">Next →</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── By Doctor ── */}
      {subTab === 'by-doctor' && (
        <ByDoctorView entries={filtered} />
      )}
    </div>
  );
}

// ─── By Doctor view — table + bar chart ──────────────────────────────────────

function ByDoctorView({ entries }: { entries: HistoryEntry[] }) {
  type DRow = { name: string; department: string; completed: number; missed: number; cancelled: number; skipped: number };

  const docMap = new Map<string, DRow>();
  for (const e of entries) {
    if (!docMap.has(e.doctor.name)) docMap.set(e.doctor.name, { name: e.doctor.name, department: e.doctor.department, completed: 0, missed: 0, cancelled: 0, skipped: 0 });
    const d = docMap.get(e.doctor.name)!;
    if (e.status === 'COMPLETED') d.completed++;
    else if (e.status === 'MISSED') d.missed++;
    else if (e.status === 'CANCELLED') d.cancelled++;
    else if (e.status === 'SKIPPED') d.skipped++;
  }
  const rows = Array.from(docMap.values()).sort((a, b) => (b.completed + b.missed) - (a.completed + a.missed));

  if (rows.length === 0) return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 py-16 text-center text-slate-400 text-sm">
      No data for this period.
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Mini bar chart */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          <LegendDot color="#14b8a6" label="Completed" />
          <LegendDot color="#f59e0b" label="Missed"    />
          <LegendDot color="#ef4444" label="Cancelled" />
          <LegendDot color="#94a3b8" label="Skipped"   />
        </div>
        <DoctorHistogram doctors={rows as DoctorAnalyticsRow[]} />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/40">
              <tr>
                {['Doctor', 'Department', 'Completed', 'Missed', 'Cancelled', 'Skipped', 'Total'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {rows.map((r) => (
                <tr key={r.name} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-3.5 font-medium text-slate-800 dark:text-slate-100">{r.name}</td>
                  <td className="px-4 py-3.5 text-slate-400 text-xs">{r.department}</td>
                  <td className="px-4 py-3.5 text-center font-semibold text-emerald-600">{r.completed}</td>
                  <td className="px-4 py-3.5 text-center font-semibold text-amber-600">{r.missed}</td>
                  <td className="px-4 py-3.5 text-center font-semibold text-rose-600">{r.cancelled}</td>
                  <td className="px-4 py-3.5 text-center font-semibold text-slate-500">{r.skipped}</td>
                  <td className="px-4 py-3.5 text-center font-semibold text-slate-800 dark:text-slate-100">{r.completed + r.missed + r.cancelled + r.skipped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const cls: Record<string, string> = {
    teal:  'bg-teal-50 dark:bg-teal-900/20 border-teal-100 dark:border-teal-800/40 text-teal-700 dark:text-teal-300',
    blue:  'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/40 text-blue-700 dark:text-blue-300',
    green: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/40 text-amber-700 dark:text-amber-300',
    red:   'bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800/40 text-rose-700 dark:text-rose-300',
    slate: 'bg-slate-50 dark:bg-slate-700/40 border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300',
  };
  return (
    <div className={`rounded-xl border p-4 ${cls[color] ?? cls.slate}`}>
      <p className="text-xs font-medium opacity-70 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}

function DoctorStatusBadge({ status }: { status: string }) {
  if (status === 'AVAILABLE')
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Available</span>;
  if (status === 'PAUSED')
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Break</span>;
  return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Offline</span>;
}

// ─── Booking Overview — multi-series line chart ───────────────────────────────

interface LineTooltip { idx: number; screenX: number; screenY: number }

function BookingLineChart({ points }: { points: AnalyticsPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<LineTooltip | null>(null);

  if (!points.length) {
    return <div className="h-40 flex items-center justify-center text-slate-400 text-sm">No data yet — visit data will appear here.</div>;
  }

  const W = 700; const H = 200;
  const pad = { t: 10, r: 20, b: 36, l: 36 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;

  const maxVal = Math.max(...points.flatMap((p) => [p.completed, p.missed, p.cancelled]), 1);
  const step   = cW / Math.max(points.length - 1, 1);
  const toX    = (i: number) => pad.l + i * step;
  const toY    = (v: number) => pad.t + cH - (v / maxVal) * cH;

  const tickCount = Math.min(maxVal, 5);
  const yTicks = [...new Set(Array.from({ length: tickCount + 1 }, (_, i) => Math.round((maxVal * i) / tickCount)))];

  const line = (key: 'completed' | 'missed' | 'cancelled') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p[key]).toFixed(1)}`).join(' ');

  const series: Array<{ key: 'completed' | 'missed' | 'cancelled'; color: string }> = [
    { key: 'completed', color: '#14b8a6' },
    { key: 'missed',    color: '#f59e0b' },
    { key: 'cancelled', color: '#ef4444' },
  ];

  const labelEvery = points.length > 20 ? Math.ceil(points.length / 10) : 1;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const idx  = Math.max(0, Math.min(points.length - 1, Math.round(relX * (points.length - 1))));
    setTip({ idx, screenX: e.clientX - rect.left, screenY: e.clientY - rect.top });
  };

  const tipPoint = tip !== null ? points[tip.idx] : null;

  return (
    <div className="relative" onMouseLeave={() => setTip(null)}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair"
        preserveAspectRatio="none" onMouseMove={handleMouseMove}>
        {yTicks.map((v) => {
          const y = toY(v);
          return <g key={v}>
            <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" />
            <text x={pad.l - 4} y={y + 4} textAnchor="end" className="fill-slate-400" fontSize="9">{v}</text>
          </g>;
        })}
        {tip !== null && (
          <line x1={toX(tip.idx)} y1={pad.t} x2={toX(tip.idx)} y2={pad.t + cH}
            stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="4 2" />
        )}
        {series.map(({ key, color }) => (
          <path key={key} d={line(key)} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {series.map(({ key, color }) =>
          points.map((p, i) => (
            <circle key={`${key}-${i}`} cx={toX(i)} cy={toY(p[key])} r={tip?.idx === i ? 4 : 2.5}
              fill={color} stroke="white" strokeWidth="1.5" style={{ transition: 'r 0.1s' }} />
          ))
        )}
        {points.map((p, i) => i % labelEvery === 0 && (
          <text key={p.date} x={toX(i)} y={H - 4} textAnchor="middle" className="fill-slate-400" fontSize="8">{p.label}</text>
        ))}
      </svg>
      {tip !== null && tipPoint && (
        <div className="absolute pointer-events-none z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg px-3 py-2 text-xs"
          style={{ left: tip.screenX > 500 ? tip.screenX - 140 : tip.screenX + 12, top: Math.max(4, tip.screenY - 60) }}>
          <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{tipPoint.label}</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500" />Completed</span><span className="font-bold text-teal-600">{tipPoint.completed}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Missed</span><span className="font-bold text-amber-600">{tipPoint.missed}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Cancelled</span><span className="font-bold text-red-600">{tipPoint.cancelled}</span></div>
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-700 pt-1 mt-1"><span className="text-slate-500">Total</span><span className="font-bold text-slate-700 dark:text-slate-200">{tipPoint.total}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Doctor histogram — grouped bar chart ─────────────────────────────────────

interface BarTooltip { doctorIdx: number; screenX: number; screenY: number }

function DoctorHistogram({ doctors }: { doctors: (DashboardDoctor | DoctorAnalyticsRow)[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<BarTooltip | null>(null);

  if (!doctors.length) {
    return <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No doctors added yet.</div>;
  }

  const W = 700; const H = 220;
  const pad = { t: 10, r: 20, b: 54, l: 36 };
  const cW  = W - pad.l - pad.r;
  const cH  = H - pad.t - pad.b;

  const BARS: Array<{ key: keyof DoctorAnalyticsRow; color: string; label: string }> = [
    { key: 'completed', color: '#14b8a6', label: 'Completed' },
    { key: 'missed',    color: '#f59e0b', label: 'Missed'    },
    { key: 'cancelled', color: '#ef4444', label: 'Cancelled' },
    { key: 'skipped',   color: '#94a3b8', label: 'Skipped'   },
  ];
  const barW       = Math.min(12, Math.floor((cW / doctors.length - 8) / BARS.length));
  const gap        = Math.max(2, Math.floor(barW * 0.35));
  const groupW     = BARS.length * barW + (BARS.length - 1) * gap;
  const docSpacing = cW / doctors.length;

  const getVal = (d: DashboardDoctor | DoctorAnalyticsRow, key: string) =>
    (d as unknown as Record<string, number>)[key] ?? 0;

  const maxVal    = Math.max(...doctors.flatMap((d) => BARS.map(({ key }) => getVal(d, key as string))), 1);
  const tickCount = Math.min(maxVal, 5);
  const yTicks    = [...new Set(Array.from({ length: tickCount + 1 }, (_, i) => Math.round((maxVal * i) / tickCount)))];
  const toY       = (v: number) => pad.t + cH - (v / maxVal) * cH;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const idx  = Math.max(0, Math.min(doctors.length - 1, Math.floor((svgX - pad.l) / docSpacing)));
    setTip({ doctorIdx: idx, screenX: e.clientX - rect.left, screenY: e.clientY - rect.top });
  };

  const tipDoc = tip !== null ? doctors[tip.doctorIdx] : null;

  return (
    <div className="relative" onMouseLeave={() => setTip(null)}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair"
        preserveAspectRatio="none" onMouseMove={handleMouseMove}>
        {yTicks.map((v) => {
          const y = toY(v);
          return <g key={v}>
            <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" />
            <text x={pad.l - 4} y={y + 4} textAnchor="end" className="fill-slate-400" fontSize="9">{v}</text>
          </g>;
        })}
        {tip !== null && (
          <rect x={pad.l + tip.doctorIdx * docSpacing} y={pad.t} width={docSpacing} height={cH}
            fill="currentColor" fillOpacity="0.04" />
        )}
        {doctors.map((doc, di) => {
          const cx        = pad.l + di * docSpacing + docSpacing / 2;
          const groupLeft = cx - groupW / 2;
          const nameLabel = doc.name.length > 10 ? doc.name.split(' ').map((w) => w[0]).join('') : doc.name.split(' ')[0];
          return (
            <g key={(doc as DoctorAnalyticsRow).id ?? doc.name}>
              {BARS.map(({ key, color }, bi) => {
                const val  = getVal(doc, key as string);
                const barH = val > 0 ? Math.max((val / maxVal) * cH, 3) : 0;
                const x    = groupLeft + bi * (barW + gap);
                const y    = pad.t + cH - barH;
                return (
                  <g key={key}>
                    <rect x={x} y={y} width={barW} height={barH} fill={color} rx="2"
                      opacity={tip?.doctorIdx === di ? 1 : 0.82} />
                    {val > 0 && barH > 16 && (
                      <text x={x + barW / 2} y={y + 11} textAnchor="middle" className="fill-white" fontSize="7" fontWeight="600">{val}</text>
                    )}
                  </g>
                );
              })}
              <text x={cx} y={H - 22} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" fontSize="8" fontWeight="500">{nameLabel}</text>
              <text x={cx} y={H - 10} textAnchor="middle" className="fill-slate-400 dark:fill-slate-500" fontSize="7">{doc.department?.slice(0, 8)}</text>
            </g>
          );
        })}
      </svg>
      {tip !== null && tipDoc && (
        <div className="absolute pointer-events-none z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg px-3 py-2 text-xs min-w-[150px]"
          style={{ left: tip.screenX > 500 ? tip.screenX - 170 : tip.screenX + 12, top: Math.max(4, tip.screenY - 80) }}>
          <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1.5 truncate">{tipDoc.name}</p>
          <p className="text-slate-400 text-[10px] mb-1.5">{tipDoc.department}</p>
          <div className="space-y-1">
            {BARS.map(({ key, color, label }) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />{label}</span>
                <span className="font-bold" style={{ color }}>{(tipDoc as unknown as Record<string, number>)[key as string] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function GridIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>;
}
function ListIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>;
}
function ClockIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v6l4 2" /></svg>;
}
function UsersIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
}
function HeartIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>;
}
function CoinIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v2m0 8v2M9.5 9.5a2.5 2.5 0 015 0c0 3.5-5 4-5 6.5a2.5 2.5 0 005 0" /></svg>;
}
function GearIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" /></svg>;
}
function RefreshIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
}
function ArrowLeftIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>;
}
function SearchIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
}
