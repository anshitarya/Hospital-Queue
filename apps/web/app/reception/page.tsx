'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ProfileMenu } from '@/components/ProfileMenu';
import { DarkModeToggle } from '@/components/DarkModeToggle';
import { getLabels, DEPARTMENT_PRESETS, type BusinessType } from '@/lib/labels';
import { HOSPITAL_DEPARTMENTS } from '@/lib/config';
import { useRequireRole } from '@/lib/useRequireRole';
import { PageLoader } from '@/components/PageLoader';
import { QueueManager } from '@/components/QueueManager';
import { Toast, type ToastMessage } from '@/components/Toast';
import { DepartmentPicker, type DepartmentOption } from '@/components/DepartmentPicker';
import { PhoneInput, type PhoneValidationResult } from '@/components/PhoneInput';
import { DoctorCredentialsModal, type DoctorCredentials } from '@/components/DoctorCredentialsModal';
import { TurnosIcon } from '@/components/Icons';
import { ReviewFormButton } from '@/components/ReviewFormButton';

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
  serviceDay: string; joinedAt: string; completedAt: string | null;
  consultMinutes: number | null;
  patient: { name: string; phone: string };
  doctor: { name: string; department: string };
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDuration(mins: number | null | undefined): string {
  if (mins == null) return '—';
  if (mins < 1) return '<1 min';
  return `${mins} min`;
}

const HISTORY_STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30',
  MISSED:    'text-amber-700 bg-amber-50 dark:bg-amber-900/30',
  CANCELLED: 'text-rose-700 bg-rose-50 dark:bg-rose-900/30',
  SKIPPED:   'text-slate-600 bg-slate-100 dark:bg-slate-700',
};

