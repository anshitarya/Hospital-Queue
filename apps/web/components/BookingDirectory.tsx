'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { api, ApiError } from '../lib/api';
import { SectionLoader, Spinner } from './PageLoader';
import { DoctorGridSkeleton, FormSkeleton } from './Skeleton';
import { serviceDay, istDayOfWeekFromKey, addServiceDays, formatDateIst, istNowHHMM } from '../lib/datetime';
import { Icon } from './Icons';
import { BusinessCard, getDistance } from './BusinessCard';
import { BranchCard } from './BranchCard';
import { DoctorCard } from './DoctorCard';
import { hasActiveBooking as checkActiveBooking, isLiveQueueMode } from '../lib/bookingHelpers';

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
  hasSchedules: boolean;
}

interface PublicLocation {
  id: string;
  name: string;
  address: string;
  contactNumber?: string;
  bookingContactNumber?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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
  afterMinutes: number
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
  activeBookings?: { doctorId: string; locationId?: string | null; serviceDay: string }[];
  onBooked?: () => void;
}) {
  const [businesses, setBusinesses] = useState<PublicBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout>>();

  // Navigation Stack view states
  const [selectedBusiness, setSelectedBusiness] = useState<PublicBusiness | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<PublicLocation | null>(null);

  // User location tracking
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Inline Slot Booking wizard states
  const [bookingDoctorId, setBookingDoctorId] = useState<string | null>(null);
  const [loadingDoctorData, setLoadingDoctorData] = useState(false);
  const [doctorShifts, setDoctorShifts] = useState<any[]>([]);
  const [existingEntries, setExistingEntries] = useState<any[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [notes, setNotes] = useState('');
  // Inline success/error per-doctor (replaces floating toast)
  const [bookingResult, setBookingResult] = useState<{ doctorId: string; msg: string; ok: boolean } | null>(null);

  // Fetch Geolocation on landing
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          console.warn('Browser location services unavailable:', error);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, []);

  const fetchBusinesses = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const results = await api<PublicBusiness[]>(
        `/clinics/public/businesses${q ? `?search=${encodeURIComponent(q)}` : ''}`
      );
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

  // A booking blocks only when it's with the SAME doctor AT THE SAME branch.
  // Rule:
  //   - If we have locationId on BOTH sides → block only when they match.
  //   - If we have a locationId on THIS side but the stored entry has null → DON'T block
  //     (we can't determine the branch, so allow the booking to proceed).
  //   - If neither side has locationId (legacy) → block as before (safe default).
  const hasActiveBooking = (doctorId: string, locationId?: string) =>
    checkActiveBooking(activeBookings, doctorId, locationId);

  // Helper to push new parameters into the history
  const pushNavState = (bizId: string | null, branchId: string | null, docId: string | null, replace = false) => {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'discover');

    if (bizId) params.set('businessId', bizId);
    else params.delete('businessId');

    if (branchId) params.set('branchId', branchId);
    else params.delete('branchId');

    if (docId) params.set('bookDoctorId', docId);
    else params.delete('bookDoctorId');

    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (replace) {
      window.history.replaceState(null, '', url);
    } else {
      window.history.pushState(null, '', url);
    }
  };

  // Synchronise state from URL on mount, popstate and when businesses load
  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const bId = params.get('businessId');
      const brId = params.get('branchId');
      const docId = params.get('bookDoctorId');

      if (!bId) {
        setSelectedBusiness(null);
        setSelectedBranch(null);
        setBookingDoctorId(null);
        return;
      }

      const biz = businesses.find((b) => b.id === bId);
      if (biz) {
        setSelectedBusiness(biz);
        if (brId) {
          const branch = biz.locations.find((l) => l.id === brId);
          if (branch) {
            setSelectedBranch(branch);
            if (docId) {
              setBookingDoctorId(docId);
            } else {
              setBookingDoctorId(null);
            }
          } else {
            setSelectedBranch(null);
            setBookingDoctorId(null);
          }
        } else {
          setSelectedBranch(null);
          setBookingDoctorId(null);
        }
      }
    };

    if (!loading) {
      syncFromUrl();
    }

    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [businesses, loading]);

  // Load doctor shifts and snapshots when bookingDoctorId changes reactively
  useEffect(() => {
    if (!bookingDoctorId || !selectedBranch?.id) return;
    
    let active = true;
    const load = async () => {
      setLoadingDoctorData(true);
      try {
        const [scheduleData, snapshotData] = await Promise.all([
          api<any[]>(`/schedules/doctor/${bookingDoctorId}?locationId=${selectedBranch.id}`),
          api<any>(`/queue/snapshot/${bookingDoctorId}?locationId=${selectedBranch.id}`),
        ]);
        if (!active) return;
        const validShifts = (scheduleData || []).filter((s) => !s.isHoliday);
        setDoctorShifts(validShifts);
        setExistingEntries(snapshotData.entries || []);
      } catch (err) {
        console.error('Failed to load slots data', err);
      } finally {
        if (active) setLoadingDoctorData(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [bookingDoctorId, selectedBranch?.id]);

  // Initialize booking details when patient opens the slot wizard
  const handleOpenBooking = (doctorId: string, locationId: string) => {
    const isAlreadyOpen = !!bookingDoctorId;
    setSelectedShiftId('');
    setSelectedSlot('');
    setNotes('');
    setBookingDoctorId(doctorId);
    pushNavState(selectedBusiness!.id, locationId, doctorId, isAlreadyOpen);
  };

  const handleJoin = async (doctorId: string, doctorName: string, locationId: string, appointmentTime?: string) => {
    if (joiningId || hasActiveBooking(doctorId, locationId)) return;
    setJoiningId(doctorId);
    try {
      await api('/queue/patient/join', {
        method: 'POST',
        body: { doctorId, locationId, appointmentTime, notes: notes.trim() || undefined },
      });
      const successMsg = appointmentTime
        ? `Appointment booked for ${doctorName}!`
        : `Joined the queue for ${doctorName}!`;
      setBookingResult({ doctorId, msg: successMsg, ok: true });
      setBookingDoctorId(null);
      pushNavState(selectedBusiness!.id, locationId, null, true); // replace URL parameter to clear doctor selection
      onBooked?.();
      fetchBusinesses(search);
      setTimeout(() => setBookingResult(null), 5000);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to join/book';
      setBookingResult({ doctorId, msg, ok: false });
      setTimeout(() => setBookingResult(null), 5000);
    } finally {
      setJoiningId(null);
    }
  };

  // Compile upcoming shifts (next 10 shifts)
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
      limitMinutes
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

  // Haversine sorting algorithm for nearest-first logic
  const sortedBusinesses = useMemo(() => {
    if (!userLocation) return businesses;
    return [...businesses].sort((a, b) => {
      const getMinDist = (biz: PublicBusiness) => {
        let min = Infinity;
        biz.locations.forEach((loc) => {
          if (loc.latitude !== null && loc.longitude !== null && loc.latitude !== undefined && loc.longitude !== undefined) {
            const dist = getDistance(userLocation.latitude, userLocation.longitude, loc.latitude, loc.longitude);
            if (dist < min) min = dist;
          }
        });
        return min;
      };
      return getMinDist(a) - getMinDist(b);
    });
  }, [businesses, userLocation]);

  return (
    <div className="space-y-6">

      {/* Navigation Stack Rendering */}
      {!selectedBusiness ? (
        /* ==================== VIEW 1: DISCOVER FEED ==================== */
        <div className="space-y-6">
          {/* Header Title */}
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Discover Clinics & Services</h2>
            <p className="text-xs text-slate-400 mt-0.5">Explore medical professionals and skip queues with live waiting times.</p>
          </div>

          {/* Search Box */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by clinic name, specialty or doctor..."
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Grid Layout of Business Cards */}
          {loading ? (
            <DoctorGridSkeleton count={4} />
          ) : sortedBusinesses.length === 0 ? (
            <div className="card p-12 text-center">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-800/40 flex items-center justify-center text-3xl mb-4 shadow-inner">
                🏥
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">No services found</h3>
              <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">
                {search ? `No results for "${search}". Try searching for another name.` : 'No clinics are online at the moment.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedBusinesses.map((biz) => (
                <BusinessCard
                  key={biz.id}
                  business={biz}
                  userLocation={userLocation}
                  onClick={() => {
                    setSelectedBusiness(biz);
                    setSelectedBranch(null);
                    setBookingDoctorId(null);
                    pushNavState(biz.id, null, null);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : !selectedBranch ? (
        /* ==================== VIEW 2: BUSINESS DETAILS ==================== */
        <div className="space-y-6 animate-fade-in">
          {/* Back Action */}
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 dark:text-brand-450 hover:underline"
          >
            ← Back to Discover
          </button>

          {/* Banner Hero */}
          <div className="card p-6 flex flex-col md:flex-row items-start md:items-center gap-5 bg-gradient-to-br from-slate-50/80 to-white dark:from-slate-900/50 dark:to-slate-950 border border-slate-100 dark:border-slate-800/80 shadow-md">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-brand-500 to-emerald-500 flex items-center justify-center text-white text-2xl font-black shadow-md shrink-0">
              {selectedBusiness.name.charAt(0)}
            </div>
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black text-slate-850 dark:text-slate-100 tracking-tight">{selectedBusiness.name}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase bg-slate-100 text-slate-650 dark:bg-slate-800 dark:text-slate-350">
                  {selectedBusiness.businessType}
                </span>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed font-medium">
                Comprehensive healthcare services clinic. Select one of our branches below to view doctors, check real-time queue lengths, or schedule appointments.
              </p>
              <div className="flex flex-wrap gap-4 pt-1 text-[11px] font-semibold text-slate-400">
                <span>⭐ 4.6 Rated</span>
                <span>•</span>
                <span>📍 {selectedBusiness.locations?.length || 1} branch locations</span>
              </div>
            </div>
          </div>

          {/* List of Branches */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Branch</h3>
            <div className="space-y-4">
              {selectedBusiness.locations.map((loc) => (
                <BranchCard
                  key={loc.id}
                  branch={loc}
                  userLocation={userLocation}
                  onSelect={() => {
                    setSelectedBranch(loc);
                    setBookingDoctorId(null);
                    pushNavState(selectedBusiness.id, loc.id, null);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ==================== VIEW 3: BRANCH DETAILS & DOCTOR LISTING ==================== */
        <div className="space-y-6 animate-fade-in">
          {/* Back Action */}
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 dark:text-brand-450 hover:underline"
          >
            ← Back to Branches
          </button>

          {/* Branch Details Display */}
          <div className="card p-5 bg-slate-50/50 dark:bg-slate-900/20 border border-slate-100 dark:border-slate-800/80">
            <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">{selectedBranch.name}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{selectedBranch.address}</p>

            <div className="mt-3.5 pt-3.5 border-t border-slate-100 dark:border-slate-850 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4 text-[11px] font-semibold text-slate-400">
                <span>📞 {selectedBranch.bookingContactNumber || selectedBranch.contactNumber || 'No phone'}</span>
                <span>•</span>
                <span>🟢 Online Booking: {selectedBranch.settings?.allowOnlineBooking ? 'Enabled' : 'Disabled'}</span>
              </div>

              {selectedBranch.settings?.allowOnlineBooking === false && (
                <span className="pill-sm bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold px-2.5 py-0.5 border border-amber-300/30">
                  Phone Booking Only
                </span>
              )}
            </div>
          </div>

          {/* Phone Booking banner */}
          {selectedBranch.settings?.allowOnlineBooking === false && (
            <div className="rounded-2xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs leading-relaxed">
              <div className="text-slate-700 dark:text-slate-350">
                Online queue booking is turned off for this branch. Please call to book an appointment: <strong className="text-slate-900 dark:text-white">{selectedBranch.bookingContactNumber || selectedBranch.contactNumber || 'Contact Branch'}</strong>
              </div>
              {(selectedBranch.bookingContactNumber || selectedBranch.contactNumber) && (
                <a
                  href={`tel:${selectedBranch.bookingContactNumber || selectedBranch.contactNumber}`}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shrink-0 text-xs shadow-sm transition-colors"
                >
                  <Icon.Phone className="h-3.5 w-3.5" />
                  Call to Book
                </a>
              )}
            </div>
          )}

          {/* Doctors Grid */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Available Doctors</h3>
            {selectedBranch.doctors.length === 0 ? (
              <p className="text-xs text-slate-450 italic py-4">No professionals available at this branch.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {selectedBranch.doctors.map((doc) => {
                  const isBooked = hasActiveBooking(doc.id, selectedBranch.id);
                  const isOnlineBookingOff = selectedBranch.settings?.allowOnlineBooking === false;
                  const isAway = doc.status === 'AWAY';
                  const appMode = selectedBranch.settings?.appointmentMode || 'HYBRID';
                  const isWalkinOnly = appMode === 'WALKIN';
                  const noSchedules = !isWalkinOnly && !doc.hasSchedules;

                  const isSelfBookable = !isOnlineBookingOff && !isAway && !noSchedules;
                  const bookingReason = isOnlineBookingOff
                    ? 'DISABLED'
                    : isAway
                      ? 'AWAY'
                      : noSchedules
                        ? 'NO_SCHEDULE'
                        : null;

                  const canJoin = isSelfBookable && !isBooked;
                  const branchPhone = selectedBranch.bookingContactNumber || selectedBranch.contactNumber;

                  return (
                    <div key={doc.id} className="space-y-4">
                      <DoctorCard
                        doctor={doc}
                        isBooked={isBooked}
                        isSelfBookable={isSelfBookable}
                        bookingReason={bookingReason}
                        bookingPhone={branchPhone}
                        onBook={() => {
                          if (canJoin) {
                            void handleOpenBooking(doc.id, selectedBranch.id);
                          }
                        }}
                      />

                      {/* Inline booking result (success/error) for this doctor */}
                      {bookingResult?.doctorId === doc.id && (
                        <div
                          className={`rounded-2xl px-4 py-3 text-sm font-semibold flex items-center gap-2.5 animate-slide-up ${
                            bookingResult.ok
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                              : 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                          }`}
                        >
                          {bookingResult.ok ? '✓' : '✕'} {bookingResult.msg}
                        </div>
                      )}

                      {/* Expandable Booking Area (Inline Shift Wizard) */}
                      {bookingDoctorId === doc.id && !isBooked && (() => {
                        const appMode = selectedBranch.settings?.appointmentMode || 'HYBRID';
                        const queueMode = selectedBranch.settings?.queueMode || 'LIVE_QUEUE';
                        // LIVE_QUEUE = FIFO (first-come-first-served, no specific time slots)
                        // TIME_SLOT / CAPACITY_TIME_SLOT = time-based slot booking
                        const isLiveQueue = isLiveQueueMode(queueMode);
                        const isWalkinOnly = appMode === 'WALKIN';
                        const isAppointmentOnly = appMode === 'APPOINTMENT';
                        const hasShifts = upcomingShifts.length > 0;

                        // In the new unified flow:
                        // - No tab switcher; behaviour is determined by branch settings
                        // - WALKIN only → no shift/slot picker, just notes + confirm
                        // - HYBRID / APPOINTMENT → always show shift picker
                        // - FIFO queue mode → show shift picker but NOT time-slots grid
                        // - APPOINTMENT only + FIFO → shift picker, no time-slot grid

                        const showShiftPicker = !isWalkinOnly && hasShifts;
                        // For LIVE_QUEUE: patient joins end of queue for a shift — no time slot selection needed
                        const showSlotGrid = showShiftPicker && !isLiveQueue;

                        // canConfirm logic:
                        // walkin-only  → always ok (no shift/slot required)
                        // live queue   → need a shift selected (no slot)
                        // slot booking → need both shift and a specific slot
                        const canConfirm = isWalkinOnly
                          ? true
                          : isLiveQueue
                            ? !!selectedShiftId
                            : !!selectedSlot;

                        return (
                          <div className="card p-5 border border-brand-200 dark:border-brand-900/60 bg-slate-50/50 dark:bg-slate-900/30 animate-fade-in space-y-4">
                            {loadingDoctorData ? (
                              <FormSkeleton rows={2} />
                            ) : (
                              <div className="space-y-4">
                                {/* Walk-in only info banner */}
                                {isWalkinOnly && (
                                  <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-3 text-xs text-emerald-800 dark:text-emerald-350 flex items-start gap-2">
                                    <span className="text-base shrink-0 mt-0.5">ℹ️</span>
                                    <div>
                                      <p className="font-bold text-emerald-800 dark:text-emerald-200">Live Walk-in Queue</p>
                                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-relaxed mt-0.5">
                                        You will be added to the queue for today. Walk-ins are handled in the order they arrive.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* Shift Picker (all non-walkin modes) */}
                                {showShiftPicker && (
                                  <div className="space-y-2">
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                      Choose Date &amp; Shift:
                                    </label>
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

                                    {isLiveQueue && selectedShiftId && (
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                                        You will be added to the end of the queue for this shift.
                                      </p>
                                    )}
                                  </div>
                                )}

                                {/* Time Slot Grid (non-FIFO modes only) */}
                                {showSlotGrid && selectedShift && (
                                  <div className="space-y-2">
                                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                      Select Time Slot:
                                    </label>
                                    {availableSlots.length === 0 ? (
                                      <p className="text-xs text-rose-500 italic">All slots are fully booked or in the past for this shift.</p>
                                    ) : (
                                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-36 overflow-y-auto p-1 border border-slate-100 dark:border-slate-800 rounded-xl">
                                        {availableSlots.map((slot) => {
                                          const isSelected = selectedSlot === slot.dateTimeStr;
                                          return (
                                            <button
                                              key={slot.time}
                                              type="button"
                                              disabled={slot.isTaken}
                                              onClick={() => setSelectedSlot(slot.dateTimeStr)}
                                              className={`py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                                                slot.isTaken
                                                  ? 'border-slate-50 dark:border-slate-900 bg-slate-50 dark:bg-slate-950/40 text-slate-350 dark:text-slate-650 cursor-not-allowed line-through'
                                                  : isSelected
                                                    ? 'border-brand-600 bg-brand-600 text-white font-bold'
                                                    : 'border-slate-200/70 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-200'
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

                                {/* Appointment-only + no shifts warning */}
                                {isAppointmentOnly && !hasShifts && (
                                  <div className="bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl p-3 text-xs text-rose-800 dark:text-rose-350 flex items-start gap-2">
                                    <span className="text-base shrink-0 mt-0.5">⚠️</span>
                                    <div>
                                      <p className="font-bold text-rose-800 dark:text-rose-200">No Appointments Available</p>
                                      <p className="text-[11px] text-rose-700 dark:text-rose-450 leading-relaxed mt-0.5">
                                        This branch only accepts bookings with slot schedules, but none are active.
                                        {branchPhone && (
                                          <> Please call <strong>{branchPhone}</strong> to book an appointment.</>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* Self-Booking Policy Notice */}
                                <div className="rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 p-3 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200 shadow-xs">
                                  <span className="text-base shrink-0 mt-0.5">⚠️</span>
                                  <div className="space-y-0.5">
                                    <p className="font-semibold text-amber-900 dark:text-amber-100">
                                      Self-Booking Policy Notice
                                    </p>
                                    <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                                      Only <strong>{selectedBranch.settings?.maxSelfBookingNoShowsPerMonth ?? 3} no-shows</strong> are allowed per month. Please cancel in advance if you cannot attend.
                                    </p>
                                  </div>
                                </div>

                                {/* Reason / Notes */}
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                                    Notes / Reason for visit (optional):
                                  </label>
                                  <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Brief note about the visit reason…"
                                    rows={2}
                                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 py-2.5 px-3 focus:outline-none"
                                  />
                                </div>

                                {/* Booking wizard Actions */}
                                <div className="pt-3.5 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-850">
                                  <button
                                    type="button"
                                    onClick={() => setBookingDoctorId(null)}
                                    className="btn btn-secondary !py-2 !px-4 !text-xs font-bold"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!canConfirm || !!joiningId}
                                    onClick={() => {
                                      // LIVE_QUEUE → join end of queue, no appointmentTime
                                      // WALKIN     → no appointmentTime
                                      // Slot mode  → use selectedSlot as appointmentTime
                                      const appTime = !isWalkinOnly && !isLiveQueue && selectedSlot ? selectedSlot : undefined;
                                      void handleJoin(doc.id, doc.name, selectedBranch.id, appTime);
                                    }}
                                    className="btn btn-primary !py-2 !px-5 !text-xs font-bold flex items-center gap-1.5"
                                  >
                                    {joiningId === doc.id && <Spinner className="h-3.5 w-3.5" />} Confirm Booking
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
