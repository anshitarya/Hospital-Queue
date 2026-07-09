'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type QueueEntry, type Doctor } from '@/lib/api';
import { tokenDisplay } from '@/lib/tokenCode';
import { useDoctorQueue, usePatientStream } from '@/lib/socket';
import { useRequireRole } from '@/lib/useRequireRole';
import { Header } from '@/components/Header';
import { PageLoader } from '@/components/PageLoader';
import { LiveIndicator } from '@/components/StatusPill';
import { useOutsideClick } from '@/lib/useOutsideClick';
import { NotificationBell, type PatientNotification } from '@/components/NotificationBell';

interface HistoryItem extends QueueEntry {
  doctor: Doctor;
}

const REFRESH_INTERVAL_MS = 30_000;
const UPCOMING_THRESHOLD = 5; // show alert when ≤ this many people ahead

// ─── Browser notification helpers ───────────────────────────────────────────

function requestNotifPermission() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

function sendBrowserNotif(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/favicon.ico', badge: '/favicon.ico' });
  } catch {}
}

function playChime(urgent: boolean) {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const notes = urgent
      ? [880, 1100, 880]      // two ascending + one for "your turn"
      : [660, 880];           // one gentle up-tone for "you're next"
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.25);
      gain.gain.setValueAtTime(0, now + i * 0.25);
      gain.gain.linearRampToValueAtTime(0.25, now + i * 0.25 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.25 + 0.4);
      osc.start(now + i * 0.25);
      osc.stop(now + i * 0.25 + 0.4);
    });
  } catch {}
}

function vibrate(urgent: boolean) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(urgent ? [200, 100, 200, 100, 200] : [150, 80, 150]);
  }
}

// ─── Status display metadata ────────────────────────────────────────────────
const STATUS_META = {
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  SKIPPED:   { label: 'Skipped',   cls: 'bg-amber-100 text-amber-700 ring-amber-200',       dot: 'bg-amber-500'   },
  CANCELLED: { label: 'Cancelled', cls: 'bg-rose-100 text-rose-700 ring-rose-200',           dot: 'bg-rose-500'    },
  MISSED:    { label: 'Missed',    cls: 'bg-rose-100 text-rose-700 ring-rose-200',           dot: 'bg-rose-400'    },
} as const;

