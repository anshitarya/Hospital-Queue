'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type QueueEntry, type Doctor } from '@/lib/api';
import { useDoctorQueue, usePatientStream } from '@/lib/socket';
import { useRequireRole } from '@/lib/useRequireRole';
import { Header } from '@/components/Header';
import { PageLoader } from '@/components/PageLoader';
import { LiveIndicator } from '@/components/StatusPill';

interface HistoryItem extends QueueEntry {
  doctor: Doctor;
}

const REFRESH_INTERVAL_MS = 30_000; // belt-and-suspenders re-fetch, on top of sockets

export default function PatientPage() {
  const { user, ready } = useRequireRole(['PATIENT']);
  const [liveEntries, setLiveEntries] = useState<HistoryItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      const items = await api<HistoryItem[]>(`/patients/${user.id}/history`);
      setHistory(items);
      const live = items.filter(
        (e) => e.status === 'WAITING' || e.status === 'IN_CONSULTATION',
      );
      setLiveEntries(live);
      setLastSync(new Date());
    } catch {
      // Quietly ignore — socket will catch up in the background.
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  // Initial fetch + auto-refresh every 30s.
  useEffect(() => {
    if (!ready) return;
    fetchHistory();
    const t = setInterval(fetchHistory, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [ready, fetchHistory]);

  // Real-time stream — refetch immediately when reception / doctor changes our
  // queue state. The 30s poll above stays as a safety net for missed events.
  const { connected: streamConnected } = usePatientStream(ready, () => {
    fetchHistory();
  });

  if (!ready) return <PageLoader label="Loading your queue…" />;

  const pastEntries = history.filter(
    (e) => e.status !== 'WAITING' && e.status !== 'IN_CONSULTATION',
  );

  return (
    <>
      <Header title="My queue" />
      <main className="mx-auto max-w-2xl p-4 space-y-4 animate-fade-in">

        {/* Refresh bar */}
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span className="flex items-center gap-2">
            <LiveIndicator connected={streamConnected} />
            {lastSync ? `Updated ${formatRelative(lastSync)}` : 'Syncing…'}
          </span>
          <button
            type="button"
            onClick={fetchHistory}
            disabled={refreshing}
            className="btn-ghost !py-2 !px-3 text-xs min-h-[44px]"
            aria-label="Refresh queue"
          >
            <span className={refreshing ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
            <span className="ml-1">Refresh</span>
          </button>
        </div>

        {liveEntries.length === 0 && (
          <div className="card p-8 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-2xl mb-3">
              ⏳
            </div>
            <h2 className="text-lg font-semibold">No active queue entry</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
              Once reception checks you in, your token will appear here in real time —
              no need to refresh.
            </p>
          </div>
        )}

        {/* One card per live doctor entry */}
        {liveEntries.map((entry) => (
          <ActiveEntry
            key={entry.id}
            entry={entry}
            onCompleted={(updatedEntry) =>
              setLiveEntries((prev) => prev.filter((e) => e.id !== updatedEntry.id))
            }
          />
        ))}

        {pastEntries.length > 0 && (
          <section className="card p-5">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              Recent visits
              <span className="text-xs font-normal text-slate-400">
                last {Math.min(pastEntries.length, 10)}
              </span>
            </h3>
            <div className="divide-y">
              {pastEntries.slice(0, 10).map((h) => (
                <div key={h.id} className="py-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">
                      #{h.tokenNumber} · {h.doctor.user.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(h.joinedAt).toLocaleString()}
                    </div>
                  </div>
                  <span className={
                    'pill ring-1 ring-inset ' +
                    (h.status === 'COMPLETED'
                      ? 'bg-blue-100 text-blue-700 ring-blue-200'
                      : h.status === 'SKIPPED'
                      ? 'bg-amber-100 text-amber-700 ring-amber-200'
                      : 'bg-rose-100 text-rose-700 ring-rose-200')
                  }>
                    {h.status.replace('_', ' ').toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

function formatRelative(d: Date) {
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  return d.toLocaleTimeString();
}

function ActiveEntry({
  entry,
  onCompleted,
}: {
  entry: HistoryItem;
  onCompleted: (e: HistoryItem) => void;
}) {
  const { snapshot, connected } = useDoctorQueue(entry.doctorId);
  const [finalStatus, setFinalStatus] = useState<string | null>(null);
  const completedFired = useRef(false);

  const live = snapshot?.entries.find((e) => e.id === entry.id);

  useEffect(() => {
    if (completedFired.current) return;
    if (snapshot !== null && !live) {
      completedFired.current = true;
      api<{ entry: QueueEntry }>(`/queue/entry/${entry.id}`)
        .then(({ entry: updated }) => {
          setFinalStatus(updated.status);
          setTimeout(() => onCompleted({ ...entry, status: updated.status as HistoryItem['status'] }), 4000);
        })
        .catch(() => {
          setFinalStatus('COMPLETED');
          setTimeout(() => onCompleted(entry), 4000);
        });
    }
  }, [snapshot, live, entry, onCompleted]);

  const status = live?.status ?? entry.status;
  const ahead = live?.peopleAhead ?? 0;
  const eta = live?.etaMinutes ?? 0;

  if (finalStatus) {
    return (
      <section className="card p-8 text-center animate-fade-in">
        <div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center text-3xl text-emerald-700 mb-3">
          ✓
        </div>
        <div className="text-lg font-semibold">
          {finalStatus === 'COMPLETED'
            ? 'Consultation complete'
            : finalStatus === 'SKIPPED'
            ? 'Marked as skipped'
            : 'Cancelled'}
        </div>
        <div className="text-sm text-slate-500 mt-1">
          Your token <strong>#{entry.tokenNumber}</strong> with {entry.doctor.user.name} is done.
        </div>
      </section>
    );
  }

  const isUrgent = status === 'IN_CONSULTATION' || (status === 'WAITING' && ahead === 0);

  return (
    <section className={
      'card overflow-hidden ' +
      (isUrgent ? 'ring-2 ring-brand-400/60 shadow-md' : '')
    }>
      {/* Doctor header — clinic name sits above the doctor name so the
          patient immediately sees which hospital they're queued at. Both
          the clinic and the department degrade gracefully if absent. */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
        <div className="min-w-0">
          {entry.doctor.clinic?.name && (
            <div className="text-[11px] uppercase tracking-wider text-brand-700 font-semibold truncate">
              {entry.doctor.clinic.name}
            </div>
          )}
          <div className="font-semibold truncate">{entry.doctor.user.name}</div>
          <div className="text-xs text-slate-500 truncate">
            {entry.doctor.department?.name ?? 'General'}
          </div>
        </div>
        <LiveIndicator connected={connected} />
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {/* Your token vs current token — token text scales down on small phones
            so two 4-digit numbers stay side-by-side without overflowing. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className={
            'rounded-xl p-3 sm:p-4 text-center transition-colors ' +
            (isUrgent ? 'bg-brand-50 ring-1 ring-brand-200' : 'bg-slate-50')
          }>
            <div className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 mb-1">Your token</div>
            <div className={
              'text-4xl sm:text-5xl font-bold leading-tight ' +
              (isUrgent ? 'text-brand-600' : 'text-slate-900')
            }>
              #{entry.tokenNumber}
            </div>
          </div>
          <div className="rounded-xl p-3 sm:p-4 text-center bg-slate-50">
            <div className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500 mb-1">Now serving</div>
            <div className="text-4xl sm:text-5xl font-bold text-slate-900 leading-tight">
              {snapshot?.currentToken ? `#${snapshot.currentToken}` : '—'}
            </div>
          </div>
        </div>

        {/* ETA row */}
        {status === 'WAITING' && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-2 border-t border-slate-100">
            <div className="text-center">
              <div className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500">People ahead</div>
              <div className="text-2xl sm:text-3xl font-semibold mt-1">{ahead}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-500">Est. wait</div>
              <div className="text-2xl sm:text-3xl font-semibold mt-1">
                ~{eta}<span className="text-sm sm:text-base text-slate-400 font-normal ml-1">min</span>
              </div>
            </div>
          </div>
        )}

        {/* Status banners */}
        {status === 'IN_CONSULTATION' && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-800 text-center font-medium animate-pulse-slow">
            It&apos;s your turn — please go to the consultation room.
          </div>
        )}
        {status === 'WAITING' && ahead === 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800 text-center">
            You&apos;re next — please be ready outside the consultation room.
          </div>
        )}
      </div>
    </section>
  );
}
