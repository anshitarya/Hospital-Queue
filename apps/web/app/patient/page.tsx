'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type QueueEntry, type Doctor } from '@/lib/api';
import { tokenDisplay } from '@/lib/tokenCode';
import { useDoctorQueue, usePatientStream } from '@/lib/socket';
import { useRequireRole } from '@/lib/useRequireRole';
import { Header } from '@/components/Header';
import { PageLoader, Spinner } from '@/components/PageLoader';
import { LiveIndicator } from '@/components/StatusPill';
import { useOutsideClick } from '@/lib/useOutsideClick';
import { NotificationBell, type PatientNotification } from '@/components/NotificationBell';
import { fmtWait } from '@/lib/datetime';
import { getLabels } from '@/lib/labels';
import { formatTimeIst, serviceDay, serviceDaysAgo, entryServiceDay, formatDateIst, formatRelativeTimeIst } from '@/lib/datetime';
import { resolveAvgMinutes, formatAvgMinutes } from '@/lib/queueAvg';
import { Icon } from '@/components/Icons';
import { BookingDirectory } from '@/components/BookingDirectory';

interface HistoryItem extends QueueEntry {
  doctor: Doctor;
}

const REFRESH_INTERVAL_MS = 30_000;
const REFRESH_INTERVAL_CONNECTED_MS = 120_000;
const UPCOMING_THRESHOLD = 5; // show alert when ≤ this many people ahead

// ─── Browser notification helpers ───────────────────────────────────────────
function requestNotifPermission() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    return Notification.requestPermission().catch(() => Notification.permission);
  }
  return Promise.resolve(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );
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
    const lastEnd = now + (notes.length - 1) * 0.25 + 0.4;
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
    setTimeout(() => { void ctx.close(); }, Math.ceil((lastEnd - now) * 1000) + 50);
  } catch {}
}

function vibrate(urgent: boolean) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(urgent ? [200, 100, 200, 100, 200] : [150, 80, 150]);
  }
}

