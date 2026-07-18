'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { SectionLoader, Spinner } from './PageLoader';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PublicDoctor {
  id: string;
  name: string;
  specialization: string | null;
  department: string | null;
  status: string;
  avgConsultMinutes: number;
  queueLength: number;
  inConsultation: boolean;
}

interface PublicBusiness {
  id: string;
  name: string;
  address: string | null;
  businessType: string;
  doctors: PublicDoctor[];
  settings: {
    queueMode: string;
    queueStarts: string;
    queueEnds: string;
  } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const BUSINESS_ICONS: Record<string, string> = {
  CLINIC: '🏥',
  SALON: '✂️',
  BANK: '🏦',
  GOVT: '🏛️',
  GENERAL: '🏢',
};

function etaLabel(doctor: PublicDoctor): string {
  const total = doctor.queueLength;
  if (total === 0) return 'No wait';
  const mins = Math.max(1, total * doctor.avgConsultMinutes);
  if (mins < 60) return `~${mins} min wait`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m > 0 ? `~${h}h ${m}m wait` : `~${h}h wait`;
  const d = Math.floor(h / 24);
  return `~${d} day${d !== 1 ? 's' : ''} wait`;
}

function statusColor(status: string) {
  if (status === 'AVAILABLE') return 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900';
  if (status === 'BUSY') return 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-900';
  if (status === 'PAUSED') return 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700';
  return 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-900';
}

// ─── Component ────────────────────────────────────────────────────────────────
export function BookingDirectory({ patientId }: { patientId: string }) {
  const [businesses, setBusinesses] = useState<PublicBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchBusinesses = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const results = await api<PublicBusiness[]>(`/clinics/public/businesses${q ? `?search=${encodeURIComponent(q)}` : ''}`);
      setBusinesses(results);
    } catch {
      setBusinesses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBusinesses('');
  }, [fetchBusinesses]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => fetchBusinesses(val), 350);
  };

  const handleJoin = async (doctorId: string, doctorName: string) => {
    if (joiningId || joined.has(doctorId)) return;
    setJoiningId(doctorId);
    try {
      await api('/queue/patient/join', {
        method: 'POST',
        body: { doctorId },
      });
      setJoined((prev) => new Set([...prev, doctorId]));
      setToast({ msg: `You've joined the queue for ${doctorName}!`, ok: true });
      // Refresh queue lengths
      fetchBusinesses(search);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to join queue';
      setToast({ msg, ok: false });
    } finally {
      setJoiningId(null);
      setTimeout(() => setToast(null), 4000);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold flex items-center gap-2.5 ${
            toast.ok
              ? 'bg-emerald-600 text-white'
              : 'bg-rose-600 text-white'
          }`}
        >
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">🔍</span>
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by business name or professional name…"
          className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        {search && (
          <button
            type="button"
            onClick={() => handleSearchChange('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
          >✕</button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <SectionLoader label="Loading available businesses…" />
      ) : businesses.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-800/40 flex items-center justify-center text-3xl mb-4 shadow-inner">
            🏢
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">No businesses found</h3>
          <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">
            {search ? `No results for "${search}". Try a different name.` : 'No businesses have enabled self-booking yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {businesses.map((biz) => (
            <article key={biz.id} className="card overflow-hidden">
              {/* Business header */}
              <header className="px-4 py-3.5 bg-slate-50/60 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800/60 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-500 to-emerald-500 flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0">
                  {biz.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{biz.name}</h3>
                    <span className="pill-sm bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700/50 px-2 py-0.5 shrink-0">
                      {BUSINESS_ICONS[biz.businessType] ?? '🏢'} {biz.businessType}
                    </span>
                  </div>
                  {biz.address && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{biz.address}</p>}
                </div>
                <span className="text-[10px] text-slate-400 font-bold bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-0.5 shrink-0">
                  {biz.doctors.length} {biz.doctors.length === 1 ? 'professional' : 'professionals'}
                </span>
              </header>

              {/* Doctors */}
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {biz.doctors.length === 0 ? (
                  <p className="px-4 py-4 text-xs text-slate-400 italic">No professionals available today.</p>
                ) : (
                  biz.doctors.map((doc) => {
                    const isJoined = joined.has(doc.id);
                    const isJoining = joiningId === doc.id;
                    const canJoin = doc.status !== 'AWAY' && !isJoined;

                    return (
                      <div key={doc.id} className="px-4 py-3.5 flex items-center gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{doc.name}</span>
                            <span className={`pill-sm ring-1 ring-inset px-2 py-0.5 text-[10px] font-medium capitalize ${statusColor(doc.status)}`}>
                              {doc.status.toLowerCase()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {doc.department ?? doc.specialization ?? 'General'}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              👥 {doc.queueLength} waiting
                            </span>
                            <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">
                              ⏱ {etaLabel(doc)}
                            </span>
                            {doc.inConsultation && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                                In session
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={!canJoin || isJoining}
                          onClick={() => handleJoin(doc.id, doc.name)}
                          className={`shrink-0 btn !py-2 !px-4 !text-xs font-bold transition-all ${
                            isJoined
                              ? 'bg-emerald-100 text-emerald-700 cursor-not-allowed dark:bg-emerald-950/40 dark:text-emerald-400'
                              : canJoin
                                ? 'btn-primary'
                                : 'btn-secondary opacity-50 cursor-not-allowed'
                          }`}
                        >
                          {isJoining ? (
                            <span className="flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" /> Joining…</span>
                          ) : isJoined ? (
                            '✓ Joined'
                          ) : doc.status === 'AWAY' ? (
                            'Unavailable'
                          ) : (
                            'Join Queue'
                          )}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
