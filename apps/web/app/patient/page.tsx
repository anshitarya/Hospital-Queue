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

  // Build notification list for the bell.
  const notifications: PatientNotification[] = [
    ...upcomingAlerts.map((e): PatientNotification => {
      const pos    = positionsMap[e.id] ?? 0;
      const isNext = pos === 0;
      return {
        id:    `upcoming-${e.id}`,
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

  return (
    <>
      {/* Headless socket watchers — keeps positionsMap current for ALL live
          entries regardless of which clinic tab is active. */}
      {liveEntries.map((e) => (
        <QueueWatcher key={e.id} entry={e} onPositionUpdate={handlePositionUpdate} />
      ))}

      <Header
        title="My Queue"
        actions={<NotificationBell notifications={notifications} />}
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
function HistoryView({ entries }: { entries: HistoryItem[] }) {
  if (entries.length === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="text-3xl mb-3">📋</div>
        <h3 className="font-semibold text-slate-700">No visit history yet</h3>
        <p className="text-sm text-slate-500 mt-1">Your past consultations will appear here.</p>
      </div>
    );
  }

  const completedCount = entries.filter((e) => e.status === 'COMPLETED').length;
  const uniqueDoctors  = new Set(entries.map((e) => e.doctorId)).size;
  const uniqueClinics  = new Set(entries.map((e) => e.doctor.clinicId ?? 'unknown')).size;

  // Sort newest first, then group by date.
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
      {/* Stats strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {[
          { label: 'Total Visits',   value: entries.length,  icon: '📋' },
          { label: 'Consultations',  value: completedCount,  icon: '✅' },
          { label: 'Doctors Seen',   value: uniqueDoctors,   icon: '👨‍⚕️' },
        ].map((s) => (
          <div key={s.label} className="card p-3 text-center">
            <div className="text-xl mb-1">{s.icon}</div>
            <div className="text-2xl font-bold text-slate-800 tabular-nums">{s.value}</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mt-0.5 leading-tight">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {uniqueClinics > 1 && (
        <p className="text-xs text-slate-400 text-center">
          Visits across <strong className="text-slate-500">{uniqueClinics} clinics</strong>
        </p>
      )}

      {/* Date-grouped entries */}
      {Array.from(byDate.entries()).map(([dateKey, dayEntries]) => (
        <DateGroup key={dateKey} dateKey={dateKey} entries={dayEntries} />
      ))}
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
  const ahead      = live?.peopleAhead ?? 0;
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
    prevAheadRef.current  = ahead;

    // Skip the very first render — no previous state to compare against.
    if (prevStatus === null) return;
    // Nothing changed.
    if (prevStatus === status && prevAhead === ahead) return;

    if (status === 'IN_CONSULTATION' && prevStatus !== 'IN_CONSULTATION') {
      sendBrowserNotif(`🔔 It's your turn!`, `Please proceed to the consultation room — ${entry.doctor.user.name}`);
      playChime(true);
      vibrate(true);
    } else if (status === 'WAITING' && ahead === 0 && (prevAhead === null || prevAhead > 0)) {
      sendBrowserNotif(`⚡ You're next!`, `Please be ready outside — ${entry.doctor.user.name}`);
      playChime(false);
      vibrate(false);
    }
  }, [status, ahead, entry.doctor.user.name]);

  // Total queue size for the progress bar.
  const totalInQueue = snapshot?.entries.filter(
    (e) => e.status === 'WAITING' || e.status === 'IN_CONSULTATION',
  ).length ?? 0;
  const progressPct = totalInQueue > 0
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
        {isNextUp && (
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
        {status === 'WAITING' && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-100 dark:ring-slate-700 p-3.5 text-center">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Your position in queue</div>
            <div className="text-3xl font-bold text-slate-800 dark:text-slate-100 mt-1 tabular-nums">
              {isNextUp ? 'Next' : `#${ahead + 1}`}
            </div>
          </div>
        )}

        {/* ETA + position */}
        {status === 'WAITING' && !isNextUp && (
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
                  <span>{totalInQueue - ahead} of {totalInQueue} seen</span>
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
