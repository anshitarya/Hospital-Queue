'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { api, ApiError } from '../lib/api';
import { SectionLoader, Spinner } from './PageLoader';
import { DoctorGridSkeleton } from './Skeleton';
import { serviceDay, istDayOfWeekFromKey, addServiceDays, formatDateIst, istNowHHMM } from '../lib/datetime';

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

interface PublicLocation {
  id: string;
  name: string;
  address: string;
  settings: {
    queueMode: string;
    appointmentMode: string;
    queueStarts: string;
    queueEnds: string;
    appointmentInterval?: number;
    allowOnlineBooking: boolean;
    maxSelfBookingNoShowsPerMonth?: number;
  } | null;
  doctors: PublicDoctor[];
}

interface PublicBusiness {
  id: string;
  name: string;
  businessType: string;
  locations: PublicLocation[];
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

function parseHmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToHm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function enumerateShiftSlots(
  startTime: string,
  endTime: string,
  intervalMinutes: number,
  afterMinutes: number,
): string[] {
  const start = parseHmToMinutes(startTime);
  const end = parseHmToMinutes(endTime);
  if (end <= start) return [];

  let cursor = start;
  if (afterMinutes > start) {
    const delta = afterMinutes - start;
    const steps = Math.ceil(delta / intervalMinutes);
    cursor = start + steps * intervalMinutes;
  }

  const slots: string[] = [];
  while (cursor + intervalMinutes <= end) {
    slots.push(minutesToHm(cursor));
    cursor += intervalMinutes;
  }
  return slots;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function BookingDirectory({
  patientId,
  activeBookings = [],
  onBooked,
}: {
  patientId: string;
  activeBookings?: { doctorId: string; serviceDay: string }[];
  onBooked?: () => void;
}) {
  const [businesses, setBusinesses] = useState<PublicBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout>>();

  // Clinic-specific selected location IDs
  const [selectedLocationIds, setSelectedLocationIds] = useState<Record<string, string>>({});

  // Inline Slot Booking wizard states
  const [bookingDoctorId, setBookingDoctorId] = useState<string | null>(null);
  const [loadingDoctorData, setLoadingDoctorData] = useState(false);
  const [doctorShifts, setDoctorShifts] = useState<any[]>([]);
  const [existingEntries, setExistingEntries] = useState<any[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [notes, setNotes] = useState('');

  const fetchBusinesses = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const results = await api<PublicBusiness[]>(`/clinics/public/businesses${q ? `?search=${encodeURIComponent(q)}` : ''}`);
      setBusinesses(results);
      // Initialize selected location IDs
      const initLocs: Record<string, string> = {};
      for (const biz of results) {
        if (biz.locations.length > 0) {
          initLocs[biz.id] = biz.locations[0].id;
        }
      }
      setSelectedLocationIds(initLocs);
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

  const hasActiveBooking = (doctorId: string) =>
    activeBookings.some((b) => b.doctorId === doctorId);

  // Initialize booking details when patient opens the slot wizard
  const handleOpenBooking = async (doctorId: string, locationId: string) => {
    setBookingDoctorId(doctorId);
    setSelectedShiftId('');
    setSelectedSlot('');
    setNotes('');
    setLoadingDoctorData(true);
    try {
      const [scheduleData, snapshotData] = await Promise.all([
        api<any[]>(`/schedules/doctor/${doctorId}?locationId=${locationId}`),
        api<any>(`/queue/snapshot/${doctorId}?locationId=${locationId}`),
      ]);
      setDoctorShifts((scheduleData || []).filter((s) => !s.isHoliday));
      setExistingEntries(snapshotData.entries || []);
    } catch (err) {
      console.error('Failed to load slots data', err);
    } finally {
      setLoadingDoctorData(false);
    }
  };

  const handleJoin = async (doctorId: string, doctorName: string, locationId: string, appointmentTime?: string) => {
    if (joiningId || hasActiveBooking(doctorId)) return;
    setJoiningId(doctorId);
    try {
      await api('/queue/patient/join', {
        method: 'POST',
        body: { doctorId, locationId, appointmentTime, notes: notes.trim() || undefined },
      });
      setToast({
        msg: appointmentTime
          ? `Appointment booked successfully for ${doctorName}!`
          : `You've joined the queue for ${doctorName}!`,
        ok: true,
      });
      setBookingDoctorId(null);
      onBooked?.();
      fetchBusinesses(search);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to join/book';
      setToast({ msg, ok: false });
    } finally {
      setJoiningId(null);
      setTimeout(() => setToast(null), 4000);
    }
  };

  // Compile upcoming shifts (next 14 days)
  const upcomingShifts = useMemo(() => {
    if (!bookingDoctorId || doctorShifts.length === 0) return [];
    type ShiftOption = { id: string; startTime: string; endTime: string; dateStr: string; dateLabel: string };
    const result: ShiftOption[] = [];
    const today = serviceDay();
    const nowHHMM = istNowHHMM();
    const MAX_FUTURE = 10;

    const todayDow = istDayOfWeekFromKey(today);
    const todayShifts = doctorShifts
      .filter((s) => s.dayOfWeek === todayDow)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    for (const s of todayShifts) {
      if (s.endTime > nowHHMM) {
        result.push({
          id: `today-${s.startTime}`,
          startTime: s.startTime,
          endTime: s.endTime,
          dateStr: today,
          dateLabel: 'Today',
        });
      }
    }

    let futureCount = 0;
    for (let dayOffset = 1; dayOffset <= 60 && futureCount < MAX_FUTURE; dayOffset++) {
      const dateStr = addServiceDays(today, dayOffset);
      const dow = istDayOfWeekFromKey(dateStr);
      const dowShifts = doctorShifts
        .filter((s) => s.dayOfWeek === dow)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      const isTomorrow = dayOffset === 1;
      const dateLabel = isTomorrow ? 'Tomorrow' : formatDateIst(`${dateStr}T12:00:00+05:30`, {
        weekday: 'short', month: 'short', day: 'numeric',
      });

      for (const s of dowShifts) {
        result.push({
          id: `${dateStr}-${s.startTime}`,
          startTime: s.startTime,
          endTime: s.endTime,
          dateStr,
          dateLabel,
        });
        futureCount++;
      }
    }
    return result;
  }, [bookingDoctorId, doctorShifts]);

  // Enumerate slots for currently selected shift option
  const selectedShift = useMemo(() => {
    return upcomingShifts.find((s) => s.id === selectedShiftId);
  }, [selectedShiftId, upcomingShifts]);

  const availableSlots = useMemo(() => {
    if (!selectedShift || !bookingDoctorId) return [];
    const interval = 15; // default 15 mins
    const isToday = selectedShift.dateLabel === 'Today';
    const limitMinutes = isToday ? parseHmToMinutes(istNowHHMM()) : -1;

    const rawSlots = enumerateShiftSlots(
      selectedShift.startTime,
      selectedShift.endTime,
      interval,
      limitMinutes,
    );

    return rawSlots.map((slotStr) => {
      const slotDateTimeStr = `${selectedShift.dateStr}T${slotStr}:00+05:30`;
      const isTaken = existingEntries.some((e: any) =>
        e.appointmentTime && new Date(e.appointmentTime).getTime() === new Date(slotDateTimeStr).getTime()
      );
      return {
        time: slotStr,
        dateTimeStr: slotDateTimeStr,
        isTaken,
      };
    });
  }, [selectedShift, bookingDoctorId, existingEntries]);

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold flex items-center gap-2.5 ${
            toast.ok ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
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
        <DoctorGridSkeleton count={4} />
      ) : businesses.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-800/40 flex items-center justify-center text-3xl mb-4 shadow-inner">
            🏢
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">No clinics found</h3>
          <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">
            {search ? `No results for "${search}". Try a different name.` : 'No branches have enabled self-booking yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {businesses.map((biz) => {
            const currentLocId = selectedLocationIds[biz.id];
            const currentLoc = biz.locations.find((l) => l.id === currentLocId);

            if (biz.locations.length === 0) return null;

            return (
              <article key={biz.id} className="card overflow-hidden border-t-4 border-t-brand-500">
                {/* Business header */}
                <header className="px-4 py-4 bg-slate-50/60 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800/60">
                  <div className="flex items-center gap-3">
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
                      {currentLoc?.address && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{currentLoc.address}</p>}
                    </div>
                  </div>

                  {/* Branch selector dropdown */}
                  <div className="mt-3 flex items-center gap-2 bg-white dark:bg-slate-950 p-2 rounded-lg border border-slate-200/60 dark:border-slate-800 w-fit">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Branch:</span>
                    <select
                      value={currentLocId || ''}
                      onChange={(e) => {
                        setSelectedLocationIds({ ...selectedLocationIds, [biz.id]: e.target.value });
                        if (bookingDoctorId) setBookingDoctorId(null); // Reset booking wizard if branch changes
                      }}
                      className="text-[11px] font-bold rounded-md bg-transparent text-brand-600 dark:text-brand-400 cursor-pointer focus:outline-none"
                    >
                      {biz.locations.map((loc) => (
                        <option key={loc.id} value={loc.id} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100">
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </header>

                {/* Doctors at currently selected location */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {!currentLoc || currentLoc.doctors.length === 0 ? (
                    <p className="px-4 py-4 text-xs text-slate-400 italic">No professionals available at this branch.</p>
                  ) : (
                    currentLoc.doctors.map((doc) => {
                      const isBooked = hasActiveBooking(doc.id);
                      const isJoining = joiningId === doc.id;
                      const canJoin = doc.status !== 'AWAY' && !isBooked;
                      const showBookingArea = bookingDoctorId === doc.id;

                      return (
                        <div key={doc.id} className="hover:bg-slate-50/20 dark:hover:bg-slate-900/10 transition-colors">
                          <div className="px-4 py-4 flex items-center gap-4">
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
                              onClick={() => {
                                if (showBookingArea) {
                                  setBookingDoctorId(null);
                                } else {
                                  handleOpenBooking(doc.id, currentLoc.id);
                                }
                              }}
                              className={`shrink-0 btn !py-2 !px-4 !text-xs font-bold transition-all ${
                                isBooked
                                  ? 'bg-emerald-100 text-emerald-700 cursor-not-allowed dark:bg-emerald-950/40 dark:text-emerald-400'
                                  : canJoin
                                    ? showBookingArea
                                      ? 'btn-secondary'
                                      : 'btn-primary'
                                    : 'btn-secondary opacity-50 cursor-not-allowed'
                              }`}
                            >
                              {isBooked ? '✓ Booked' : showBookingArea ? 'Close' : 'Book / Join'}
                            </button>
                          </div>

                          {/* Expandable Booking Area */}
                          {showBookingArea && (
                            <div className="px-4 pb-5 pt-1 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 animate-fade-in space-y-4">
                              {loadingDoctorData ? (
                                <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                                  <Spinner className="h-4 w-4" /> Fetching available slots…
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {/* Shift Picker */}
                                  <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                                      Choose Date &amp; Shift:
                                    </label>
                                    {upcomingShifts.length === 0 ? (
                                      <p className="text-xs text-rose-500 italic">No available schedules found for this professional.</p>
                                    ) : (
                                      <select
                                        value={selectedShiftId}
                                        onChange={(e) => {
                                          setSelectedShiftId(e.target.value);
                                          setSelectedSlot('');
                                        }}
                                        className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 py-2.5 px-3 focus:outline-none"
                                      >
                                        <option value="">-- Select a shift --</option>
                                        {upcomingShifts.map((s) => (
                                          <option key={s.id} value={s.id}>
                                            {s.dateLabel} ({s.startTime} - {s.endTime})
                                          </option>
                                        ))}
                                      </select>
                                    )}
                                  </div>

                                  {/* Slots Grid - commented out for now
                                  {selectedShift && (
                                    <div>
                                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">
                                        Select Appointment Slot Time:
                                      </label>
                                      {availableSlots.length === 0 ? (
                                        <p className="text-xs text-slate-400 italic">All slots have been fully booked or are in the past for this shift.</p>
                                      ) : (
                                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                          {availableSlots.map((slot) => {
                                            const isSelected = selectedSlot === slot.dateTimeStr;
                                            return (
                                              <button
                                                key={slot.time}
                                                type="button"
                                                disabled={slot.isTaken}
                                                onClick={() => setSelectedSlot(slot.dateTimeStr)}
                                                className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                                                  slot.isTaken
                                                    ? 'border-slate-100 dark:border-slate-900 bg-slate-100 dark:bg-slate-950 text-slate-300 dark:text-slate-700 cursor-not-allowed line-through'
                                                    : isSelected
                                                      ? 'border-brand-600 bg-brand-600 text-white'
                                                      : 'border-slate-200/60 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-200'
                                                }`}
                                              >
                                                {slot.time}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  */}

                                  {/* Monthly No-Show Policy Notice */}
                                  <div className="rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 p-3 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200 shadow-xs">
                                    <span className="text-base shrink-0 mt-0.5">⚠️</span>
                                    <div className="space-y-0.5">
                                      <p className="font-semibold text-amber-900 dark:text-amber-100">
                                        Self-Booking Policy Notice
                                      </p>
                                      <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                                        Only <strong>{currentLoc.settings?.maxSelfBookingNoShowsPerMonth ?? 3} no-shows (missed appointments)</strong> are allowed for <strong>{doc.name}</strong> at <strong>{currentLoc.name}</strong> per month. Please cancel in advance if you cannot attend.
                                      </p>
                                    </div>
                                  </div>

                                  {/* Reason / Notes */}
                                  <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                                      Notes / Reason for visit (optional):
                                    </label>
                                    <textarea
                                      value={notes}
                                      onChange={(e) => setNotes(e.target.value)}
                                      placeholder="Brief note about the visit reason…"
                                      rows={2}
                                      className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 py-2 px-3 focus:outline-none"
                                    />
                                  </div>

                                  {/* Actions */}
                                  <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800/60">
                                    <button
                                      type="button"
                                      onClick={() => setBookingDoctorId(null)}
                                      className="btn btn-secondary !py-2 !px-4 !text-xs font-bold"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      disabled={!selectedShiftId || isJoining}
                                      onClick={() => {
                                        if (selectedShift) {
                                          const shiftStartDateTime = `${selectedShift.dateStr}T${selectedShift.startTime}:00+05:30`;
                                          void handleJoin(doc.id, doc.name, currentLoc.id, shiftStartDateTime);
                                        }
                                      }}
                                      className="btn btn-primary !py-2 !px-5 !text-xs font-bold flex items-center gap-1.5"
                                    >
                                      {isJoining && <Spinner className="h-3.5 w-3.5" />} Confirm Booking
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
