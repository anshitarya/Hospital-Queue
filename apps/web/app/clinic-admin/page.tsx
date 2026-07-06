'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRequireRole } from '@/lib/useRequireRole';
import { PageLoader } from '@/components/PageLoader';

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface ClinicDashboard {
  clinic: { id: string; name: string; address?: string };
  today: { waiting: number; inConsultation: number; completed: number; skipped: number; cancelled: number };
  doctors: DashboardDoctor[];
  weeklyTraffic: TrafficPoint[];
}

interface ClinicAnalytics { period: 'daily' | 'monthly'; points: AnalyticsPoint[] }

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard', icon: GridIcon,  href: '/clinic-admin', active: true  },
  { label: 'Queue',     icon: ListIcon,  href: '/reception',    active: false },
  { label: 'History',  icon: ClockIcon, href: '/reception?tab=history', active: false },
  { label: 'Staff',    icon: UsersIcon, href: '/reception?tab=staff',   active: false },
  { label: 'Patients', icon: HeartIcon, href: null,             active: false },
  { label: 'Billing',  icon: CoinIcon,  href: null,             active: false },
  { label: 'Settings', icon: GearIcon,  href: null,             active: false },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClinicAdminPage() {
  const { ready } = useRequireRole(['RECEPTIONIST', 'ADMIN']);
  const router = useRouter();

  const [data, setData]           = useState<ClinicDashboard | null>(null);
  const [analytics, setAnalytics] = useState<ClinicAnalytics | null>(null);
  const [period, setPeriod]       = useState<'daily' | 'monthly'>('daily');
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const d = await api<ClinicDashboard>('/clinics/my/dashboard');
      setData(d);
    } catch { /* ignore */ } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  const loadAnalytics = useCallback(async (p: 'daily' | 'monthly') => {
    try {
      const count = p === 'monthly' ? 12 : 30;
      const a = await api<ClinicAnalytics>(`/clinics/my/analytics?period=${p}&count=${count}`);
      setAnalytics(a);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (ready) { void loadDashboard(); void loadAnalytics(period); } }, [ready]);
  useEffect(() => { if (ready) void loadAnalytics(period); }, [period, ready]);

  // Auto-refresh every 30 s
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => { void loadDashboard(true); void loadAnalytics(period); }, 30_000);
    return () => clearInterval(id);
  }, [ready, period]);

  if (!ready || loading) return <PageLoader label="Loading dashboard…" />;

  const today   = data?.today ?? { waiting: 0, inConsultation: 0, completed: 0, skipped: 0, cancelled: 0 };
  const doctors = data?.doctors ?? [];

  const todayDate = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-900 overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-16 sm:w-56 flex-shrink-0 bg-slate-900 dark:bg-slate-950 flex flex-col">
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700/60">
          <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center font-bold text-white text-sm shrink-0">CQ</div>
          <span className="hidden sm:block font-semibold text-white text-sm leading-tight">{data?.clinic?.name ?? 'Clinic Queue'}</span>
        </div>
        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {NAV.map(({ label, icon: Icon, href, active }) => (
            <button key={label} type="button"
              onClick={() => href ? router.push(href) : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active ? 'bg-teal-600 text-white font-medium'
                : href  ? 'text-slate-400 hover:text-white hover:bg-slate-700/60 cursor-pointer'
                        : 'text-slate-600 cursor-not-allowed'
              }`}>
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:block">{label}</span>
              {!href && <span className="hidden sm:block ml-auto text-[10px] text-slate-600">Soon</span>}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-700/60">
          <button type="button" onClick={() => router.push('/')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 transition-colors">
            <ArrowLeftIcon className="w-4 h-4 shrink-0" />
            <span className="hidden sm:block">Back to home</span>
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Dashboard</h1>
            <p className="text-xs text-slate-500 mt-0.5">{todayDate}</p>
          </div>
          <button type="button" onClick={() => { void loadDashboard(true); void loadAnalytics(period); }}
            disabled={refreshing}
            className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 font-medium disabled:opacity-50">
            <RefreshIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:block">Refresh</span>
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* ── Stat cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Waiting"   value={today.waiting}   color="teal"  />
            <StatCard label="Completed" value={today.completed} color="green" />
            <StatCard label="Skipped"   value={today.skipped}   color="amber" />
            <StatCard label="Cancelled" value={today.cancelled} color="red"   />
          </div>

          {/* ── Booking Overview (line chart) ── */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Booking Overview</h2>
                <p className="text-xs text-slate-400 mt-0.5">Completed, missed, and cancelled visits over time</p>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
                {(['daily', 'monthly'] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setPeriod(p)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                      period === p ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}>{p === 'daily' ? 'Daily (30d)' : 'Monthly (12m)'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4 mb-3 flex-wrap">
              <LegendDot color="#14b8a6" label="Completed" />
              <LegendDot color="#f59e0b" label="Missed"    />
              <LegendDot color="#ef4444" label="Cancelled" />
            </div>
            <BookingLineChart points={analytics?.points ?? []} />
          </div>

          {/* ── Today's Doctor Histogram ── */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <div className="mb-4">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Today's Breakdown by Doctor</h2>
              <p className="text-xs text-slate-400 mt-0.5">Completed / Missed / Cancelled / Skipped per doctor today</p>
            </div>
            <div className="flex items-center gap-4 mb-3 flex-wrap">
              <LegendDot color="#14b8a6" label="Completed" />
              <LegendDot color="#f59e0b" label="Missed"    />
              <LegendDot color="#ef4444" label="Cancelled" />
              <LegendDot color="#94a3b8" label="Skipped"   />
            </div>
            <DoctorHistogram doctors={doctors} />
          </div>

          {/* ── Live Doctor Queues ── */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Live Doctor Queues</h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Live
              </span>
            </div>
            {doctors.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No doctors added yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-700/40">
                    <tr>
                      {['Doctor', 'Dept', 'Status', 'Consulting', 'Waiting', 'Done', 'Missed', 'Cancelled'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {doctors.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-xs font-bold text-teal-700 dark:text-teal-300 shrink-0">
                              {doc.name.charAt(0)}
                            </div>
                            <span className="font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">{doc.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{doc.department}</td>
                        <td className="px-4 py-3.5"><DoctorStatusBadge status={doc.status} /></td>
                        <td className="px-4 py-3.5 text-center text-sm font-semibold text-teal-600 dark:text-teal-400">{doc.inConsultation > 0 ? '1' : '—'}</td>
                        <td className="px-4 py-3.5 text-center text-sm font-semibold text-blue-600 dark:text-blue-400">{doc.waiting  || '—'}</td>
                        <td className="px-4 py-3.5 text-center text-sm font-semibold text-emerald-600 dark:text-emerald-400">{doc.completed || '—'}</td>
                        <td className="px-4 py-3.5 text-center text-sm font-semibold text-amber-600 dark:text-amber-400">{doc.missed    || '—'}</td>
                        <td className="px-4 py-3.5 text-center text-sm font-semibold text-rose-600 dark:text-rose-400">{doc.cancelled  || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const cls: Record<string, string> = {
    teal:  'bg-teal-50 dark:bg-teal-900/20 border-teal-100 dark:border-teal-800/40 text-teal-700 dark:text-teal-300',
    green: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/40 text-amber-700 dark:text-amber-300',
    red:   'bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800/40 text-rose-700 dark:text-rose-300',
  };
  return (
    <div className={`rounded-xl border p-4 ${cls[color] ?? cls.teal}`}>
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

// ─── Booking Overview — multi-series line chart ────────────────────────────────

function BookingLineChart({ points }: { points: AnalyticsPoint[] }) {
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

  const line = (key: keyof AnalyticsPoint) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p[key] as number)}`).join(' ');

  const series: Array<{ key: keyof AnalyticsPoint; color: string }> = [
    { key: 'completed', color: '#14b8a6' },
    { key: 'missed',    color: '#f59e0b' },
    { key: 'cancelled', color: '#ef4444' },
  ];

  // Show every Nth label to avoid crowding
  const labelEvery = points.length > 20 ? Math.ceil(points.length / 10) : 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = pad.t + cH * (1 - f);
        return <g key={f}>
          <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" />
          <text x={pad.l - 4} y={y + 4} textAnchor="end" className="fill-slate-400" fontSize="9">{Math.round(maxVal * f)}</text>
        </g>;
      })}

      {/* Lines */}
      {series.map(({ key, color }) => (
        <path key={key} d={line(key)} fill="none" stroke={color} strokeWidth="1.8"
          strokeLinejoin="round" strokeLinecap="round" />
      ))}

      {/* Dots (completed only to avoid clutter) */}
      {points.map((p, i) => (
        <circle key={p.date} cx={toX(i)} cy={toY(p.completed)} r="2.5"
          fill="#14b8a6" stroke="white" strokeWidth="1.5" />
      ))}

      {/* X-axis labels */}
      {points.map((p, i) => i % labelEvery === 0 && (
        <text key={p.date} x={toX(i)} y={H - 4} textAnchor="middle"
          className="fill-slate-400" fontSize="8">{p.label}</text>
      ))}
    </svg>
  );
}

