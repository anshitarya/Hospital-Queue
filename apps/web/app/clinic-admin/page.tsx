'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRequireRole } from '@/lib/useRequireRole';
import { PageLoader } from '@/components/PageLoader';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardDoctor {
  id: string;
  name: string;
  department: string;
  status: 'AVAILABLE' | 'PAUSED' | 'OFFLINE';
  waiting: number;
  inConsultation: number;
  completed: number;
}

interface TrafficPoint {
  date: string;
  label: string;
  count: number;
}

interface ClinicDashboard {
  clinic: { id: string; name: string; address?: string };
  today: {
    waiting: number;
    inConsultation: number;
    completed: number;
    skipped: number;
    cancelled: number;
  };
  doctors: DashboardDoctor[];
  weeklyTraffic: TrafficPoint[];
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: 'Dashboard', icon: GridIcon, href: '/clinic-admin', active: true },
  { label: 'Queue',     icon: ListIcon,  href: '/reception',   active: false },
  { label: 'History',  icon: ClockIcon, href: '/reception?tab=history', active: false },
  { label: 'Staff',    icon: UsersIcon, href: '/reception?tab=staff', active: false },
  { label: 'Patients', icon: HeartIcon, href: null,            active: false },
  { label: 'Billing',  icon: CoinIcon,  href: null,            active: false },
  { label: 'Settings', icon: GearIcon,  href: null,            active: false },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClinicAdminPage() {
  const { ready } = useRequireRole(['RECEPTIONIST', 'ADMIN']);
  const router = useRouter();
  const [data, setData] = useState<ClinicDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const d = await api<ClinicDashboard>('/clinics/my/dashboard');
      setData(d);
    } catch {
      // silently fail on background refreshes
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => void load(true), 30_000);
    return () => clearInterval(id);
  }, [ready, load]);

  if (!ready || loading) return <PageLoader label="Loading dashboard…" />;

  const today = data?.today ?? { waiting: 0, inConsultation: 0, completed: 0, skipped: 0, cancelled: 0 };
  const doctors = data?.doctors ?? [];
  const traffic = data?.weeklyTraffic ?? [];

  const todayDate = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-900 overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-16 sm:w-56 flex-shrink-0 bg-slate-900 dark:bg-slate-950 flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700/60">
          <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center font-bold text-white text-sm shrink-0">
            CQ
          </div>
          <span className="hidden sm:block font-semibold text-white text-sm leading-tight">
            {data?.clinic?.name ?? 'Clinic Queue'}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {NAV_ITEMS.map(({ label, icon: Icon, href, active }) => (
            <button
              key={label}
              type="button"
              onClick={() => href ? router.push(href) : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-teal-600 text-white font-medium'
                  : href
                  ? 'text-slate-400 hover:text-white hover:bg-slate-700/60 cursor-pointer'
                  : 'text-slate-600 cursor-not-allowed'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:block">{label}</span>
              {!href && <span className="hidden sm:block ml-auto text-[10px] text-slate-600">Soon</span>}
            </button>
          ))}
        </nav>

        {/* Bottom: back link */}
        <div className="p-3 border-t border-slate-700/60">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
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
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 font-medium disabled:opacity-50"
          >
            <RefreshIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:block">Refresh</span>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* ── Stat cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Waiting" value={today.waiting} color="teal" />
            <StatCard label="Completed" value={today.completed} color="green" />
            <StatCard label="Skipped" value={today.skipped} color="amber" />
            <StatCard label="Cancelled" value={today.cancelled} color="red" />
          </div>

          {/* ── Chart + side panel ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Traffic chart */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                  Clinic Traffic — Last 7 Days
                </h2>
                <span className="text-xs text-slate-400">Completed + Skipped + Cancelled</span>
              </div>
              <TrafficChart points={traffic} />
            </div>

            {/* Today summary panel */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm mb-4">
                Today at a Glance
              </h2>
              <div className="space-y-3">
                <GlanceLine label="In consultation" value={today.inConsultation} color="teal" />
                <GlanceLine label="Waiting" value={today.waiting} color="blue" />
                <GlanceLine label="Completed" value={today.completed} color="green" />
                <GlanceLine label="Skipped" value={today.skipped} color="amber" />
                <GlanceLine label="Cancelled" value={today.cancelled} color="red" />
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                <p className="text-xs text-slate-500">Total today</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                  {today.waiting + today.inConsultation + today.completed + today.skipped + today.cancelled}
                </p>
              </div>
            </div>
          </div>

          {/* ── Live Doctor Queues ── */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                Live Doctor Queues
              </h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </div>

            {doctors.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                No doctors added to this clinic yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-700/40">
                    <tr>
                      {['Doctor', 'Department', 'Status', 'In Consultation', 'Waiting', 'Completed Today'].map((h) => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {doctors.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-xs font-semibold text-teal-700 dark:text-teal-300 shrink-0">
                              {doc.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">
                              {doc.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {doc.department}
                        </td>
                        <td className="px-5 py-3.5">
                          <DoctorStatusBadge status={doc.status} />
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`text-sm font-semibold ${doc.inConsultation > 0 ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'}`}>
                            {doc.inConsultation > 0 ? '1' : '—'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`text-sm font-semibold ${doc.waiting > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
                            {doc.waiting > 0 ? doc.waiting : '—'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {doc.completed}
                          </span>
                        </td>
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
  const palette: Record<string, string> = {
    teal:  'bg-teal-50 dark:bg-teal-900/20 border-teal-100 dark:border-teal-800/40 text-teal-700 dark:text-teal-300',
    green: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/40 text-amber-700 dark:text-amber-300',
    red:   'bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800/40 text-rose-700 dark:text-rose-300',
  };
  return (
    <div className={`rounded-xl border p-4 ${palette[color] ?? palette.teal}`}>
      <p className="text-xs font-medium opacity-70 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

function GlanceLine({ label, value, color }: { label: string; value: number; color: string }) {
  const dot: Record<string, string> = {
    teal: 'bg-teal-500', blue: 'bg-blue-500', green: 'bg-emerald-500',
    amber: 'bg-amber-500', red: 'bg-rose-500',
  };
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dot[color] ?? dot.teal}`} />
        <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
      </div>
      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  );
}

function DoctorStatusBadge({ status }: { status: string }) {
  if (status === 'AVAILABLE')
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Available</span>;
  if (status === 'PAUSED')
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />On break</span>;
  return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Offline</span>;
}

function TrafficChart({ points }: { points: TrafficPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
        No data yet — traffic will appear as patients are seen.
      </div>
    );
  }

  const W = 560;
  const H = 160;
  const pad = { t: 10, r: 16, b: 32, l: 32 };
  const chartW = W - pad.l - pad.r;
  const chartH = H - pad.t - pad.b;

  const maxVal = Math.max(...points.map((p) => p.count), 1);
  const step = chartW / Math.max(points.length - 1, 1);

  const toX = (i: number) => pad.l + i * step;
  const toY = (v: number) => pad.t + chartH - (v / maxVal) * chartH;

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p.count)}`)
    .join(' ');

  const areaPath = [
    `M ${toX(0)} ${toY(0)}`,
    ...points.map((p, i) => `L ${toX(i)} ${toY(p.count)}`),
    `L ${toX(points.length - 1)} ${toY(0)}`,
    'Z',
  ].join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="cq-traffic-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = pad.t + chartH * (1 - frac);
        return (
          <line key={frac} x1={pad.l} y1={y} x2={W - pad.r} y2={y}
            stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" />
        );
      })}

      {/* Y-axis labels */}
      {[0, 0.5, 1].map((frac) => {
        const y = pad.t + chartH * (1 - frac);
        return (
          <text key={frac} x={pad.l - 4} y={y + 4} textAnchor="end"
            className="fill-slate-400" fontSize="9">
            {Math.round(maxVal * frac)}
          </text>
        );
      })}

      {/* Area fill */}
      <path d={areaPath} fill="url(#cq-traffic-grad)" />

      {/* Line */}
      <path d={linePath} fill="none" stroke="#14b8a6" strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />

      {/* Dots + x-axis labels */}
      {points.map((p, i) => (
        <g key={p.date}>
          <circle cx={toX(i)} cy={toY(p.count)} r="3.5"
            fill="#14b8a6" stroke="white" strokeWidth="1.5" />
          <text x={toX(i)} y={H - 4} textAnchor="middle"
            className="fill-slate-400" fontSize="9">
            {p.label.split(' ')[0]}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── Icons (inline SVG so no library is needed) ────────────────────────────────

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}
function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );
}
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v6l4 2" />
    </svg>
  );
}
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );
}
function CoinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v2m0 8v2M9.5 9.5a2.5 2.5 0 015 0c0 3.5-5 4-5 6.5a2.5 2.5 0 005 0" />
    </svg>
  );
}
function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}