// ─── Status display metadata ────────────────────────────────────────────────
const STATUS_META = {
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50', dot: 'bg-emerald-500' },
  SKIPPED:   { label: 'Skipped',   cls: 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50',       dot: 'bg-amber-500'   },
  CANCELLED: { label: 'Cancelled', cls: 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50',           dot: 'bg-rose-500'    },
  MISSED:    { label: 'Missed',    cls: 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50',           dot: 'bg-rose-400'    },
} as const;

// ─── Dynamic Branding Theme Helpers ─────────────────────────────────────────
const getClinicBranding = (clinicId: string) => {
  let hash = 0;
  for (let i = 0; i < clinicId.length; i++) {
    hash = clinicId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const themes = [
    {
      accent: 'emerald',
      border: 'hover:border-emerald-300 dark:hover:border-emerald-700',
      gradient: 'from-emerald-500 to-teal-500',
      lightBg: 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300',
      indicator: 'bg-emerald-500',
      pill: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
      glow: 'shadow-emerald-100 dark:shadow-emerald-950/10',
    },
    {
      accent: 'blue',
      border: 'hover:border-blue-300 dark:hover:border-blue-700',
      gradient: 'from-blue-500 to-cyan-500',
      lightBg: 'bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300',
      indicator: 'bg-blue-500',
      pill: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
      glow: 'shadow-blue-100 dark:shadow-blue-950/10',
    },
    {
      accent: 'violet',
      border: 'hover:border-violet-300 dark:hover:border-violet-700',
      gradient: 'from-violet-500 to-fuchsia-500',
      lightBg: 'bg-violet-50 dark:bg-violet-950/20 text-violet-800 dark:text-violet-300',
      indicator: 'bg-violet-500',
      pill: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
      glow: 'shadow-violet-100 dark:shadow-violet-950/10',
    },
    {
      accent: 'amber',
      border: 'hover:border-amber-300 dark:hover:border-amber-700',
      gradient: 'from-amber-500 to-orange-500',
      lightBg: 'bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300',
      indicator: 'bg-amber-500',
      pill: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
      glow: 'shadow-amber-100 dark:shadow-amber-950/10',
    },
    {
      accent: 'rose',
      border: 'hover:border-rose-300 dark:hover:border-rose-700',
      gradient: 'from-rose-500 to-pink-500',
      lightBg: 'bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300',
      indicator: 'bg-rose-500',
      pill: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
      glow: 'shadow-rose-100 dark:shadow-rose-950/10',
    },
  ];
  return themes[Math.abs(hash) % themes.length];
};

const getCategoryIcon = (businessType: string) => {
  switch (businessType) {
    case 'CLINIC': return { emoji: '🏥', label: 'Health' };
    case 'SALON':  return { emoji: '💇', label: 'Beauty' };
    case 'BANK':   return { emoji: '🏦', label: 'Finance' };
    case 'GOVT':   return { emoji: '🏛️', label: 'Public' };
    default:       return { emoji: '🛍️', label: 'Services' };
  }
};

// ─── Main PatientPage Component ───────────────────────────────────────────────
export default function PatientPage() {
  const { user, ready } = useRequireRole(['PATIENT']);

  const [history, setHistory]               = useState<HistoryItem[]>([]);
  const [completedIds, setCompletedIds]     = useState<Set<string>>(new Set());
  const [positionsMap, setPositionsMap]     = useState<Record<string, number>>({});
  const [refreshing, setRefreshing]         = useState(false);
  const [lastSync, setLastSync]             = useState<Date | null>(null);

  // Expanded/collapsed states for clinics/businesses. Key: clinicId
  const [expandedClinics, setExpandedClinics] = useState<Record<string, boolean>>({});

  // Filter & Search states
  const [activeTab, setActiveTab]           = useState<'active' | 'upcoming' | 'history' | 'discover'>('active');
  const [searchQuery, setSearchQuery]       = useState('');
  const [selectedClinicId, setSelectedClinicId] = useState<string>('ALL');

  // Persistent "You were missed" banners
  const [missedBanners, setMissedBanners]   = useState<HistoryItem[]>([]);
  const missedNotifiedRef = useRef<Set<string>>(new Set());

  // Dismissed notification IDs
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
      const todayStr = serviceDay();

      // Detect missed entries
      items
        .filter((e) => e.status === 'MISSED' && e.serviceDay === todayStr)
        .forEach((entry) => {
          if (missedNotifiedRef.current.has(entry.id)) return;
          missedNotifiedRef.current.add(entry.id);
          sendBrowserNotif(
            '⚠️ You were missed',
            `Please approach the reception desk to be re-added — ${entry.doctor.user.name}`,
          );
          playChime(false);
          vibrate(false);
          setMissedBanners((prev) => [...prev, entry]);
        });
      setHistory(items);
      setLastSync(new Date());
    } catch {
      // Socket fallbacks
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (!ready) return;
    fetchHistory();
  }, [ready, fetchHistory]);

  const { connected: streamConnected } = usePatientStream(ready, fetchHistory);

  useEffect(() => {
    if (!ready) return;
    const intervalMs = streamConnected ? REFRESH_INTERVAL_CONNECTED_MS : REFRESH_INTERVAL_MS;
    const t = setInterval(fetchHistory, intervalMs);
    return () => clearInterval(t);
  }, [ready, fetchHistory, streamConnected]);

  // Auto-clear missed banners
  useEffect(() => {
    if (missedBanners.length === 0) return;
    const liveDoctorIds = new Set(
      history
        .filter((e) => e.status === 'WAITING' || e.status === 'IN_CONSULTATION')
        .map((e) => e.doctor?.id)
        .filter(Boolean),
    );
    setMissedBanners((prev) => prev.filter((b) => !liveDoctorIds.has(b.doctor?.id)));
  }, [history]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const [notifPromptOpen, setNotifPromptOpen] = useState(false);
  const notifRequested = useRef(false);
  useEffect(() => {
    if (notifRequested.current) return;
    if (typeof Notification === 'undefined') return;
    const hasLive = history.some(
      (e) => e.status === 'WAITING' || e.status === 'IN_CONSULTATION',
    );
    if (hasLive && Notification.permission === 'default') {
      notifRequested.current = true;
      setNotifPromptOpen(true);
    }
  }, [history]);

  const handleCompleted = useCallback((updated: HistoryItem) => {
    setCompletedIds((prev) => new Set([...prev, updated.id]));
  }, []);

  // Filter definitions
  const isActive = useCallback((e: HistoryItem) => {
    return (e.status === 'WAITING' || e.status === 'IN_CONSULTATION') && !completedIds.has(e.id) && entryServiceDay(e) === serviceDay();
  }, [completedIds]);

  const isUpcoming = useCallback((e: HistoryItem) => {
    const isFutureDay = entryServiceDay(e) > serviceDay();
    const isFutureTimeToday = entryServiceDay(e) === serviceDay() && !!e.appointmentTime && new Date(e.appointmentTime).getTime() > Date.now();
    return e.status === 'WAITING' && (isFutureDay || isFutureTimeToday) && !isActive(e);
  }, [isActive]);

  const isCompleted = useCallback((e: HistoryItem) => {
    return e.status === 'COMPLETED' || completedIds.has(e.id);
  }, [completedIds]);

  const isCancelled = useCallback((e: HistoryItem) => {
    return e.status === 'CANCELLED' || e.status === 'SKIPPED' || e.status === 'MISSED';
  }, []);

  // Set default expands when new active/upcoming entries arrive
  useEffect(() => {
    if (history.length === 0) return;
    setExpandedClinics((prev) => {
      const next = { ...prev };
      history.forEach((e) => {
        if (e.doctor.clinic) {
          const cid = e.doctor.clinic.id;
          if (next[cid] === undefined) {
            next[cid] = isActive(e) || isUpcoming(e);
          }
        }
      });
      return next;
    });
  }, [history, isActive, isUpcoming]);

  if (!ready) return <PageLoader label="Loading your queue…" />;

  // Group listings and status counts
  const liveEntries = history.filter(isActive);
  const upcomingEntries = history.filter(isUpcoming);
  const completedTodayEntries = history.filter((e) => isCompleted(e) && entryServiceDay(e) === serviceDay());

  const filteredHistory = history.filter((e) => {
    // Tab filtering
    if (activeTab === 'active' && !isActive(e)) return false;
    if (activeTab === 'upcoming' && !isUpcoming(e)) return false;
    if (activeTab === 'history' && !isCompleted(e) && !isCancelled(e)) return false;
    if (activeTab === 'discover') return false; // discover tab shows BookingDirectory instead

    // Search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const clinicName = e.doctor.clinic?.name?.toLowerCase() || '';
      const doctorName = e.doctor.user.name?.toLowerCase() || '';
      const deptName = e.doctor.department?.name?.toLowerCase() || '';
      if (!clinicName.includes(query) && !doctorName.includes(query) && !deptName.includes(query)) return false;
    }

    // Business filter selector
    if (selectedClinicId !== 'ALL' && e.doctor.clinicId !== selectedClinicId) return false;

    return true;
  });

  // Group filtered results by Business (Clinic)
  const groupedBusinesses = Array.from(
    filteredHistory.reduce((acc, entry) => {
      const clinic = entry.doctor.clinic;
      if (!clinic) return acc;
      if (!acc.has(clinic.id)) {
        acc.set(clinic.id, {
          clinic: {
            id: clinic.id,
            name: clinic.name,
            address: clinic.address || null,
            businessType: clinic.businessType || 'GENERAL',
          },
          entries: [],
        });
      }
      acc.get(clinic.id)!.entries.push(entry);
      return acc;
    }, new Map<string, { clinic: { id: string; name: string; address: string | null; businessType: string }; entries: HistoryItem[] }>()).values()
  );

  const sortedHistory = useMemo(() => {
    return [...filteredHistory].sort((a, b) => {
      const timeA = new Date(a.completedAt || a.joinedAt).getTime();
      const timeB = new Date(b.completedAt || b.joinedAt).getTime();
      return timeB - timeA;
    });
  }, [filteredHistory]);

  // List of all unique businesses for dropdown filter
  const uniqueBusinessesList = Array.from(
    history.reduce((map, e) => {
      if (e.doctor.clinic) {
        map.set(e.doctor.clinic.id, e.doctor.clinic.name);
      }
      return map;
    }, new Map<string, string>()).entries()
  ).map(([id, name]) => ({ id, name }));

  // Highlight nearest upcoming appointment
  const nearestUpcoming = (() => {
    const upcoming = history.filter(isUpcoming);
    if (upcoming.length === 0) return null;
    return [...upcoming].sort((a, b) => {
      const t1 = a.appointmentTime ? new Date(a.appointmentTime).getTime() : Infinity;
      const t2 = b.appointmentTime ? new Date(b.appointmentTime).getTime() : Infinity;
      return t1 - t2;
    })[0];
  })();

  // Real-time positions for socket watcher
  const allNotifications: PatientNotification[] = [
    ...liveEntries.map((e): PatientNotification => {
      const pos    = positionsMap[e.id] ?? 0;
      const isNext = pos === 0;
      return {
        id:    `upcoming-${e.id}-${pos}`,
        type:  isNext ? 'urgent' : 'upcoming',
        title: isNext
          ? `It's your turn — ${e.doctor.user.name}`
          : `Almost your turn with ${e.doctor.user.name}`,
        body: isNext
          ? `Please proceed to the ${getLabels(e.doctor.clinic?.businessType).serviceRoom} now.${e.doctor.clinic?.name ? ` · ${e.doctor.clinic.name}` : ''}`
          : `${pos} ${pos === 1 ? 'person' : 'people'} ahead of you — please be ready nearby.${e.doctor.clinic?.name ? ` · ${e.doctor.clinic.name}` : ''}`,
      };
    }),
    ...history.filter((e) => e.status === 'MISSED' && entryServiceDay(e) === serviceDay()).map((e): PatientNotification => ({
      id:    `missed-${e.id}`,
      type:  'missed',
      title: `Missed — ${e.doctor.user.name}`,
      body:  `You were marked as missed${e.doctor.clinic?.name ? ` at ${e.doctor.clinic.name}` : ''}. Please reach out to the ${getLabels(e.doctor.clinic?.businessType).receptionDesk} if you need to be re-added.`,
    })),
  ];
  const notifications = allNotifications.filter((n) => !dismissedIds.has(n.id));

  const toggleExpand = (clinicId: string) => {
    setExpandedClinics((prev) => ({ ...prev, [clinicId]: !prev[clinicId] }));
  };

  return (
    <>
      {/* Headless socket watchers */}
      {liveEntries.map((e) => (
        <QueueWatcher key={e.id} entry={e} onPositionUpdate={handlePositionUpdate} />
      ))}

      <Header
        title="Dashboard"
        actions={
          <NotificationBell
            notifications={notifications}
            onDismiss={dismissNotif}
            onDismissAll={() => dismissAllNotifs(notifications.map((n) => n.id))}
          />
        }
      />

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-6 animate-fade-in">
        {/* Browser Notification Permission Prompt */}
        {notifPromptOpen && typeof Notification !== 'undefined' && Notification.permission === 'default' && (
          <div className="rounded-2xl bg-brand-50 dark:bg-brand-950/30 ring-1 ring-brand-200 dark:ring-brand-900/60 p-4 flex items-start gap-3.5 shadow-sm animate-slide-up">
            <Icon.Bell className="h-5 w-5 text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
                Allow notifications to receive real-time queue updates. We&apos;ll alert you immediately when your turn is coming up.
              </p>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  className="btn-primary !py-1.5 !px-3.5 text-xs font-semibold"
                  onClick={() => {
                    void requestNotifPermission().finally(() => setNotifPromptOpen(false));
                  }}
                >
                  Enable notifications
                </button>
                <button
                  type="button"
                  className="btn-secondary !py-1.5 !px-3.5 text-xs font-semibold"
                  onClick={() => setNotifPromptOpen(false)}
                >
                  Maybe later
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Sync status banner ── */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <span className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <LiveIndicator connected={streamConnected} />
            {lastSync ? `Updated ${formatRelative(lastSync)}` : 'Connecting to live queue…'}
          </span>
          <button type="button" onClick={fetchHistory} disabled={refreshing}
            className="btn-secondary !py-1 !px-3 text-xs font-semibold flex items-center gap-1.5" aria-label="Sync status">
            <span className={refreshing ? 'animate-spin inline-block' : 'inline-block'}>↻</span>
            <span>Sync</span>
          </button>
        </div>

        {/* ── Summary Stats Section (Requirement 10) ── */}
        <section className="grid grid-cols-3 gap-3 md:gap-4">
          <div className="card p-3 md:p-4 bg-emerald-50/40 dark:bg-emerald-950/10 ring-emerald-100/50 dark:ring-emerald-900/10 flex flex-col justify-between">
            <span className="text-[10px] md:text-xs font-semibold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">Active</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100 tabular-nums">{liveEntries.length}</span>
              <span className="text-xs text-slate-400 font-medium">live</span>
            </div>
          </div>
          <div className="card p-3 md:p-4 bg-brand-50/40 dark:bg-brand-950/10 ring-brand-100/50 dark:ring-brand-900/10 flex flex-col justify-between">
            <span className="text-[10px] md:text-xs font-semibold text-brand-800 dark:text-brand-400 uppercase tracking-wider">Upcoming</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100 tabular-nums">{upcomingEntries.length}</span>
              <span className="text-xs text-slate-400 font-medium">booked</span>
            </div>
          </div>
          <div className="card p-3 md:p-4 bg-slate-50 dark:bg-slate-900/40 ring-slate-200/50 dark:ring-slate-800/50 flex flex-col justify-between">
            <span className="text-[10px] md:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Completed Today</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-2xl md:text-3xl font-extrabold text-slate-800 dark:text-slate-100 tabular-nums">{completedTodayEntries.length}</span>
              <span className="text-xs text-slate-400 font-medium">today</span>
            </div>
          </div>
        </section>

        {/* ── Nearest Upcoming Highlight Card (Requirement 6) ── */}
        {nearestUpcoming && (
          <section className="animate-slide-up">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Nearest Upcoming Appointment</h2>
            <div className="card p-4 ring-2 ring-brand-400/30 bg-gradient-to-r from-white to-brand-50/20 dark:from-slate-900 dark:to-brand-950/10 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-500 to-emerald-500 flex items-center justify-center text-white text-base font-bold shadow-sm">
                  {nearestUpcoming.doctor.clinic?.name.charAt(0) || 'B'}
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">{nearestUpcoming.doctor.clinic?.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{nearestUpcoming.doctor.user.name} · {nearestUpcoming.doctor.department?.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto border-t md:border-t-0 border-slate-100 dark:border-slate-800 pt-3 md:pt-0">
                <div className="text-left md:text-right flex-1 md:flex-none">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {nearestUpcoming.appointmentTime ? formatDateIst(nearestUpcoming.appointmentTime, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Today'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {nearestUpcoming.appointmentTime ? formatTimeIst(nearestUpcoming.appointmentTime) : 'N/A'}
                  </p>
                </div>
                <span className="pill bg-brand-100 text-brand-700 ring-brand-200/50 dark:bg-brand-900/40 dark:text-brand-300">
                  {tokenDisplay(nearestUpcoming.tokenNumber)}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* ── Filters & Search Section (Requirement 4) ── */}
        <section className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Status tab bar */}
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full md:w-auto">
              {(['active', 'upcoming', 'history', 'discover'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 md:flex-none rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-all ${
                    activeTab === tab
                      ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Business Dropdown filter (Requirement 4: All Businesses) */}
            {uniqueBusinessesList.length > 0 && (
              <div className="relative w-full md:w-60">
                <select
                  value={selectedClinicId}
                  onChange={(e) => setSelectedClinicId(e.target.value)}
                  className="w-full text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="ALL">All Businesses</option>
                  {uniqueBusinessesList.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Search Input */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search appointments by business, provider, or specialty..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>
        </section>

        {/* ── Active Missed Banners ── */}
        {activeTab === 'active' && missedBanners.map((entry) => (
          <div key={entry.id} className="rounded-xl bg-rose-50 dark:bg-rose-950/20 border-2 border-rose-300 dark:border-rose-900 text-rose-800 dark:text-rose-300 px-4 py-3 flex items-start gap-3.5 shadow-sm animate-slide-up">
            <span className="text-lg mt-0.5">⚠️</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">You were missed — {entry.doctor.user.name}</div>
              <div className="text-xs mt-0.5 opacity-80 leading-relaxed">
                Please approach the receptionist at <strong>{entry.doctor.clinic?.name}</strong> to be re-added to the live queue.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMissedBanners((prev) => prev.filter((e) => e.id !== entry.id))}
              className="shrink-0 text-rose-400 hover:text-rose-600 text-base font-bold leading-none p-1"
              aria-label="Dismiss banner"
            >✕</button>
          </div>
        ))}

        {/* ── Grouped Business Cards or Chronological History Feed ── */}
        <section className="space-y-4">
          {/* Discover tab — self-booking business directory */}
          {activeTab === 'discover' && user && (
            <BookingDirectory patientId={user.id} />
          )}
          {activeTab === 'history' ? (
            sortedHistory.length > 0 ? (
              <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-4 pl-6 space-y-6 py-2">
                {sortedHistory.map((entry) => {
                  const branding = getClinicBranding(entry.doctor.clinicId || '');
                  const isComp = entry.status === 'COMPLETED';
                  const meta = STATUS_META[entry.status as keyof typeof STATUS_META] || {
                    label: entry.status,
                    cls: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700/50',
                  };

                  const formatPastDate = (dateStr: string) => {
                    const date = new Date(dateStr);
                    const now = new Date();
                    const timeStr = formatTimeIst(dateStr);
                    const todayStr = serviceDay(now);
                    const yesterdayStr = serviceDay(new Date(now.getTime() - 86400000));
                    const itemDayStr = serviceDay(date);

                    if (itemDayStr === todayStr) {
                      return `Today at ${timeStr}`;
                    } else if (itemDayStr === yesterdayStr) {
                      return `Yesterday at ${timeStr}`;
                    } else {
                      return `${formatDateIst(dateStr, { month: 'short', day: 'numeric' })} at ${timeStr}`;
                    }
                  };

                  const displayTime = formatPastDate(entry.completedAt || entry.joinedAt);

                  return (
                    <article key={entry.id} className="relative group animate-enter">
                      <span className={`absolute -left-[31px] top-1.5 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 bg-gradient-to-br ${branding.gradient} shadow-sm shrink-0`} />
                      
                      <div className="card p-5 hover:shadow-md transition-shadow duration-200 bg-white dark:bg-slate-900">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                                {entry.doctor.clinic?.name ?? 'Clinic'}
                              </span>
                              <span className="text-slate-300 dark:text-slate-700">·</span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                {displayTime}
                              </span>
                            </div>
                            
                            <h4 className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                              {entry.doctor.user.name}
                            </h4>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                              {entry.doctor.department?.name || 'General Specialty'}
                            </p>
                          </div>
                          
                          <div className="flex items-center sm:flex-col sm:items-end gap-2 shrink-0">
                            <span className="font-mono text-xs font-extrabold text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-900/60 px-2 py-0.5 rounded-lg border border-slate-100 dark:border-slate-800/80">
                              {tokenDisplay(entry.tokenNumber)}
                            </span>
                            <span className={`pill ring-1 ring-inset capitalize text-[10px] py-0.5 px-2 ${meta.cls}`}>
                              {meta.label}
                            </span>
                          </div>
                        </div>

                        {isComp && (
                          <div className="border-t border-slate-100 dark:border-slate-800/60 mt-4 pt-4">
                            <VisitRatingPanel entryId={entry.id} doctorName={entry.doctor.user.name} onDone={fetchHistory} />
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="card p-12 text-center animate-fade-in ring-1 ring-slate-100 dark:ring-slate-800/60 bg-white dark:bg-slate-900">
                <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-800/40 flex items-center justify-center text-3xl mb-4 shadow-inner">
                  📋
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Your history is empty</h3>
                <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
                  Your completed, cancelled, missed, or skipped sessions will appear here automatically.
                </p>
              </div>
            )
          ) : (
            groupedBusinesses.length > 0 ? (
              groupedBusinesses.map(({ clinic, entries: businessEntries }) => {
                const branding = getClinicBranding(clinic.id);
                const category = getCategoryIcon(clinic.businessType);
                const isExpanded = expandedClinics[clinic.id] ?? true;

                const activeItems = businessEntries.filter(isActive);
                const otherItems = businessEntries.filter((e) => !isActive(e));

                return (
                  <article
                    key={clinic.id}
                    className={`card overflow-hidden transition-all duration-200 border-t-[3px] ${branding.border} shadow-sm`}
                    style={{ borderTopColor: `var(--color-${branding.accent}-500)` }}
                  >
                    <header className="px-4 py-3.5 bg-slate-50/50 dark:bg-slate-900/60 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${branding.gradient} flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0`}>
                          {clinic.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{clinic.name}</h3>
                            <span className={`pill-sm ${branding.pill} px-2 py-0.5 shrink-0 flex items-center gap-1`}>
                              <span>{category.emoji}</span>
                              <span className="hidden sm:inline font-semibold text-[9px] uppercase tracking-wider">{category.label}</span>
                            </span>
                          </div>
                          {clinic.address && (
                            <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-xs sm:max-w-md">{clinic.address}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-bold bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-0.5">
                          {businessEntries.length} {businessEntries.length === 1 ? 'appointment' : 'appointments'}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleExpand(clinic.id)}
                          className="btn-icon !p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                          aria-label={isExpanded ? 'Collapse business section' : 'Expand business section'}
                        >
                          {isExpanded ? (
                            <Icon.ChevronDown className="h-4 w-4 text-slate-400 transform rotate-180 transition-transform" />
                          ) : (
                            <Icon.ChevronDown className="h-4 w-4 text-slate-400 transition-transform" />
                          )}
                        </button>
                      </div>
                    </header>

                    {isExpanded && (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800/60 p-4 space-y-4">
                        {activeItems.length > 0 && (
                          <div className="space-y-4 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Live Queue Tracking</span>
                            </div>
                            {activeItems.map((entry) => (
                              <ActiveAppointmentCard
                                key={entry.id}
                                entry={entry}
                                branding={branding}
                                onCompleted={handleCompleted}
                                onPositionUpdate={handlePositionUpdate}
                              />
                            ))}
                          </div>
                        )}

                        {otherItems.length > 0 && (
                          <div className={`${activeItems.length > 0 ? 'pt-4' : ''} space-y-2`}>
                            {activeItems.length > 0 && (
                              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Other Appointments</span>
                            )}
                            {otherItems.map((entry) => {
                              const meta = STATUS_META[entry.status as keyof typeof STATUS_META] || {
                                label: entry.status,
                                cls: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700/50',
                                dot: 'bg-slate-400',
                              };

                              const isUpc = isUpcoming(entry);

                              return (
                                <div key={entry.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/60 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/80 hover:bg-slate-100/40 dark:hover:bg-slate-900/80 transition-colors gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                                        {tokenDisplay(entry.tokenNumber)}
                                      </span>
                                      <span className="text-slate-300 dark:text-slate-700">·</span>
                                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{entry.doctor.user.name}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                                      <span>{entry.doctor.department?.name || 'General'}</span>
                                      <span>·</span>
                                      <span>
                                        {isUpc && entry.appointmentTime
                                          ? `Scheduled for ${formatDateIst(entry.appointmentTime, { month: 'short', day: 'numeric' })} at ${formatTimeIst(entry.appointmentTime)}`
                                          : `Joined ${formatDateIst(entry.joinedAt, { month: 'short', day: 'numeric' })} at ${formatTimeIst(entry.joinedAt)}`
                                        }
                                      </span>
                                    </p>
                                  </div>
                                  <span className={`pill ring-1 ring-inset shrink-0 capitalize ${meta.cls}`}>{meta.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            ) : (
              <div className="card p-12 text-center animate-fade-in ring-1 ring-slate-100 dark:ring-slate-800/60 bg-white dark:bg-slate-900">
                <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-800/40 flex items-center justify-center text-3xl mb-4 shadow-inner">
                  {activeTab === 'active' ? '🩺' : '📅'}
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {activeTab === 'active' && 'No active appointments'}
                  {activeTab === 'upcoming' && 'No upcoming appointments'}
                </h3>
                <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
                  {activeTab === 'active' && 'You currently have no live tracking queues running. Ask the reception desk to check you in.'}
                  {activeTab === 'upcoming' && 'No scheduled appointments in the pipeline. You can book an appointment to register.'}
                </p>
              </div>
            )
          )}
        </section>
      </main>
    </>
  );
}

// ─── Active Appointment Card Component ─────────────────────────────────────────
function ActiveAppointmentCard({
  entry,
  branding,
  onCompleted,
  onPositionUpdate,
}: {
  entry: HistoryItem;
  branding: ReturnType<typeof getClinicBranding>;
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

  // Pre-populate position data from HTTP on mount
  const [initAhead, setInitAhead]           = useState<number | null>(null);
  const [initCurrentToken, setInitCurrentToken] = useState<number | null>(null);
  const [initEta, setInitEta]               = useState<number>(0);
  const [initEtaAbs, setInitEtaAbs]         = useState<string | undefined>(undefined);
  const [initMovingAvg, setInitMovingAvg]   = useState<number | null>(null);
  const initFetched = useRef(false);
  const [avgTick, setAvgTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setAvgTick((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (initFetched.current) return;
    initFetched.current = true;
    api<{ entry: { peopleAhead?: number; etaMinutes?: number; etaAbsolute?: string; movingAvgMinutes?: number | null }; currentToken: number | null; movingAvgMinutes?: number | null }>(
      `/queue/entry/${entry.id}`,
    ).then(({ entry: e, currentToken, movingAvgMinutes }) => {
      if (e.peopleAhead !== undefined) setInitAhead(e.peopleAhead);
      setInitCurrentToken(currentToken);
      if (e.etaMinutes !== undefined) setInitEta(e.etaMinutes);
      if (e.etaAbsolute !== undefined) setInitEtaAbs(e.etaAbsolute);
      setInitMovingAvg(e.movingAvgMinutes ?? movingAvgMinutes ?? null);
    }).catch(() => {});
  }, [entry.id]);

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
  const isMissedInQueue = snapshot !== null && (snapshot.missedEntries?.some((e) => e.id === entry.id) ?? false);

  // Detect completion
  useEffect(() => {
    if (completedFired.current) return;
    if (isMissedInQueue) return;
    if (snapshot !== null && !live) {
      completedFired.current = true;
      api<{ entry: QueueEntry }>(`/queue/entry/${entry.id}`)
        .then(({ entry: updated }) => {
          setFinalStatus(updated.status);
          if (updated.status !== 'COMPLETED') {
            setTimeout(() => onCompleted({ ...entry, status: updated.status as HistoryItem['status'] }), 4000);
          }
        })
        .catch(() => {
          setFinalStatus('COMPLETED');
        });
    }
  }, [snapshot, live, isMissedInQueue, entry, onCompleted]);

  const status    = live?.status ?? entry.status;
  const ahead     = live !== undefined ? (live.peopleAhead ?? null) : initAhead;
  const eta       = live?.etaMinutes ?? initEta;
  const etaAbs    = live?.etaAbsolute ?? initEtaAbs;

  const avgDisplay = useMemo(() => {
    if (snapshot) return resolveAvgMinutes(snapshot);
    if (initMovingAvg != null) {
      return { value: initMovingAvg, label: formatAvgMinutes(initMovingAvg), live: true };
    }
    if (entry.doctor.avgConsultMinutes) {
      return { value: entry.doctor.avgConsultMinutes, label: formatAvgMinutes(entry.doctor.avgConsultMinutes), live: false };
    }
    return null;
  }, [snapshot, initMovingAvg, entry.doctor.avgConsultMinutes, avgTick]);

  const L = getLabels(entry.doctor.clinic?.businessType);
  const isInConsult = status === 'IN_CONSULTATION';
  const isNextUp    = status === 'WAITING' && ahead === 0;
  const isUrgent    = isInConsult || isNextUp;

  const breakUntil  = snapshot?.doctor?.breakUntil ? new Date(snapshot.doctor.breakUntil) : null;
  const breakActive = snapshot?.doctor?.status === 'PAUSED' && breakUntil && breakUntil.getTime() > Date.now();
  const queueNotStarted = snapshot !== null && snapshot.hasStartedToday === false && status === 'WAITING';

  // Chime and notifications on queue changes
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    const prevAhead  = prevAheadRef.current;
    prevStatusRef.current = status;
    prevAheadRef.current  = ahead ?? null;

    if (prevStatus === null) return;
    if (prevStatus === status && prevAhead === ahead) return;

    if (status === 'IN_CONSULTATION' && prevStatus !== 'IN_CONSULTATION') {
      sendBrowserNotif(`🔔 It's your turn!`, `Please proceed to the consultation room — ${entry.doctor.user.name}`);
      playChime(true);
      vibrate(true);
    } else if (status === 'WAITING' && ahead === 0 && prevAhead !== null && prevAhead > 0) {
      sendBrowserNotif(`⚡ You're next!`, `Please be ready outside — ${entry.doctor.user.name}`);
      playChime(false);
      vibrate(false);
    }
  }, [status, ahead, entry.doctor.user.name]);

  const totalInQueue = snapshot?.entries.filter(
    (e) => e.status === 'WAITING' || e.status === 'IN_CONSULTATION',
  ).length ?? 0;
  const progressPct = totalInQueue > 0 && ahead !== null
    ? Math.round(((totalInQueue - ahead) / totalInQueue) * 100)
    : 0;

  if (finalStatus) {
    const isDone = finalStatus === 'COMPLETED';
    return (
      <div className="card p-6 text-center animate-fade-in border border-slate-100 dark:border-slate-800">
        <div className={`mx-auto h-12 w-12 rounded-xl flex items-center justify-center text-xl font-bold mb-3 shadow-inner ${isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'}`}>
          {isDone ? '✓' : '×'}
        </div>
        <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
          {finalStatus === 'COMPLETED' ? 'Consultation complete'
            : finalStatus === 'SKIPPED' ? 'Marked as skipped'
            : finalStatus === 'MISSED'  ? 'You were marked as missed'
            : 'Appointment cancelled'}
        </div>
        {finalStatus === 'MISSED' && (
          <p className="text-xs text-rose-600 mt-1">
            Please reach out to the front desk receptionist to rejoin.
          </p>
        )}
        <div className="text-xs text-slate-400 mt-1">
          Token <span className="font-mono font-bold text-brand-700">{tokenDisplay(entry.tokenNumber)}</span> with {entry.doctor.user.name}
        </div>
        {isDone && (
          <VisitRatingPanel
            entryId={entry.id}
            doctorName={entry.doctor.user.name}
            onDone={() => onCompleted({ ...entry, status: 'COMPLETED' })}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border transition-all ${isUrgent ? 'border-brand-400/50 bg-gradient-to-br from-brand-50/10 to-transparent dark:from-brand-950/5' : 'border-slate-100 dark:border-slate-800/80 bg-slate-50/20'} p-4 space-y-4 shadow-sm`}>
      {/* Provider row */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">{entry.doctor.user.name}</h4>
          <p className="text-[10px] text-slate-400 mt-0.5">{entry.doctor.department?.name || 'General'}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <LiveIndicator connected={connected} />
        </div>
      </div>

      {/* Alert banners */}
      {isInConsult && (
        <div className="rounded-lg bg-emerald-500 text-white text-center font-bold text-[11px] py-2 px-3 animate-pulse-slow shadow-sm">
          🔔 It&apos;s your turn — please enter the {L.serviceRoom}
        </div>
      )}
      {ahead !== null && isNextUp && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-center font-semibold text-[11px] py-2 px-3">
          ⚡ You&apos;re next up — please wait nearby
        </div>
      )}
      {(isMissedInQueue || status === 'MISSED') && (
        <div className="rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-300 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-center font-semibold text-[11px] py-2 px-3">
          ⚠️ You were missed — please approach the {L.receptionDesk}
        </div>
      )}
      {queueNotStarted && (
        <div className="rounded-lg bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400 text-center">
          ⏳ Queue hasn&apos;t started today yet · You will be called soon.
        </div>
      )}
      {breakActive && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300 text-center">
          ☕ On a short break — returning at{' '}
          <strong>{formatTimeIst(breakUntil!)}</strong>
          {snapshot?.doctor?.breakNote && ` · ${snapshot.doctor.breakNote}`}
        </div>
      )}

      {/* Token details grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-xl p-3 text-center ${isInConsult ? 'bg-emerald-500/10 dark:bg-emerald-950/20 ring-1 ring-emerald-500/20' : 'bg-slate-100/50 dark:bg-slate-900/60'}`}>
          <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Your Token</div>
          <div className={`text-3xl font-extrabold leading-none tabular-nums ${isInConsult ? 'text-emerald-600 dark:text-emerald-400' : 'text-brand-600 dark:text-brand-400'}`}>
            {tokenDisplay(entry.tokenNumber)}
          </div>
        </div>
        <div className="rounded-xl p-3 text-center bg-slate-100/50 dark:bg-slate-900/60">
          <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Now Serving</div>
          <div className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 leading-none tabular-nums">
            {(snapshot?.currentToken ?? initCurrentToken) ? tokenDisplay((snapshot?.currentToken ?? initCurrentToken)!) : '—'}
          </div>
        </div>
      </div>

      {/* Position card */}
      {status === 'WAITING' && ahead !== null && !queueNotStarted && (
        <div className="rounded-xl bg-slate-100/30 dark:bg-slate-900/20 border border-slate-100 dark:border-slate-800/80 p-3 flex justify-between items-center text-xs">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Position in Queue</span>
            <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5 block">
              {isNextUp ? 'Next Up' : `${ahead + 1}`}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Est. Wait</span>
            <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5 block">
              {fmtWait(eta)}
            </span>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {status === 'WAITING' && !isNextUp && ahead !== null && !queueNotStarted && totalInQueue > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-[9px] text-slate-400 font-semibold uppercase tracking-wider">
            <span>Queue Progress</span>
            <span>{totalInQueue - ahead} of {totalInQueue} seen</span>
          </div>
          <div className="h-2 bg-slate-100 dark:bg-slate-850 rounded-full overflow-hidden">
            <div
              className={`h-full bg-${branding.accent}-500 dark:bg-${branding.accent}-400 rounded-full transition-all duration-700`}
              style={{ width: `${progressPct}%`, backgroundColor: `var(--color-${branding.accent}-500)` }}
            />
          </div>
        </div>
      )}

      {/* Cancel button */}
      {status === 'WAITING' && (
        <div className="border-t border-slate-100 dark:border-slate-800/60 pt-2 text-center">
          {cancelError && (
            <p className="text-[10px] text-rose-600 mb-2 font-medium">{cancelError}</p>
          )}
          {showCancelConfirm ? (
            <div className="rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 p-2.5 space-y-2">
              <p className="text-[11px] font-semibold text-rose-800 dark:text-rose-300">
                Cancel token with {entry.doctor.user.name}?
              </p>
              <div className="flex gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  className="rounded px-2.5 py-1 bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 text-[10px] text-slate-600 dark:text-slate-300 font-bold"
                >
                  Keep
                </button>
                <button
                  type="button"
                  onClick={confirmCancel}
                  disabled={cancelling}
                  className="rounded px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold disabled:opacity-50"
                >
                  Yes, cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="text-[10px] text-slate-400 hover:text-rose-500 font-bold transition-colors"
            >
              Cancel appointment
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Headless queue watcher helper ───────────────────────────────────────────
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

// ─── Visit rating sub-panel ──────────────────────────────────────────────────
interface ProfessionalRating {
  id: string;
  rating: number;
  comment: string | null;
}

function VisitRatingPanel({
  entryId,
  doctorName,
  onDone,
}: {
  entryId: string;
  doctorName: string;
  onDone: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [existing, setExisting] = useState<ProfessionalRating | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ProfessionalRating | null>(`/ratings/entry/${entryId}`)
      .then((r) => { if (r) setExisting(r); })
      .catch(() => {});
  }, [entryId]);

  async function submit() {
    if (rating < 1) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<ProfessionalRating>('/ratings', {
        method: 'POST',
        body: { entryId, rating, comment: comment.trim() || undefined },
      });
      setExisting(res);
      setTimeout(onDone, 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit rating');
    } finally {
      setSubmitting(false);
    }
  }

  if (existing) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900 text-left animate-fade-in">
        <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Thank you for your rating!</div>
        <div className="text-lg mt-1" aria-label={`${existing.rating} out of 5 stars`}>
          {'★'.repeat(existing.rating)}{'☆'.repeat(5 - existing.rating)}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 p-3 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left animate-fade-in space-y-2">
      <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
        Rate your consultation with {doctorName}
      </p>
      <div className="flex gap-1 justify-center" role="group" aria-label="Star rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="text-2xl transition-transform hover:scale-110 focus:outline-none"
            aria-label={`${n} star${n !== 1 ? 's' : ''}`}
          >
            {(hover || rating) >= n ? '★' : '☆'}
          </button>
        ))}
      </div>
      <textarea
        className="w-full text-xs rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-2 placeholder:text-slate-400 text-slate-800 dark:text-slate-100 focus:outline-none"
        rows={2}
        placeholder="Any additional feedback..."
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
      />
      {error && <p className="text-[10px] text-rose-600">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onDone} className="text-[10px] text-slate-400 font-bold px-2 py-1">
          Skip
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={rating < 1 || submitting}
          className="rounded px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white text-[10px] font-bold disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

// ─── Format helper fallbacks ─────────────────────────────────────────────────
function formatRelative(d: Date) {
  return formatRelativeTimeIst(d);
}
