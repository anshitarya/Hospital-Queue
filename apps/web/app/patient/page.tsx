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

const REFRESH_INTERVAL_MS = 30_000;

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

  useEffect(() => {
    if (!ready) return;
    fetchHistory();
    const t = setInterval(fetchHistory, REFRESH_INTERVAL_MS);
    return () => clearInterval(t);
  }, [ready, fetchHistory]);

  const { connected: streamConnected } = usePatientStream(ready, () => {
    fetchHistory();
  });

  if (!ready) return <PageLoader label="Loading your queue…" />;

  const pastEntries = history.filter(
    (e) => e.status !== 'WAITING' && e.status !== 'IN_CONSULTATION',
  );

  return (
    <>
      <Header title="My Queue" />
      <main className="mx-auto max-w-lg px-4 py-5 space-y-4 animate-fade-in">

        {/* Sync status bar */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs text-slate-500">
            <LiveIndicator connected={streamConnected} />
            {lastSync ? `Updated ${formatRelative(lastSync)}` : 'Syncing…'}
          </span>
          <button
            type="button"
            onClick={fetchHistory}
            disabled={refreshing}
            className="btn-ghost !py-1 !px-2.5 text-xs"
            aria-label="Refresh queue"
          >
            <span className={refreshing ? 'animate-spin inline-block' : 'inline-block'}>↻</span>
            <span className="ml-1">Refresh</span>
          </button>
        </div>

        {/* Empty state */}
        {liveEntries.length === 0 && (
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
        {liveEntries.map((entry) => (
          <ActiveEntry
            key={entry.id}
            entry={entry}
            onCompleted={(updatedEntry) =>
              setLiveEntries((prev) => prev.filter((e) => e.id !== updatedEntry.id))
            }
          />
        ))}

        {/* Past visits */}
        {pastEntries.length > 0 && (
          <section className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="section-title">Recent visits</h3>
              <span className="text-xs text-slate-400 font-medium">
                {Math.min(pastEntries.length, 10)} of {pastEntries.length}
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {pastEntries.slice(0, 10).map((h) => {
                const statusMeta = {
                  COMPLETED: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
                  SKIPPED:   { label: 'Skipped',   cls: 'bg-amber-100 text-amber-700 ring-amber-200',     dot: 'bg-amber-500'   },
                  CANCELLED: { label: 'Cancelled', cls: 'bg-rose-100 text-rose-700 ring-rose-200',         dot: 'bg-rose-500'    },
                }[h.status as 'COMPLETED' | 'SKIPPED' | 'CANCELLED'] ?? {
                  label: h.status, cls: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400'
                };
                return (
                  <div key={h.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${statusMeta.dot}`} />
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-slate-800 truncate">
                          <span className="font-mono text-brand-700">#{h.tokenNumber}</span>
                          {' · '}
                          {h.doctor.user.name}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {new Date(h.joinedAt).toLocaleString('en-IN', {
                            day: 'numeric', month: 'short',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>
                    <span className={`pill ring-1 ring-inset shrink-0 ${statusMeta.cls}`}>
                      {statusMeta.label}
                    </span>
                  </div>
                );
              })}
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
  const isInConsult = status === 'IN_CONSULTATION';
  const isNextUp = status === 'WAITING' && ahead === 0;
  const isUrgent = isInConsult || isNextUp;

  if (finalStatus) {
    const isDone = finalStatus === 'COMPLETED';
    return (
      <section className="card p-8 text-center animate-fade-in">
        <div className={`mx-auto h-16 w-16 rounded-2xl flex items-center justify-center text-3xl mb-4 shadow-inner ${isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {isDone ? '✓' : '×'}
        </div>
        <div className="text-lg font-semibold">
          {finalStatus === 'COMPLETED'
            ? 'Consultation complete'
            : finalStatus === 'SKIPPED'
            ? 'Marked as skipped'
            : 'Entry cancelled'}
        </div>
        <div className="text-sm text-slate-500 mt-1">
          Token <span className="font-mono font-bold text-brand-700">#{entry.tokenNumber}</span> with {entry.doctor.user.name}
        </div>
      </section>
    );
  }

  return (
    <section className={`card overflow-hidden ${isUrgent ? 'ring-2 ring-brand-400/50 shadow-md' : ''}`}>
      {/* Card header — doctor info */}
      <div className={`px-5 py-4 border-b border-slate-100 flex items-center justify-between ${isInConsult ? 'bg-gradient-to-r from-emerald-50 to-teal-50' : isNextUp ? 'bg-gradient-to-r from-amber-50 to-orange-50' : 'bg-gradient-to-r from-slate-50 to-white'}`}>
        <div className="min-w-0">
          {entry.doctor.clinic?.name && (
            <div className="text-[10px] uppercase tracking-widest text-brand-700 font-bold mb-0.5 truncate">
              {entry.doctor.clinic.name}
            </div>
          )}
          <div className="font-semibold text-slate-900 truncate">{entry.doctor.user.name}</div>
          <div className="text-xs text-slate-500">{entry.doctor.department?.name ?? 'General'}</div>
        </div>
        <LiveIndicator connected={connected} />
      </div>

      <div className="p-5 space-y-4">
        {/* Urgent status banners — shown above tokens so it's the first thing seen */}
        {isInConsult && (
          <div className="rounded-xl bg-emerald-500 text-white text-center font-semibold py-3 px-4 animate-pulse-slow shadow-sm">
            🔔 It&apos;s your turn — please proceed to the consultation room
          </div>
        )}
        {isNextUp && (
          <div className="rounded-xl bg-amber-50 border-2 border-amber-400 text-amber-800 text-center font-medium py-3 px-4">
            ⚡ You&apos;re next — please be ready outside
          </div>
        )}

        {/* Token numbers grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`rounded-xl p-4 text-center ${isInConsult ? 'bg-emerald-50 ring-2 ring-emerald-300' : isNextUp ? 'bg-amber-50 ring-2 ring-amber-300' : 'bg-brand-50 ring-1 ring-brand-100'}`}>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 font-medium">Your token</div>
            <div className={`text-5xl font-bold leading-none tabular-nums ${isInConsult ? 'text-emerald-700' : isNextUp ? 'text-amber-700' : 'text-brand-700'}`}>
              #{entry.tokenNumber}
            </div>
          </div>
          <div className="rounded-xl p-4 text-center bg-slate-50 ring-1 ring-slate-100">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 font-medium">Now serving</div>
            <div className="text-5xl font-bold text-slate-800 leading-none tabular-nums">
              {snapshot?.currentToken ? `#${snapshot.currentToken}` : '—'}
            </div>
          </div>
        </div>

        {/* ETA row */}
        {status === 'WAITING' && !isNextUp && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100 p-3.5 text-center">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">People ahead</div>
              <div className="text-3xl font-bold text-slate-800 mt-1 tabular-nums">{ahead}</div>
            </div>
            <div className="rounded-xl bg-slate-50 ring-1 ring-slate-100 p-3.5 text-center">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Est. wait</div>
              <div className="text-3xl font-bold text-slate-800 mt-1 tabular-nums">
                ~{eta}
                <span className="text-sm text-slate-400 font-normal ml-1">min</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
