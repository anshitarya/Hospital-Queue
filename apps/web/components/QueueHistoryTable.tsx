'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatTimeIst, serviceDay, serviceDaysAgo, addServiceDays } from '@/lib/datetime';
import { DatePicker } from '@/components/DatePicker';
import { api, ApiError, type HistoryEntry } from '@/lib/api';
import { tokenDisplay, matchesTokenSearch } from '@/lib/tokenCode';

// ── helpers ──────────────────────────────────────────────────────────────

function todayISO(): string {
  return serviceDay();
}

function fmtTime(iso: string | null | undefined): string {
  return formatTimeIst(iso);
}

function fmtDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 1) return '< 1 min';
  return `${minutes} min`;
}

/** Mask phone — show only last 4 digits: ●●●● 5678 */
function maskPhone(phone: string | null): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `●●●● ${digits.slice(-4)}`;
}

// ── Status badge ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: HistoryEntry['status'] }) {
  const map: Record<HistoryEntry['status'], { label: string; cls: string }> = {
    COMPLETED: { label: 'Done',      cls: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
    SKIPPED:   { label: 'Skipped',   cls: 'bg-amber-100   text-amber-700   ring-amber-200'   },
    CANCELLED: { label: 'Cancelled', cls: 'bg-rose-100    text-rose-700    ring-rose-200'    },
    MISSED:    { label: 'Missed',    cls: 'bg-rose-100    text-rose-600    ring-rose-200'    },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600 ring-slate-200' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}

// ── Summary row shown above the table ────────────────────────────────────

type StatusFilter = 'COMPLETED' | 'SKIPPED' | 'CANCELLED' | null;

function SummaryBar({
  entries,
  activeFilter,
  onFilter,
}: {
  entries: HistoryEntry[];
  activeFilter: StatusFilter;
  onFilter: (f: StatusFilter) => void;
}) {
  const done      = entries.filter((e) => e.status === 'COMPLETED').length;
  const skipped   = entries.filter((e) => e.status === 'SKIPPED').length;
  const cancelled = entries.filter((e) => e.status === 'CANCELLED').length;
  const avgWait   = (() => {
    const valid = entries.map((e) => e.waitMinutes).filter((m): m is number => m !== null);
    if (!valid.length) return null;
    return Math.round(valid.reduce((s, n) => s + n, 0) / valid.length);
  })();
  const avgConsult = (() => {
    const valid = entries
      .filter((e) => e.status === 'COMPLETED')
      .map((e) => e.consultMinutes)
      .filter((m): m is number => m !== null);
    if (!valid.length) return null;
    return Math.round(valid.reduce((s, n) => s + n, 0) / valid.length);
  })();

  return (
    <div className="flex flex-wrap gap-3 text-sm">
      <FilterChip
        color="emerald" label="Completed" value={done}
        active={activeFilter === 'COMPLETED'}
        onClick={() => onFilter(activeFilter === 'COMPLETED' ? null : 'COMPLETED')}
      />
      <FilterChip
        color="amber" label="Skipped" value={skipped}
        active={activeFilter === 'SKIPPED'}
        onClick={() => onFilter(activeFilter === 'SKIPPED' ? null : 'SKIPPED')}
      />
      <FilterChip
        color="rose" label="Cancelled" value={cancelled}
        active={activeFilter === 'CANCELLED'}
        onClick={() => onFilter(activeFilter === 'CANCELLED' ? null : 'CANCELLED')}
      />
      <FilterChip
        color="slate" label="Total" value={entries.length}
        active={activeFilter === null}
        onClick={() => onFilter(null)}
      />
      {avgWait !== null && (
        <Chip color="brand" label="Avg wait" value={`${avgWait} min`} />
      )}
      {avgConsult !== null && (
        <Chip color="purple" label="Avg consult" value={`${avgConsult} min`} />
      )}
    </div>
  );
}

function FilterChip({
  color, label, value, active, onClick,
}: {
  color: string; label: string; value: number; active: boolean; onClick: () => void;
}) {
  const colors: Record<string, { base: string; activeRing: string }> = {
    emerald: { base: 'bg-emerald-50 text-emerald-700 ring-emerald-200', activeRing: 'ring-2 ring-emerald-500 bg-emerald-100' },
    amber:   { base: 'bg-amber-50   text-amber-700   ring-amber-200',   activeRing: 'ring-2 ring-amber-500   bg-amber-100'   },
    rose:    { base: 'bg-rose-50    text-rose-700    ring-rose-200',    activeRing: 'ring-2 ring-rose-500    bg-rose-100'    },
    slate:   { base: 'bg-slate-100  text-slate-600   ring-slate-200',   activeRing: 'ring-2 ring-slate-400   bg-slate-200'   },
  };
  const { base, activeRing } = colors[color] ?? colors.slate;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ring-inset transition-all ${active ? activeRing : `ring-1 ${base} hover:opacity-80`}`}
    >
      <span className="opacity-70">{label}</span>
      <span className="font-bold">{value}</span>
    </button>
  );
}

function Chip({ color, label, value }: { color: string; label: string; value: number | string }) {
  const colors: Record<string, string> = {
    brand:   'bg-brand-50   text-brand-700   ring-brand-200',
    purple:  'bg-purple-50  text-purple-700  ring-purple-200',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${colors[color] ?? 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
      <span className="opacity-70">{label}</span>
      <span className="font-bold">{value}</span>
    </span>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────

function EmptyState({ date }: { date: string }) {
  const isToday = date === todayISO();
  return (
    <div className="py-16 flex flex-col items-center text-slate-400 gap-3">
      <div className="text-4xl">📋</div>
      <div className="font-medium text-slate-600">No records for {isToday ? 'today' : date}</div>
      <p className="text-sm text-center max-w-xs">
        {isToday
          ? 'Completed, skipped, and cancelled entries will appear here as the day progresses.'
          : 'No patients were seen on this date, or their records have not been closed yet.'}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

interface Props {
  /** Pass a doctorId to scope to a single doctor (reception mode).
   *  Omit for doctor-portal mode (backend enforces own-queue-only). */
  doctorId?: string;
  /** When true, show the Doctor column (reception view shows multiple doctors). */
  showDoctorColumn?: boolean;
  /** An already-resolved doctor name to show in the header when scoped. */
  doctorName?: string;
}

export function QueueHistoryTable({ doctorId, showDoctorColumn = false, doctorName }: Props) {
  const [date, setDate]             = useState(todayISO());
  const [entries, setEntries]       = useState<HistoryEntry[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date: d });
      if (doctorId) params.set('doctorId', doctorId);
      const data = await api<HistoryEntry[]>(`/queue/history?${params}`);
      setEntries(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load history');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => { load(date); }, [date, load]);

  return (
    <div className="space-y-4">
      {/* ── Controls row ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">
            {doctorName ? `History — ${doctorName}` : 'Queue History'}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Completed · Skipped · Cancelled entries
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="search"
            placeholder="Search name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input !py-1.5 w-full sm:!w-44 text-xs"
          />
          {/* Jump to yesterday */}
          <button
            type="button"
            onClick={() => setDate(addServiceDays(date, -1))}
            className="btn-ghost !py-1.5 !px-2.5 text-xs"
            title="Previous day"
          >
            ‹ Prev
          </button>

          {/* Date picker */}
          <DatePicker
            value={date}
            max={todayISO()}
            onChange={setDate}
            size="sm"
          />

          {/* Jump to tomorrow (capped at today) */}
          <button
            type="button"
            disabled={date >= todayISO()}
            onClick={() => {
              const next = addServiceDays(date, 1);
              if (next <= todayISO()) setDate(next);
            }}
            className="btn-ghost !py-1.5 !px-2.5 text-xs disabled:opacity-30"
            title="Next day"
          >
            Next ›
          </button>

          <button
            type="button"
            onClick={() => load(date)}
            disabled={loading}
            className="btn-ghost !py-1.5 !px-2.5 text-xs"
            title="Refresh"
          >
            {loading ? '…' : '↻'}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-slate-100 animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Results ── */}
      {!loading && !error && (
        <>
          {entries.length > 0 && (
            <SummaryBar entries={entries} activeFilter={statusFilter} onFilter={setStatusFilter} />
          )}

          {entries.length === 0 ? (
            <EmptyState date={date} />
          ) : (() => {
            const sq = search.toLowerCase().trim();
            const byStatus = statusFilter ? entries.filter(e => e.status === statusFilter) : entries;
            const filtered = sq ? byStatus.filter(e =>
              e.patient.name.toLowerCase().includes(sq) ||
              (e.patient.phone ?? '').includes(sq) ||
              matchesTokenSearch(sq, e.tokenNumber)
            ) : byStatus;
            return (
            <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
              {(sq || statusFilter) && (
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs text-slate-500 flex items-center gap-2">
                  <span>{filtered.length} of {entries.length} results{sq ? ` for "${search}"` : ''}</span>
                  {statusFilter && (
                    <button
                      type="button"
                      onClick={() => setStatusFilter(null)}
                      className="ml-auto text-slate-400 hover:text-slate-700 transition-colors"
                      title="Clear status filter"
                    >
                      ✕ Clear filter
                    </button>
                  )}
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs text-slate-500 uppercase tracking-wider">
                    <th className="px-3 py-2.5 font-medium">#</th>
                    <th className="px-3 py-2.5 font-medium">Patient</th>
                    {showDoctorColumn && (
                      <th className="px-3 py-2.5 font-medium hidden sm:table-cell">Doctor</th>
                    )}
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium hidden md:table-cell">Registered</th>
                    <th className="px-3 py-2.5 font-medium hidden md:table-cell">Called</th>
                    <th className="px-3 py-2.5 font-medium hidden lg:table-cell">Wait</th>
                    <th className="px-3 py-2.5 font-medium hidden lg:table-cell">Consult</th>
                    <th className="px-3 py-2.5 font-medium hidden xl:table-cell">Notes</th>
                    <th className="px-3 py-2.5 font-medium hidden xl:table-cell">Added by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-sm text-slate-400">
                        No results for &ldquo;{search}&rdquo;
                      </td>
                    </tr>
                  ) : filtered.map((e, idx) => (
                    <tr
                      key={e.id}
                      className={
                        'transition-colors ' +
                        (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50') +
                        ' hover:bg-brand-50/40'
                      }
                    >
                      {/* Token number */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-brand-700">
                            {tokenDisplay(e.tokenNumber)}
                          </span>
                          {e.priority > 0 && (
                            <span className="inline-flex items-center rounded-full bg-rose-100 text-rose-600 text-[10px] font-semibold px-1.5 py-0.5 ring-1 ring-rose-200">
                              EM
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Patient */}
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-900">{e.patient.name}</div>
                        <div className="text-xs text-slate-400">{maskPhone(e.patient.phone)}</div>
                      </td>

                      {/* Doctor (reception view) */}
                      {showDoctorColumn && (
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          <div className="text-slate-700 font-medium">{e.doctor.name}</div>
                          <div className="text-xs text-slate-400">{e.doctor.department}</div>
                        </td>
                      )}

                      {/* Status */}
                      <td className="px-3 py-2.5">
                        <StatusBadge status={e.status} />
                      </td>

                      {/* Registered at */}
                      <td className="px-3 py-2.5 text-slate-600 hidden md:table-cell">
                        {fmtTime(e.joinedAt)}
                      </td>

                      {/* Called at */}
                      <td className="px-3 py-2.5 text-slate-600 hidden md:table-cell">
                        {fmtTime(e.calledAt)}
                      </td>

                      {/* Wait duration */}
                      <td className="px-3 py-2.5 hidden lg:table-cell">
                        <span className={
                          'text-xs font-medium ' +
                          (e.waitMinutes !== null && e.waitMinutes > 30
                            ? 'text-amber-600'
                            : 'text-slate-500')
                        }>
                          {fmtDuration(e.waitMinutes)}
                        </span>
                      </td>

                      {/* Consult duration */}
                      <td className="px-3 py-2.5 hidden lg:table-cell">
                        <span className="text-xs text-slate-500">
                          {fmtDuration(e.consultMinutes)}
                        </span>
                      </td>

                      {/* Notes */}
                      <td className="px-3 py-2.5 hidden xl:table-cell">
                        {e.notes ? (
                          <span
                            className="text-xs text-slate-500 max-w-[140px] block truncate"
                            title={e.notes}
                          >
                            {e.notes}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>

                      {/* Added by */}
                      <td className="px-3 py-2.5 hidden xl:table-cell">
                        <span className="text-xs text-slate-400">
                          {e.createdBy?.name ?? 'Self'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