// ─── Doctor histogram — grouped bar chart ─────────────────────────────────────

function DoctorHistogram({ doctors }: { doctors: DashboardDoctor[] }) {
  if (!doctors.length) {
    return <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No doctors added yet.</div>;
  }

  const W = 700; const H = 200;
  const pad = { t: 10, r: 20, b: 44, l: 36 };
  const cW  = W - pad.l - pad.r;
  const cH  = H - pad.t - pad.b;

  const BARS: Array<{ key: keyof DashboardDoctor; color: string }> = [
    { key: 'completed', color: '#14b8a6' },
    { key: 'missed',    color: '#f59e0b' },
    { key: 'cancelled', color: '#ef4444' },
    { key: 'skipped',   color: '#94a3b8' },
  ];
  const barW  = 10;
  const gap   = 4;
  const groupW = BARS.length * barW + (BARS.length - 1) * gap;
  const docSpacing = cW / doctors.length;

  const maxVal = Math.max(
    ...doctors.flatMap((d) => BARS.map(({ key }) => d[key] as number)),
    1,
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const y = pad.t + cH * (1 - f);
        return <g key={f}>
          <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" />
          <text x={pad.l - 4} y={y + 4} textAnchor="end" className="fill-slate-400" fontSize="9">{Math.round(maxVal * f)}</text>
        </g>;
      })}

      {/* Bars */}
      {doctors.map((doc, di) => {
        const cx = pad.l + di * docSpacing + docSpacing / 2;
        const groupLeft = cx - groupW / 2;
        return (
          <g key={doc.id}>
            {BARS.map(({ key, color }, bi) => {
              const val    = doc[key] as number;
              const barH   = val > 0 ? Math.max((val / maxVal) * cH, 3) : 0;
              const x      = groupLeft + bi * (barW + gap);
              const y      = pad.t + cH - barH;
              return (
                <g key={key}>
                  <rect x={x} y={y} width={barW} height={barH} fill={color} rx="2" opacity="0.85" />
                  {val > 0 && barH > 14 && (
                    <text x={x + barW / 2} y={y + 10} textAnchor="middle" className="fill-white" fontSize="7" fontWeight="600">{val}</text>
                  )}
                </g>
              );
            })}
            {/* Doctor name label */}
            <text x={cx} y={H - 8} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" fontSize="9">
              {doc.name.split(' ').pop()}
            </text>
            {/* Subtle full name as tooltip via title */}
            <title>{doc.name}</title>
          </g>
        );
      })}
    </svg>
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