// ─── Root page ───────────────────────────────────────────────────────────────
export default function PatientPage() {
  const { user, ready } = useRequireRole(['PATIENT']);

  // Single source of truth — derive everything from history.
  const [history, setHistory]               = useState<HistoryItem[]>([]);
  const [completedIds, setCompletedIds]     = useState<Set<string>>(new Set());
  const [positionsMap, setPositionsMap]     = useState<Record<string, number>>({});
  const [refreshing, setRefreshing]         = useState(false);
  const [lastSync, setLastSync]             = useState<Date | null>(null);
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
  const [activeTab, setActiveTab]           = useState<'active' | 'history'>('active');
  // Dismissed notification IDs, persisted for the session so refresh doesn't re-show them.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem('hq_dismissed_notifs') : null;
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set(); }
  });

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      const items = await api<HistoryItem[]>(`/patients/${user.id}/history`);
      setHistory(items);
      setLastSync(new Date());
    } catch {
      // Socket will catch up.
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (!ready) return;
    fetchHistory();
    const t = setInterval(fetchHistory, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [ready, fetchHistory]);

  const { connected: streamConnected } = usePatientStream(ready, fetchHistory);

  const handlePositionUpdate = useCallback((entryId: string, ahead: number) => {
    setPositionsMap((prev) => (prev[entryId] === ahead ? prev : { ...prev, [entryId]: ahead }));
  }, []);

  const dismissNotif = useCallback((id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try { sessionStorage.setItem('hq_dismissed_notifs', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  const dismissAllNotifs = useCallback((ids: string[]) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      try { sessionStorage.setItem('hq_dismissed_notifs', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  // Ask for notification permission once the user has an active queue entry.
  const notifRequested = useRef(false);
  useEffect(() => {
    if (notifRequested.current) return;
    const hasLive = history.some(
      (e) => e.status === 'WAITING' || e.status === 'IN_CONSULTATION',
    );
    if (hasLive) {
      notifRequested.current = true;
      requestNotifPermission();
    }
  }, [history]);

  const handleCompleted = useCallback((updated: HistoryItem) => {
    setCompletedIds((prev) => new Set([...prev, updated.id]));
    setTimeout(fetchHistory, 2000);
  }, [fetchHistory]);

  if (!ready) return <PageLoader label="Loading your queue…" />;

  // Derive live / past from single history state (fixes race condition on clinic count).
  const liveEntries = history.filter(
    (e) => (e.status === 'WAITING' || e.status === 'IN_CONSULTATION') && !completedIds.has(e.id),
  );
  const pastEntries = history.filter(
    (e) => e.status !== 'WAITING' && e.status !== 'IN_CONSULTATION',
  );

  // Build clinic list from history only — no separate state → no race.
  const clinicMap = new Map<string, { id: string; name: string }>();
  history.forEach((e) => {
    const cid = e.doctor.clinicId ?? 'unknown';
    if (!clinicMap.has(cid)) clinicMap.set(cid, { id: cid, name: e.doctor.clinic?.name ?? 'Clinic' });
  });
  const clinics        = Array.from(clinicMap.values());
  const activeClinicId = selectedClinicId ?? clinics[0]?.id ?? null;

  // Upcoming alerts — real-time position from socket, across ALL clinics.
  const upcomingAlerts = liveEntries.filter((e) => {
    const pos = positionsMap[e.id];
    return pos !== undefined && pos <= UPCOMING_THRESHOLD;
  });

  // Missed today — across ALL clinics.
  const todayLocal     = new Date().toLocaleDateString('en-CA');
  const missedTodayAll = pastEntries.filter(
    (e) => e.status === 'MISSED' && e.serviceDay === todayLocal,
  );

  // Entries scoped to selected clinic tab.
  const clinicLive   = liveEntries.filter((e) => (e.doctor.clinicId ?? 'unknown') === activeClinicId);
  const clinicMissed = missedTodayAll.filter((e) => (e.doctor.clinicId ?? 'unknown') === activeClinicId);

  // Live count per clinic (for dropdown badge).
  const liveCountByClinic = Object.fromEntries(
    clinics.map((c) => [c.id, liveEntries.filter((e) => (e.doctor.clinicId ?? 'unknown') === c.id).length]),
  );

  // Build notification list: use position-versioned IDs so a previously-dismissed
  // "3 ahead" doesn't suppress the new "1 ahead" notification.
  const allNotifications: PatientNotification[] = [
    ...upcomingAlerts.map((e): PatientNotification => {
      const pos    = positionsMap[e.id] ?? 0;
      const isNext = pos === 0;
      return {
        id:    `upcoming-${e.id}-${pos}`,  // position-versioned: dismissing #3 ≠ dismissing #1
        type:  isNext ? 'urgent' : 'upcoming',
        title: isNext
          ? `It's your turn — ${e.doctor.user.name}`
          : `Almost your turn with ${e.doctor.user.name}`,
        body: isNext
          ? `Please proceed to the consultation room now.${e.doctor.clinic?.name ? ` · ${e.doctor.clinic.name}` : ''}`
          : `${pos} ${pos === 1 ? 'person' : 'people'} ahead of you — please be ready nearby.${e.doctor.clinic?.name ? ` · ${e.doctor.clinic.name}` : ''}`,
      };
    }),
    ...missedTodayAll.map((e): PatientNotification => ({
      id:    `missed-${e.id}`,
      type:  'missed',
      title: `Missed — ${e.doctor.user.name}`,
      body:  `You were marked as missed${e.doctor.clinic?.name ? ` at ${e.doctor.clinic.name}` : ''}. Please reach out to the reception desk if you need to be re-added.`,
    })),
  ];
  // Filter out dismissed ones so the bell only shows unread notifications.
  const notifications = allNotifications.filter((n) => !dismissedIds.has(n.id));

  return (
    <>
      {/* Headless socket watchers — keeps positionsMap current for ALL live
          entries regardless of which clinic tab is active. */}
      {liveEntries.map((e) => (
        <QueueWatcher key={e.id} entry={e} onPositionUpdate={handlePositionUpdate} />
      ))}

      <Header
        title="My Queue"
        actions={
          <NotificationBell
            notifications={notifications}
            onDismiss={dismissNotif}
            onDismissAll={() => dismissAllNotifs(notifications.map((n) => n.id))}
          />
        }
      />

      <main className="mx-auto max-w-lg px-4 py-5 space-y-4 animate-fade-in">

        {/* ── Sync bar ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs text-slate-500">
            <LiveIndicator connected={streamConnected} />
            {lastSync ? `Updated ${formatRelative(lastSync)}` : 'Syncing…'}
          </span>
          <button type="button" onClick={fetchHistory} disabled={refreshing}
            className="btn-ghost !py-1 !px-2.5 text-xs" aria-label="Refresh queue">
            <span className={refreshing ? 'animate-spin inline-block' : 'inline-block'}>↻</span>
            <span className="ml-1">Refresh</span>
          </button>
        </div>

        {/* Per-doctor missed for active clinic (kept inline — scoped, not global) */}
        {clinicMissed.map((e) => (
          <div key={e.id} className="rounded-xl bg-rose-50 border-2 border-rose-400 text-rose-800 text-center font-medium py-3 px-4 text-sm">
            ⚠️ You were missed by <strong>{e.doctor.user.name}</strong>. Please reach out to the reception desk.
          </div>
        ))}

        {/* ── Clinic selector ───────────────────────────────────────────────── */}
        {clinics.length > 1 && (
          <ClinicDropdown
            clinics={clinics}
            activeClinicId={activeClinicId}
            liveCountByClinic={liveCountByClinic}
            onChange={setSelectedClinicId}
          />
        )}

        {/* ── Active / History tab bar ──────────────────────────────────────── */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-xl p-1">
          {(['active', 'history'] as const).map((tab) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-lg py-2 px-3 text-xs font-semibold transition-all ${
                activeTab === tab ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {tab === 'active'
                ? `Active${liveEntries.length > 0 ? ` (${liveEntries.length})` : ''}`
                : `History${pastEntries.length > 0 ? ` (${pastEntries.length})` : ''}`}
            </button>
          ))}
        </div>

        {/* ── Active tab ───────────────────────────────────────────────────── */}
        {activeTab === 'active' && (
          <>
            {/* Empty state */}
            {clinicLive.length === 0 && clinicMissed.length === 0 && (
              <div className="card p-10 text-center">
                <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center text-3xl mb-4 shadow-inner">
                  🏥
                </div>
                <h2 className="text-lg font-semibold text-slate-800">Not in any queue</h2>
                <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto leading-relaxed">
                  Once reception registers you, your token will appear here and update live — no need to refresh.
                </p>
              </div>
            )}

            {/* Live entries */}
            {clinicLive.map((entry) => (
              <ActiveEntry
                key={entry.id}
                entry={entry}
                onCompleted={handleCompleted}
                onPositionUpdate={handlePositionUpdate}
              />
            ))}
          </>
        )}

        {/* ── History tab ──────────────────────────────────────────────────── */}
        {activeTab === 'history' && (
          <HistoryView entries={pastEntries} />
        )}

      </main>
    </>
  );
}

// ─── Clinic dropdown ─────────────────────────────────────────────────────────
function ClinicDropdown({
  clinics,
  activeClinicId,
  liveCountByClinic,
  onChange,
}: {
  clinics: { id: string; name: string }[];
  activeClinicId: string | null;
  liveCountByClinic: Record<string, number>;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false));
  const active = clinics.find((c) => c.id === activeClinicId);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 shadow-sm hover:border-brand-300 dark:hover:border-brand-600 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-lg">🏥</span>
          <div className="min-w-0 text-left">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold leading-none mb-0.5">
              Viewing clinic
            </div>
            <div className="text-sm font-semibold text-slate-800 truncate">
              {active?.name ?? 'Select clinic'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400 font-medium">{clinics.length} clinics</span>
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-20 overflow-hidden">
          {clinics.map((c, i) => {
            const liveCount = liveCountByClinic[c.id] ?? 0;
            return (
              <button key={c.id} type="button"
                onClick={() => { onChange(c.id); setOpen(false); }}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-sm text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 ${
                  i > 0 ? 'border-t border-slate-100 dark:border-slate-700' : ''
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {c.id === activeClinicId ? (
                    <svg className="w-4 h-4 text-brand-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="w-4 h-4 shrink-0" />
                  )}
                  <span className={`font-medium truncate ${c.id === activeClinicId ? 'text-brand-700' : 'text-slate-700'}`}>
                    {c.name}
                  </span>
                </div>
                {liveCount > 0 && (
                  <span className="shrink-0 text-[10px] font-bold bg-brand-100 text-brand-700 rounded-full px-2 py-0.5">
                    {liveCount} active
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── History view ─────────────────────────────────────────────────────────────
type HistoryStatusFilter = 'ALL' | 'COMPLETED' | 'MISSED' | 'CANCELLED' | 'SKIPPED';
type HistorySubTab       = 'log' | 'by-doctor';
type HistoryPeriod       = 'all' | '30d' | '3m' | '1y' | 'custom';

function daysAgoStr(n: number) {
  return new Date(Date.now() - n * 86_400_000).toLocaleDateString('en-CA');
}

function HistoryView({ entries }: { entries: HistoryItem[] }) {
  const TODAY = new Date().toLocaleDateString('en-CA');

  const [period, setPeriod]         = useState<HistoryPeriod>('all');
  const [customFrom, setCustomFrom] = useState(daysAgoStr(29));
  const [customTo, setCustomTo]     = useState(TODAY);
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>('ALL');
  const [clinicFilter, setClinicFilter] = useState('ALL');
  const [subTab, setSubTab]         = useState<HistorySubTab>('log');

  if (entries.length === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="text-3xl mb-3">📋</div>
        <h3 className="font-semibold text-slate-700">No visit history yet</h3>
        <p className="text-sm text-slate-500 mt-1">Your past consultations will appear here.</p>
      </div>
    );
  }

  // Compute date bounds for selected period
  const dateFrom = period === 'all' ? null
    : period === '30d'   ? daysAgoStr(29)
    : period === '3m'    ? daysAgoStr(89)
    : period === '1y'    ? daysAgoStr(364)
    : customFrom;
  const dateTo = period === 'all' ? null : period === 'custom' ? customTo : TODAY;

  // Build clinic list for filter
  const clinicMap = new Map<string, string>();
  entries.forEach((e) => {
    const cid = e.doctor.clinicId ?? 'unknown';
    if (!clinicMap.has(cid)) clinicMap.set(cid, e.doctor.clinic?.name ?? 'Clinic');
  });
  const clinics = Array.from(clinicMap.entries());

  // Filter entries
  const filtered = entries.filter((e) => {
    const day = e.serviceDay ?? new Date(e.joinedAt).toLocaleDateString('en-CA');
    if (dateFrom && day < dateFrom) return false;
    if (dateTo   && day > dateTo)   return false;
    if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
    if (clinicFilter !== 'ALL' && (e.doctor.clinicId ?? 'unknown') !== clinicFilter) return false;
    return true;
  });

  // Summary stats
  const summary = {
    total:     filtered.length,
    completed: filtered.filter((e) => e.status === 'COMPLETED').length,
    missed:    filtered.filter((e) => e.status === 'MISSED').length,
    cancelled: filtered.filter((e) => e.status === 'CANCELLED').length,
    skipped:   filtered.filter((e) => e.status === 'SKIPPED').length,
  };

  // Build trend points from filtered entries (grouped by serviceDay)
  const trendMap = new Map<string, { completed: number; missed: number; cancelled: number; total: number }>();
  filtered.forEach((e) => {
    const day = e.serviceDay ?? new Date(e.joinedAt).toLocaleDateString('en-CA');
    if (!trendMap.has(day)) trendMap.set(day, { completed: 0, missed: 0, cancelled: 0, total: 0 });
    const d = trendMap.get(day)!;
    d.total++;
    if (e.status === 'COMPLETED') d.completed++;
    else if (e.status === 'MISSED') d.missed++;
    else if (e.status === 'CANCELLED') d.cancelled++;
  });
  const trendPoints = Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date,
      label: new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      ...vals,
    }));

  const statusBtns: { value: HistoryStatusFilter; label: string; color: string }[] = [
    { value: 'ALL',       label: 'All',       color: 'bg-slate-800 text-white' },
    { value: 'COMPLETED', label: 'Completed', color: 'bg-emerald-600 text-white' },
    { value: 'MISSED',    label: 'Missed',    color: 'bg-amber-500 text-white' },
    { value: 'CANCELLED', label: 'Cancelled', color: 'bg-rose-600 text-white' },
    { value: 'SKIPPED',   label: 'Skipped',   color: 'bg-slate-500 text-white' },
  ];

  return (
    <div className="space-y-4">
      {/* ── Period picker ── */}
      <div className="card p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(['all', '30d', '3m', '1y', 'custom'] as HistoryPeriod[]).map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                period === p ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}>
              {p === 'all' ? 'All Time' : p === '30d' ? 'Last 30d' : p === '3m' ? 'Last 3 mo' : p === '1y' ? 'Last year' : 'Custom'}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={customFrom} max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400" />
            <span className="text-xs text-slate-400">to</span>
            <input type="date" value={customTo} min={customFrom} max={TODAY}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
        )}
        {/* Status filter */}
        <div className="flex flex-wrap gap-1.5">
          {statusBtns.map(({ value, label, color }) => (
            <button key={value} type="button" onClick={() => setStatusFilter(value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                statusFilter === value ? color : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}>
              {label}
            </button>
          ))}
        </div>
        {/* Clinic filter */}
        {clinics.length > 1 && (
          <select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400">
            <option value="ALL">All clinics</option>
            {clinics.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
      </div>

      {/* ── Summary stat cards ── */}
      <div className="grid grid-cols-3 gap-2">
        <PatientStatCard label="Total"     value={summary.total}     color="teal"  />
        <PatientStatCard label="Completed" value={summary.completed} color="green" />
        <PatientStatCard label="Missed"    value={summary.missed}    color="amber" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PatientStatCard label="Cancelled" value={summary.cancelled} color="red"   />
        <PatientStatCard label="Skipped"   value={summary.skipped}   color="slate" />
      </div>

      {/* ── Trend chart ── */}
      {trendPoints.length > 1 && (
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-3">Visit Trend</h3>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <PatientLegendDot color="#14b8a6" label="Completed" />
            <PatientLegendDot color="#f59e0b" label="Missed"    />
            <PatientLegendDot color="#ef4444" label="Cancelled" />
          </div>
          <PatientTrendChart points={trendPoints} />
        </div>
      )}

      {/* ── Sub-tabs ── */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-xl p-1">
        {([['log', `Visit Log${filtered.length > 0 ? ` (${filtered.length})` : ''}`], ['by-doctor', 'By Doctor']] as [HistorySubTab, string][]).map(([t, label]) => (
          <button key={t} type="button" onClick={() => setSubTab(t)}
            className={`flex-1 rounded-lg py-2 px-3 text-xs font-semibold transition-all ${
              subTab === t ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Visit Log ── */}
      {subTab === 'log' && (
        filtered.length === 0 ? (
          <div className="card p-8 text-center text-slate-400 text-sm">No visits match your filters.</div>
        ) : (
          <HistoryDateGroupedView entries={filtered} />
        )
      )}

      {/* ── By Doctor ── */}
      {subTab === 'by-doctor' && <PatientByDoctorView entries={filtered} />}
    </div>
  );
}

function HistoryDateGroupedView({ entries }: { entries: HistoryItem[] }) {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime(),
  );
  const byDate = new Map<string, HistoryItem[]>();
  sorted.forEach((e) => {
    const key = new Date(e.joinedAt).toLocaleDateString('en-CA');
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(e);
  });
  return (
    <div className="space-y-4">
      {Array.from(byDate.entries()).map(([dateKey, dayEntries]) => (
        <DateGroup key={dateKey} dateKey={dateKey} entries={dayEntries} />
      ))}
    </div>
  );
}

function PatientByDoctorView({ entries }: { entries: HistoryItem[] }) {
  type DRow = { name: string; department: string; completed: number; missed: number; cancelled: number; skipped: number };
  const docMap = new Map<string, DRow>();
  for (const e of entries) {
    const key = e.doctor.user.name;
    if (!docMap.has(key)) docMap.set(key, { name: key, department: e.doctor.department?.name ?? 'General', completed: 0, missed: 0, cancelled: 0, skipped: 0 });
    const d = docMap.get(key)!;
    if (e.status === 'COMPLETED') d.completed++;
    else if (e.status === 'MISSED') d.missed++;
    else if (e.status === 'CANCELLED') d.cancelled++;
    else if (e.status === 'SKIPPED') d.skipped++;
  }
  const rows = Array.from(docMap.values()).sort((a, b) => (b.completed + b.missed) - (a.completed + a.missed));

  if (rows.length === 0) return (
    <div className="card p-8 text-center text-slate-400 text-sm">No data for this period.</div>
  );

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-700/40">
            <tr>
              {['Doctor', 'Department', '✅', '⚠️', '✗', 'Total'].map((h) => (
                <th key={h} className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {rows.map((r) => (
              <tr key={r.name} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                <td className="px-3 py-3 font-medium text-slate-800 dark:text-slate-100 text-xs">{r.name}</td>
                <td className="px-3 py-3 text-slate-400 text-xs">{r.department}</td>
                <td className="px-3 py-3 text-center font-semibold text-emerald-600 text-xs">{r.completed}</td>
                <td className="px-3 py-3 text-center font-semibold text-amber-600 text-xs">{r.missed}</td>
                <td className="px-3 py-3 text-center font-semibold text-rose-600 text-xs">{r.cancelled + r.skipped}</td>
                <td className="px-3 py-3 text-center font-semibold text-slate-700 dark:text-slate-200 text-xs">{r.completed + r.missed + r.cancelled + r.skipped}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PatientStatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const cls: Record<string, string> = {
    teal:  'bg-teal-50 dark:bg-teal-900/20 border-teal-100 dark:border-teal-800/40 text-teal-700 dark:text-teal-300',
    green: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/40 text-amber-700 dark:text-amber-300',
    red:   'bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800/40 text-rose-700 dark:text-rose-300',
    slate: 'bg-slate-50 dark:bg-slate-700/40 border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300',
  };
  return (
    <div className={`rounded-xl border p-3 ${cls[color] ?? cls.slate}`}>
      <p className="text-[10px] font-medium opacity-70 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}

function PatientLegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}

interface TrendPoint { date: string; label: string; completed: number; missed: number; cancelled: number; total: number }

function PatientTrendChart({ points }: { points: TrendPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<{ idx: number; screenX: number; screenY: number } | null>(null);

  const W = 700; const H = 180;
  const pad = { t: 10, r: 20, b: 32, l: 32 };
  const cW = W - pad.l - pad.r;
  const cH = H - pad.t - pad.b;

  const maxVal = Math.max(...points.flatMap((p) => [p.completed, p.missed, p.cancelled]), 1);
  const step   = cW / Math.max(points.length - 1, 1);
  const toX    = (i: number) => pad.l + i * step;
  const toY    = (v: number) => pad.t + cH - (v / maxVal) * cH;

  const tickCount = Math.min(maxVal, 4);
  const yTicks = [...new Set(Array.from({ length: tickCount + 1 }, (_, i) => Math.round((maxVal * i) / tickCount)))];

  const line = (key: 'completed' | 'missed' | 'cancelled') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p[key]).toFixed(1)}`).join(' ');

  const series: { key: 'completed' | 'missed' | 'cancelled'; color: string }[] = [
    { key: 'completed', color: '#14b8a6' },
    { key: 'missed',    color: '#f59e0b' },
    { key: 'cancelled', color: '#ef4444' },
  ];

  const labelEvery = points.length > 14 ? Math.ceil(points.length / 7) : 1;
  const tipPoint = tip !== null ? points[tip.idx] : null;

  return (
    <div className="relative" onMouseLeave={() => setTip(null)}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair" preserveAspectRatio="none"
        onMouseMove={(e) => {
          if (!svgRef.current || points.length < 2) return;
          const rect = svgRef.current.getBoundingClientRect();
          const relX = (e.clientX - rect.left) / rect.width;
          const idx  = Math.max(0, Math.min(points.length - 1, Math.round(relX * (points.length - 1))));
          setTip({ idx, screenX: e.clientX - rect.left, screenY: e.clientY - rect.top });
        }}>
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
          style={{ left: tip.screenX > 200 ? tip.screenX - 130 : tip.screenX + 10, top: Math.max(4, tip.screenY - 55) }}>
          <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{tipPoint.label}</p>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-500" />Completed</span><span className="font-bold text-teal-600">{tipPoint.completed}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Missed</span><span className="font-bold text-amber-600">{tipPoint.missed}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Cancelled</span><span className="font-bold text-red-600">{tipPoint.cancelled}</span></div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-700 pt-0.5 mt-0.5"><span className="text-slate-500">Total</span><span className="font-bold text-slate-700 dark:text-slate-200">{tipPoint.total}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

function DateGroup({ dateKey, entries }: { dateKey: string; entries: HistoryItem[] }) {
  // Group by clinic within this date.
  const byClinic = new Map<string, { name: string; entries: HistoryItem[] }>();
  entries.forEach((e) => {
    const cid = e.doctor.clinicId ?? 'unknown';
    if (!byClinic.has(cid)) byClinic.set(cid, { name: e.doctor.clinic?.name ?? 'Clinic', entries: [] });
    byClinic.get(cid)!.entries.push(e);
  });

  return (
    <div>
      {/* Date divider */}
      <div className="flex items-center gap-3 mb-2.5">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400 shrink-0">
          {formatDateLabel(dateKey)}
        </span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      <div className="space-y-2">
        {Array.from(byClinic.values()).map(({ name, entries: clinicEntries }) => (
          <div key={name} className="card overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-1.5">
              <span className="text-sm">🏥</span>
              <span className="text-xs font-bold text-brand-700 uppercase tracking-widest">{name}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {clinicEntries.map((e) => (
                <HistoryEntry key={e.id} entry={e} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryEntry({ entry }: { entry: HistoryItem }) {
  const meta = STATUS_META[entry.status as keyof typeof STATUS_META] ?? {
    label: entry.status, cls: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400',
  };
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`h-2 w-2 rounded-full shrink-0 ${meta.dot}`} />
        <div className="min-w-0">
          <div className="font-medium text-sm text-slate-800 truncate">
            <span className="font-mono text-brand-700">{tokenDisplay(entry.tokenNumber)}</span>
            {' · '}
            {entry.doctor.user.name}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {entry.doctor.department?.name ?? 'General'}
            {' · '}
            {new Date(entry.joinedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
      <span className={`pill ring-1 ring-inset shrink-0 ${meta.cls}`}>{meta.label}</span>
    </div>
  );
}

// ─── Headless watcher — subscribes to a doctor's queue without rendering UI ───
function QueueWatcher({
  entry,
  onPositionUpdate,
}: {
  entry: HistoryItem;
  onPositionUpdate: (entryId: string, ahead: number) => void;
}) {
  const { snapshot } = useDoctorQueue(entry.doctorId);
  const live = snapshot?.entries.find((e) => e.id === entry.id);

  useEffect(() => {
    if (live?.peopleAhead !== undefined) {
      onPositionUpdate(entry.id, live.peopleAhead);
    }
  }, [live?.peopleAhead, entry.id, onPositionUpdate]);

  return null;
}

// ─── Active entry card ────────────────────────────────────────────────────────
function ActiveEntry({
  entry,
  onCompleted,
  onPositionUpdate,
}: {
  entry: HistoryItem;
  onCompleted: (e: HistoryItem) => void;
  onPositionUpdate: (entryId: string, ahead: number) => void;
}) {
  const { snapshot, connected } = useDoctorQueue(entry.doctorId);
  const [finalStatus, setFinalStatus] = useState<string | null>(null);
  const completedFired = useRef(false);
  const [cancelling, setCancelling]     = useState(false);
  const [cancelError, setCancelError]   = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const prevStatusRef = useRef<string | null>(null);
  const prevAheadRef  = useRef<number | null>(null);

  async function confirmCancel() {
    setShowCancelConfirm(false);
    setCancelling(true);
    setCancelError(null);
    try {
      await api(`/queue/entry/${entry.id}/cancel`, { method: 'POST' });
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : 'Failed to cancel. Please try again.');
      setCancelling(false);
    }
  }

  const live = snapshot?.entries.find((e) => e.id === entry.id);

  useEffect(() => {
    if (completedFired.current) return;
    if (snapshot !== null && !live) {
      completedFired.current = true;
      api<{ entry: QueueEntry }>(`/queue/entry/${entry.id}`)
        .then(({ entry: updated }) => {
          setFinalStatus(updated.status);
          if (updated.status === 'MISSED') {
            sendBrowserNotif('⚠️ You were missed', `Please contact reception to be re-added — ${entry.doctor.user.name}`);
            playChime(false);
            vibrate(false);
          }
          setTimeout(() => onCompleted({ ...entry, status: updated.status as HistoryItem['status'] }), 4000);
        })
        .catch(() => {
          setFinalStatus('COMPLETED');
          setTimeout(() => onCompleted(entry), 4000);
        });
    }
  }, [snapshot, live, entry, onCompleted]);

  const status     = live?.status ?? entry.status;
  // Use null (not 0) when socket hasn't delivered data yet — prevents false "You're next" flash on refresh.
  const ahead      = live !== undefined ? (live.peopleAhead ?? null) : null;
  const eta        = live?.etaMinutes ?? 0;
  const etaAbs     = live?.etaAbsolute;
  const movingAvg  = live?.movingAvgMinutes ?? snapshot?.movingAvgMinutes;
  const isInConsult = status === 'IN_CONSULTATION';
  const isNextUp    = status === 'WAITING' && ahead === 0;
  const isUrgent    = isInConsult || isNextUp;
  const breakUntil  = snapshot?.doctor?.breakUntil ? new Date(snapshot.doctor.breakUntil) : null;
  const breakActive = snapshot?.doctor?.status === 'PAUSED' && breakUntil && breakUntil.getTime() > Date.now();

  // Detect status / position transitions and fire browser notifications.
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const prevAhead  = prevAheadRef.current;
    prevStatusRef.current = status;
    prevAheadRef.current  = ahead ?? null;

    // Skip the very first render — no previous state to compare against.
    if (prevStatus === null) return;
    // Nothing changed.
    if (prevStatus === status && prevAhead === ahead) return;

    if (status === 'IN_CONSULTATION' && prevStatus !== 'IN_CONSULTATION') {
      sendBrowserNotif(`🔔 It's your turn!`, `Please proceed to the consultation room — ${entry.doctor.user.name}`);
      playChime(true);
      vibrate(true);
    } else if (status === 'WAITING' && ahead === 0 && prevAhead !== null && prevAhead > 0) {
      // Only fire when position genuinely IMPROVED to 0; not on page-load (prevAhead null).
      sendBrowserNotif(`⚡ You're next!`, `Please be ready outside — ${entry.doctor.user.name}`);
      playChime(false);
      vibrate(false);
    }
  }, [status, ahead, entry.doctor.user.name]);

  // Total queue size for the progress bar.
  const totalInQueue = snapshot?.entries.filter(
    (e) => e.status === 'WAITING' || e.status === 'IN_CONSULTATION',
  ).length ?? 0;
  const progressPct = totalInQueue > 0 && ahead !== null
    ? Math.round(((totalInQueue - ahead) / totalInQueue) * 100)
    : 0;

  if (finalStatus) {
    const isDone = finalStatus === 'COMPLETED';
    return (
      <section className="card p-8 text-center animate-fade-in">
        <div className={`mx-auto h-16 w-16 rounded-2xl flex items-center justify-center text-3xl mb-4 shadow-inner ${isDone ? 'bg-emerald-100' : 'bg-slate-100'}`}>
          {isDone ? '✓' : '×'}
        </div>
        <div className="text-lg font-semibold">
          {finalStatus === 'COMPLETED' ? 'Consultation complete'
            : finalStatus === 'SKIPPED' ? 'Marked as skipped'
            : finalStatus === 'MISSED'  ? 'You were missed'
            : 'Entry cancelled'}
        </div>
        {finalStatus === 'MISSED' && (
          <div className="text-sm text-rose-600 mt-2">
            Please reach out to the reception desk if you need to be re-added.
          </div>
        )}
        <div className="text-sm text-slate-500 mt-1">
          Token <span className="font-mono font-bold text-brand-700">{tokenDisplay(entry.tokenNumber)}</span> with {entry.doctor.user.name}
        </div>
      </section>
    );
  }

  return (
    <section className={`card overflow-hidden ${isUrgent ? 'ring-2 ring-brand-400/50 shadow-md' : ''}`}>
      {/* Header */}
      <div className={`px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between ${
        isInConsult ? 'bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/30'
        : isNextUp   ? 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30'
        : 'bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-800'
      }`}>
        <div className="min-w-0">
          {entry.doctor.clinic?.name && (
            <div className="text-[10px] uppercase tracking-widest text-brand-700 font-bold mb-0.5 truncate">
              {entry.doctor.clinic.name}
            </div>
          )}
          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{entry.doctor.user.name}</div>
          <div className="text-xs text-slate-500">{entry.doctor.department?.name ?? 'General'}</div>
        </div>
        <LiveIndicator connected={connected} />
      </div>

      <div className="p-5 space-y-4">
        {/* Status banners */}
        {isInConsult && (
          <div className="rounded-xl bg-emerald-500 text-white text-center font-semibold py-3 px-4 animate-pulse-slow shadow-sm">
            🔔 It&apos;s your turn — please proceed to the consultation room
          </div>
        )}
        {ahead !== null && isNextUp && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-400 dark:border-amber-600 text-amber-800 dark:text-amber-300 text-center font-medium py-3 px-4">
            ⚡ You&apos;re next — please be ready outside
          </div>
        )}
        {(finalStatus === 'MISSED' || status === 'MISSED') && (
          <div className="rounded-xl bg-rose-50 dark:bg-rose-900/30 border-2 border-rose-400 dark:border-rose-600 text-rose-800 dark:text-rose-300 text-center font-medium py-3 px-4">
            ⚠️ You were previously missed. Please reach out to the reception desk if you need to be re-added.
          </div>
        )}
        {breakActive && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 text-center">
            ☕ Doctor is on a short break — returning at{' '}
            <strong>{breakUntil!.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</strong>
            {snapshot?.doctor?.breakNote && ` · ${snapshot.doctor.breakNote}`}
          </div>
        )}

        {/* Token grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-xl p-4 text-center ${
            isInConsult ? 'bg-emerald-50 dark:bg-emerald-900/30 ring-2 ring-emerald-300 dark:ring-emerald-700'
            : isNextUp  ? 'bg-amber-50 dark:bg-amber-900/30 ring-2 ring-amber-300 dark:ring-amber-700'
            : 'bg-brand-50 dark:bg-brand-900/20 ring-1 ring-brand-100 dark:ring-brand-800/50'
          }`}>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Your token</div>
            <div className={`text-5xl font-bold leading-none tabular-nums ${
              isInConsult ? 'text-emerald-700 dark:text-emerald-400' : isNextUp ? 'text-amber-700 dark:text-amber-400' : 'text-brand-700 dark:text-brand-400'
            }`}>
              {tokenDisplay(entry.tokenNumber)}
            </div>
          </div>
          <div className="rounded-xl p-4 text-center bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-100 dark:ring-slate-700">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5 font-medium">Now serving</div>
            <div className="text-5xl font-bold text-slate-800 dark:text-slate-100 leading-none tabular-nums">
              {snapshot?.currentToken ? tokenDisplay(snapshot.currentToken) : '—'}
            </div>
          </div>
        </div>

        {/* Queue position */}
        {status === 'WAITING' && ahead !== null && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-100 dark:ring-slate-700 p-3.5 text-center">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Your position in queue</div>
            <div className="text-3xl font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums">
              {isNextUp ? 'Next' : `#${ahead + 1}`}
            </div>
          </div>
        )}

        {/* ETA + position */}
        {status === 'WAITING' && !isNextUp && ahead !== null && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-100 dark:ring-slate-700 p-3.5 text-center">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">People ahead</div>
                <div className="text-3xl font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums">{ahead}</div>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-100 dark:ring-slate-700 p-3.5 text-center">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Est. wait</div>
                <div className="text-3xl font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums">
                  ~{eta}<span className="text-sm text-slate-400 font-normal ml-1">min</span>
                </div>
                {etaAbs && (
                  <div className="text-xs text-slate-500 mt-1">
                    your turn ~{new Date(etaAbs).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
                {movingAvg != null && (
                  <div className="text-[10px] text-slate-400 mt-0.5">avg {Math.round(movingAvg)} min/patient</div>
                )}
              </div>
            </div>

            {/* Queue progress bar */}
            {totalInQueue > 0 && (
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 font-medium mb-1.5 uppercase tracking-wide">
                  <span>Queue progress</span>
                  <span>{totalInQueue - (ahead ?? 0)} of {totalInQueue} seen</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-400 rounded-full transition-all duration-700"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Cancel appointment — only while still waiting */}
      {status === 'WAITING' && (
        <div className="border-t border-slate-100 dark:border-slate-700 px-5 py-3">
          {cancelError && (
            <p className="text-xs text-rose-600 text-center mb-2">{cancelError}</p>
          )}

          {showCancelConfirm ? (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 ring-1 ring-rose-200 dark:ring-rose-800 px-4 py-3 space-y-3">
              <p className="text-sm font-medium text-rose-800 dark:text-rose-300 text-center">
                Cancel your appointment with {entry.doctor.user.name}?
              </p>
              <p className="text-xs text-rose-600 dark:text-rose-400 text-center">
                This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium py-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Keep appointment
                </button>
                <button
                  type="button"
                  onClick={confirmCancel}
                  disabled={cancelling}
                  className="flex-1 rounded-lg bg-rose-600 hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600 text-white text-xs font-medium py-2 transition-colors disabled:opacity-50"
                >
                  Yes, cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              disabled={cancelling}
              className="w-full text-xs text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-rose-400 transition-colors py-2 disabled:opacity-50"
            >
              {cancelling ? 'Cancelling…' : 'Cancel appointment'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDateLabel(dateKey: string): string {
  const today     = new Date().toLocaleDateString('en-CA');
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA');
  if (dateKey === today)     return 'Today';
  if (dateKey === yesterday) return 'Yesterday';
  const d = new Date(`${dateKey}T12:00:00`);
  const weekAgo = new Date(Date.now() - 6 * 86_400_000);
  if (d >= weekAgo) {
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatRelative(d: Date) {
  const diff = Math.round((Date.now() - d.getTime()) / 1000);
  if (diff < 5)  return 'just now';
  if (diff < 60) return `${diff}s ago`;
  const min = Math.floor(diff / 60);
  if (min < 60)  return `${min} min ago`;
  return d.toLocaleTimeString();
}