function HistoryEntriesTable({
  entries,
  labels: L,
  showProvider = true,
}: {
  entries: HistoryEntry[];
  labels: ReturnType<typeof getLabels>;
  showProvider?: boolean;
}) {
  const columns = [
    'Token', 'Date', 'Time', L.customer, 'Phone',
    ...(showProvider ? [L.provider] : []),
    'Time taken', 'Status',
  ];

  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400 text-sm">No visit records.</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-700/40">
          <tr>
            {columns.map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {entries.map((e) => (
            <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
              <td className="px-4 py-3 text-slate-500 font-mono text-xs">#{e.tokenNumber}</td>
              <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDate(e.serviceDay)}</td>
              <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{fmtTime(e.joinedAt)}</td>
              <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">{e.patient.name}</td>
              <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap font-mono">{e.patient.phone}</td>
              {showProvider && (
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{e.doctor.name}</td>
              )}
              <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDuration(e.consultMinutes)}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${HISTORY_STATUS_COLORS[e.status] ?? 'text-slate-500 bg-slate-100'}`}>
                  {e.status.charAt(0) + e.status.slice(1).toLowerCase()}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface HistorySummary { completed: number; missed: number; cancelled: number; skipped: number; total: number }
interface HistoryResponse {
  entries: HistoryEntry[]; total: number; page: number; pages: number;
  summary: HistorySummary;
}
interface ClinicDashboard {
  clinic: { id: string; name: string; address?: string; businessType?: string | null };
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
  const { user } = useAuth();

  // ── Tab — persisted in localStorage so refresh keeps the user here ──
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  useEffect(() => {
    const saved = localStorage.getItem('turnos_reception_tab');
    if (saved && VALID_TABS.includes(saved as Tab)) setActiveTab(saved as Tab);
  }, []);
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    localStorage.setItem('turnos_reception_tab', tab);
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
    try {
      const btype = (data?.clinic?.businessType ?? 'CLINIC') as BusinessType;
      const presets = DEPARTMENT_PRESETS[btype] ?? [];
      if (btype !== 'CLINIC' && presets.length > 0) {
        // Non-clinic: show only business-specific presets, not medical DB ones
        setDepartments(presets.map((p) => ({ id: `__new__${p}`, name: p })));
      } else {
        // CLINIC: fetch from DB (seeded medical departments)
        const fromDb = await api<DepartmentOption[]>('/clinics/my/departments');
        setDepartments(fromDb.length > 0 ? fromDb : HOSPITAL_DEPARTMENTS.map((n) => ({ id: `__new__${n}`, name: n })));
      }
    } catch { /* ignore */ }
  }, [departments.length, data?.clinic?.businessType]); // eslint-disable-line react-hooks/exhaustive-deps

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
      let deptId = docDeptId;
      if (deptId.startsWith('__new__')) {
        const deptName = deptId.replace('__new__', '');
        const created = await api<{ id: string; name: string }>('/clinics/my/departments', {
          method: 'POST',
          body: { name: deptName },
        });
        deptId = created.id;
        setDepartments((prev) => prev.map((d) => d.id === docDeptId ? { ...d, id: created.id } : d));
      }
      const result = await api<{
        doctor: { id: string; user: { name: string; email: string | null; phone: string | null } };
        tempPassword: string;
      }>('/clinics/my/doctors', {
        method: 'POST',
        body: {
          name: docName,
          email: docEmail || undefined,
          phone: docPhoneResult.e164 || undefined,
          departmentId: deptId,
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

  const L = getLabels(data?.clinic?.businessType);

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
    <div className="flex h-screen bg-slate-50 dark:bg-[#0a0a0b] overflow-hidden">
      <DoctorCredentialsModal credentials={creds} onClose={() => setCreds(null)} />
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      {/* ── Sidebar ── */}
      <aside className="w-16 sm:w-60 flex-shrink-0 bg-slate-950 dark:bg-black flex flex-col border-r border-slate-800/60">
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-800/60">
          <TurnosIcon className="w-8 h-8 shrink-0" />
          <div className="hidden sm:block min-w-0">
            <div className="font-semibold text-white text-sm leading-tight truncate">{data?.clinic?.name ?? 'Turnos'}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Reception</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-0.5">
          {NAV.map(({ label, tab, icon: Icon }) => (
            <button key={tab} type="button" onClick={() => handleTabChange(tab)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                activeTab === tab
                  ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/6 cursor-pointer'
              }`}>
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:block">{label}</span>
              {activeTab === tab && <span className="hidden sm:block ml-auto w-1.5 h-1.5 rounded-full bg-brand-400" />}
            </button>
          ))}

          <div className="pt-2 mt-2 border-t border-slate-800/60">
            {[{ label: L.customerPlural, icon: HeartIcon }, { label: 'Settings', icon: GearIcon }].map(({ label, icon: Icon }) => (
              <button key={label} type="button" disabled
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-600 cursor-not-allowed">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden sm:block">{label}</span>
                <span className="hidden sm:block ml-auto text-[10px] text-slate-700 bg-slate-800 px-1.5 py-0.5 rounded-md">Soon</span>
              </button>
            ))}
          </div>
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-slate-800/60">
          <div className="hidden sm:flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors group">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {(user?.name ?? 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-slate-300 truncate">{user?.name ?? 'User'}</div>
              <div className="text-[10px] text-slate-500 truncate">{user?.email ?? user?.phone ?? ''}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white/90 dark:bg-[#0a0a0b]/90 backdrop-blur-sm border-b border-slate-200/60 dark:border-slate-800/60 px-5 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-800 dark:text-slate-100 tracking-tight">{tabLabel[activeTab]}</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{todayDate}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={refresh} disabled={refreshing}
              className={`btn-icon ${refreshing ? 'opacity-50' : ''}`} title="Refresh">
              <RefreshIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <DarkModeToggle />
            <ReviewFormButton />
            <ProfileMenu />
          </div>
        </div>

        {/* ── Dashboard ── */}
        {activeTab === 'dashboard' && (
          <div className="p-5 sm:p-6 space-y-5">
            {/* Today's stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <StatCard label="Waiting"         value={today.waiting}        color="teal"  />
              <StatCard label={L.inService}      value={today.inConsultation} color="blue"  />
              <StatCard label="Completed"        value={today.completed}      color="green" />
              <StatCard label="Skipped"          value={today.skipped}        color="amber" />
              <StatCard label="Cancelled"        value={today.cancelled}      color="red"   />
            </div>

            {/* Booking Overview */}
            <div className="card p-5">
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
            <div className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Breakdown by {L.provider}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Completed / Missed / Cancelled / Skipped per {L.provider.toLowerCase()}</p>
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
          <div className="p-4 sm:p-5 mx-auto max-w-7xl">
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
            onRefresh={() => { void loadHistory(historyFrom, historyTo, historyPage); void loadHistoryAnalytics(historyFrom, historyTo); }}
            labels={L}
          />
        )}

        {/* ── Staff ── */}
        {activeTab === 'staff' && (
          <div className="p-5 sm:p-6 space-y-5">

            {/* Add doctor form */}
            <div className="card p-5">
              <h2 className="section-title mb-4 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400 text-sm font-bold">+</span>
                Add {L.provider.toLowerCase()}
              </h2>
              <form onSubmit={addDoctor} className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                <input className="input sm:col-span-2" placeholder="Full name" value={docName} onChange={(e) => setDocName(e.target.value)} required />
                <input className="input" type="email" placeholder="Email (for login)" value={docEmail} onChange={(e) => setDocEmail(e.target.value)} />
                <PhoneInput label={null} value={docPhone} onChange={(raw, result) => { setDocPhone(raw); setDocPhoneResult(result); }} autoComplete="off" />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 sm:col-span-2 -mt-1">At least one of email / mobile is required.</p>
                <div className="sm:col-span-2">
                  <DepartmentPicker options={departments} value={docDeptId} onChange={setDocDeptId} required />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <span className="text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0">Avg {L.service.toLowerCase()} time:</span>
                  <input className="input flex-1" type="number" min={1} max={120} value={docAvg}
                    onChange={(e) => setDocAvg(Number(e.target.value))} required />
                  <span className="text-xs text-slate-400 shrink-0">{L.perCustomer}</span>
                </label>
                <button type="submit" className="btn-primary sm:col-span-2" disabled={docBusy || (!docEmail && !docPhoneResult.ok)}>
                  {docBusy ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Adding…
                    </span>
                  ) : `Add ${L.provider.toLowerCase()}`}
                </button>
              </form>
            </div>

            {/* Doctor list */}
            <div className="card p-5">
              <h2 className="section-title mb-4">
                {L.providerPlural}
                <span className="ml-2 text-slate-400 dark:text-slate-500 font-normal text-sm">({doctors.length})</span>
              </h2>
              {doctors.length === 0 ? (
                <div className="py-8 flex flex-col items-center text-center">
                  <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                    <UsersIcon className="w-7 h-7" />
                  </div>
                  <p className="font-semibold text-slate-600 dark:text-slate-300 text-sm">No {L.providerPlural.toLowerCase()} yet</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Use the form above to add your first {L.provider.toLowerCase()}.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {doctors.map((doc) => (
                    <div key={doc.id} className="card-hover p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-100 to-emerald-100 dark:from-brand-900/40 dark:to-emerald-900/40 flex items-center justify-center text-sm font-bold text-brand-700 dark:text-brand-400 shrink-0">
                          {doc.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{doc.name}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{doc.department}</p>
                        </div>
                        <div className="shrink-0"><DoctorStatusBadge status={doc.status} /></div>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 text-center text-xs pt-2 border-t border-slate-100 dark:border-slate-800/60">
                        <div className="space-y-0.5">
                          <p className="text-emerald-600 dark:text-emerald-400 font-bold text-base leading-none">{doc.completed}</p>
                          <p className="text-slate-400 dark:text-slate-500">Done</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-amber-600 dark:text-amber-400 font-bold text-base leading-none">{doc.missed}</p>
                          <p className="text-slate-400 dark:text-slate-500">Missed</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-rose-600 dark:text-rose-400 font-bold text-base leading-none">{doc.cancelled}</p>
                          <p className="text-slate-400 dark:text-slate-500">Cancel</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-slate-500 dark:text-slate-400 font-bold text-base leading-none">{doc.skipped}</p>
                          <p className="text-slate-400 dark:text-slate-500">Skip</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center text-xs">
                        <div className="card-inset p-2 rounded-xl">
                          <p className="text-brand-700 dark:text-brand-400 font-bold">{doc.waiting}</p>
                          <p className="text-slate-400 dark:text-slate-500">Waiting</p>
                        </div>
                        <div className="card-inset p-2 rounded-xl">
                          <p className="text-blue-700 dark:text-blue-400 font-bold">{doc.inConsultation ? '1' : '0'}</p>
                          <p className="text-slate-400 dark:text-slate-500">In {L.service.toLowerCase()}</p>
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

// ─── Print helper ─────────────────────────────────────────────────────────────

function printHistory(entries: HistoryEntry[], L: ReturnType<typeof getLabels>, from: string, to: string) {
  const rows = entries.map((e) => `
    <tr>
      <td>#${e.tokenNumber}</td>
      <td>${e.serviceDay}</td>
      <td>${e.patient.name}</td>
      <td>${e.patient.phone}</td>
      <td>${e.doctor.name}</td>
      <td>${e.doctor.department}</td>
      <td>${fmtDuration(e.consultMinutes)}</td>
      <td>${e.status.charAt(0) + e.status.slice(1).toLowerCase()}</td>
    </tr>`).join('');

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Visit History ${from} to ${to}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 24px; }
    h2 { font-size: 16px; margin-bottom: 4px; }
    p  { color: #64748b; margin-bottom: 16px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 6px 10px; background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
    tr:last-child td { border-bottom: none; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h2>Visit History</h2>
  <p>${from === to ? from : `${from} → ${to}`} · ${entries.length} record${entries.length !== 1 ? 's' : ''}</p>
  <table>
    <thead><tr>
      <th>Token</th><th>Date</th><th>${L.customer}</th><th>Phone</th><th>${L.provider}</th><th>Time taken</th><th>Status</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`);
  win.document.close();
}

// ─── History Tab (redesigned) ─────────────────────────────────────────────────

type HistorySubTab = 'entries' | 'by-doctor';
type StatusFilter  = 'ALL' | 'COMPLETED' | 'MISSED' | 'CANCELLED' | 'SKIPPED';

function HistoryTab({
  from, to, page, data, trendPoints,
  onDateChange, onPageChange, onRefresh, labels: L,
}: {
  from: string; to: string; page: number;
  data: HistoryResponse | null;
  trendPoints: AnalyticsPoint[];
  onDateChange: (f: string, t: string) => void;
  onPageChange: (p: number) => void;
  onRefresh: () => void;
  labels: ReturnType<typeof getLabels>;
}) {
  const [subTab, setSubTab]           = useState<HistorySubTab>('entries');
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedOfficer, setSelectedOfficer] = useState<string>('ALL');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const summary = data?.summary ?? { completed: 0, missed: 0, cancelled: 0, skipped: 0, total: 0 };

  const presets = [
    { label: 'Today', from: TODAY,       to: TODAY },
    { label: '7d',    from: daysAgo(6),  to: TODAY },
    { label: '30d',   from: daysAgo(29), to: TODAY },
    { label: '3 mo',  from: daysAgo(89), to: TODAY },
  ];

  // Build doctor list for officer pills
  const officerGroups = useMemo(
    () => buildOfficerGroups(data?.entries ?? []),
    [data?.entries],
  );

  useEffect(() => {
    if (selectedOfficer === 'ALL') return;
    if (!officerGroups.some((g) => g.name === selectedOfficer)) {
      setSelectedOfficer('ALL');
    }
  }, [officerGroups, selectedOfficer]);

  // Client-side filtering
  const filtered = (data?.entries ?? []).filter((e) => {
    if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
    if (selectedOfficer !== 'ALL' && e.doctor.name !== selectedOfficer) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.patient.name.toLowerCase().includes(q) && !e.doctor.name.toLowerCase().includes(q) && !e.doctor.department.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const filteredGroups = useMemo(() => {
    const groups = buildOfficerGroups(filtered);
    return selectedOfficer === 'ALL'
      ? groups
      : groups.filter((g) => g.name === selectedOfficer);
  }, [filtered, selectedOfficer]);

  const statusBtns: { value: StatusFilter; label: string; color: string }[] = [
    { value: 'ALL',       label: 'All',       color: 'bg-slate-700 text-white' },
    { value: 'COMPLETED', label: 'Completed', color: 'bg-emerald-600 text-white' },
    { value: 'MISSED',    label: 'Missed',    color: 'bg-amber-500 text-white' },
    { value: 'CANCELLED', label: 'Cancelled', color: 'bg-rose-500 text-white' },
    { value: 'SKIPPED',   label: 'Skipped',   color: 'bg-slate-500 text-white' },
  ];

  const hasFilters = search || statusFilter !== 'ALL' || selectedOfficer !== 'ALL';

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
                type="text" placeholder={`Search ${L.customer.toLowerCase()}, ${L.provider.toLowerCase()}…`} value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
            {hasFilters && (
              <button type="button" onClick={() => { setSearch(''); setStatusFilter('ALL'); setSelectedOfficer('ALL'); }}
                className="text-xs text-rose-500 hover:text-rose-600 whitespace-nowrap">Clear</button>
            )}
          </div>
        </div>

        {/* Status filters */}
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
        {([['entries', `Visit Entries${hasFilters ? ` (${filtered.length})` : ''}`], ['by-doctor', `By ${L.provider}`]] as [HistorySubTab, string][]).map(([t, label]) => (
          <button key={t} type="button" onClick={() => setSubTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              subTab === t ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}>{label}</button>
        ))}
        <div className="ml-auto pb-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => printHistory(filtered, L, from, to)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
          >
            <PrintIcon className="w-3.5 h-3.5" />
            Print
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-lg transition-colors"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            Delete period
          </button>
        </div>
      </div>

      {/* ── Delete confirmation modal ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl ring-1 ring-slate-200 dark:ring-slate-700 p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center shrink-0">
                <TrashIcon className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">Delete history records</h3>
                <p className="text-xs text-slate-500 mt-0.5">{fmtDate(from)} → {fmtDate(to)}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This will permanently delete all completed, missed, cancelled, and skipped entries in this date range. <strong>This cannot be undone.</strong>
            </p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await api(`/clinics/my/history?from=${from}&to=${to}`, { method: 'DELETE' });
                    setShowDeleteConfirm(false);
                    onPageChange(1);
                    onRefresh();
                  } catch { /* ignore */ }
                  finally { setDeleting(false); }
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-sm text-white font-medium transition-colors disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete records'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Visit Entries ── */}
      {subTab === 'entries' && (
        <div className="space-y-4">
          {officerGroups.length > 0 && (
            <OfficerSelectorPills
              groups={officerGroups}
              totalEntries={(data?.entries ?? []).length}
              selected={selectedOfficer}
              onSelect={setSelectedOfficer}
              labels={L}
            />
          )}

          {filtered.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 py-16 text-center text-slate-400 text-sm">
              {hasFilters ? 'No entries match your filters.' : 'No visit records for this period.'}
            </div>
          ) : (
            <>
              {filteredGroups.map((g) => (
                <div
                  key={g.name}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-800 dark:text-slate-100">{g.name}</h3>
                      <p className="text-xs text-slate-500">{g.department}</p>
                    </div>
                    <OfficerStatusBadges group={g} />
                  </div>
                  <HistoryEntriesTable
                    entries={g.entries}
                    labels={L}
                    showProvider={selectedOfficer === 'ALL'}
                  />
                </div>
              ))}

              {!hasFilters && data && data.pages > 1 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
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
        <ByDoctorView entries={filtered} labels={L} />
      )}
    </div>
  );
}

// ─── By Officer view — summary chart + counts ─────────────────────────────────

type OfficerGroup = {
  name: string;
  department: string;
  entries: HistoryEntry[];
  completed: number;
  missed: number;
  cancelled: number;
  skipped: number;
};

function buildOfficerGroups(entries: HistoryEntry[]): OfficerGroup[] {
  const map = new Map<string, OfficerGroup>();
  for (const e of entries) {
    if (!map.has(e.doctor.name)) {
      map.set(e.doctor.name, {
        name: e.doctor.name,
        department: e.doctor.department,
        entries: [],
        completed: 0,
        missed: 0,
        cancelled: 0,
        skipped: 0,
      });
    }
    const g = map.get(e.doctor.name)!;
    g.entries.push(e);
    if (e.status === 'COMPLETED') g.completed++;
    else if (e.status === 'MISSED') g.missed++;
    else if (e.status === 'CANCELLED') g.cancelled++;
    else if (e.status === 'SKIPPED') g.skipped++;
  }
  return Array.from(map.values()).sort((a, b) => b.entries.length - a.entries.length);
}

function OfficerStatusBadges({ group: g }: { group: OfficerGroup }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium">
        {g.completed} completed
      </span>
      {g.missed > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
          {g.missed} missed
        </span>
      )}
      {g.cancelled > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 font-medium">
          {g.cancelled} cancelled
        </span>
      )}
      {g.skipped > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">
          {g.skipped} skipped
        </span>
      )}
    </div>
  );
}

function OfficerSelectorPills({
  groups,
  totalEntries,
  selected,
  onSelect,
  labels: L,
}: {
  groups: OfficerGroup[];
  totalEntries: number;
  selected: string;
  onSelect: (name: string) => void;
  labels: ReturnType<typeof getLabels>;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Select {L.provider.toLowerCase()}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelect('ALL')}
          className={`rounded-xl border px-3.5 py-2 text-left text-sm transition-all ${
            selected === 'ALL'
              ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 shadow-sm ring-2 ring-teal-500/20'
              : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <div className={`font-semibold ${selected === 'ALL' ? 'text-teal-700 dark:text-teal-300' : 'text-slate-800 dark:text-slate-100'}`}>
            All {L.providerPlural.toLowerCase()}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{totalEntries} visits</div>
        </button>
        {groups.map((g) => {
          const isSelected = selected === g.name;
          const total = g.completed + g.missed + g.cancelled + g.skipped;
          return (
            <button
              key={g.name}
              type="button"
              onClick={() => onSelect(g.name)}
              className={`rounded-xl border px-3.5 py-2 text-left text-sm transition-all ${
                isSelected
                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 shadow-sm ring-2 ring-teal-500/20'
                  : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <div className={`font-semibold truncate ${isSelected ? 'text-teal-700 dark:text-teal-300' : 'text-slate-800 dark:text-slate-100'}`}>
                {g.name}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">
                {g.department} · {total} visit{total !== 1 ? 's' : ''}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ByDoctorView({ entries, labels: L }: { entries: HistoryEntry[]; labels: ReturnType<typeof getLabels> }) {
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
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          <LegendDot color="#14b8a6" label="Completed" />
          <LegendDot color="#f59e0b" label="Missed"    />
          <LegendDot color="#ef4444" label="Cancelled" />
          <LegendDot color="#94a3b8" label="Skipped"   />
        </div>
        <DoctorHistogram doctors={rows as DoctorAnalyticsRow[]} />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/40">
              <tr>
                {[L.provider, L.department, 'Completed', 'Missed', 'Cancelled', 'Skipped', 'Total'].map((h) => (
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
  const cls: Record<string, { bg: string; text: string; bar: string }> = {
    teal:  { bg: 'bg-white dark:bg-slate-900 ring-1 ring-slate-200/60 dark:ring-slate-800',  text: 'text-brand-600 dark:text-brand-400',   bar: 'bg-brand-500'   },
    blue:  { bg: 'bg-white dark:bg-slate-900 ring-1 ring-slate-200/60 dark:ring-slate-800',  text: 'text-blue-600 dark:text-blue-400',     bar: 'bg-blue-500'    },
    green: { bg: 'bg-white dark:bg-slate-900 ring-1 ring-slate-200/60 dark:ring-slate-800',  text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
    amber: { bg: 'bg-white dark:bg-slate-900 ring-1 ring-slate-200/60 dark:ring-slate-800',  text: 'text-amber-600 dark:text-amber-400',   bar: 'bg-amber-500'   },
    red:   { bg: 'bg-white dark:bg-slate-900 ring-1 ring-slate-200/60 dark:ring-slate-800',  text: 'text-rose-600 dark:text-rose-400',     bar: 'bg-rose-500'    },
    slate: { bg: 'bg-white dark:bg-slate-900 ring-1 ring-slate-200/60 dark:ring-slate-800',  text: 'text-slate-500 dark:text-slate-400',   bar: 'bg-slate-400'   },
  };
  const c = cls[color] ?? cls.slate;
  return (
    <div className={`rounded-2xl shadow-card p-4 overflow-hidden relative ${c.bg}`}>
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${c.bar} opacity-70`} />
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-3xl font-bold mt-1 tracking-tight ${c.text}`}>{value}</p>
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
function LogoutIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>;
}
function SearchIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
}
function PrintIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>;
}
function TrashIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
}
