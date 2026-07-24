'use client';

import { Icon } from '@/components/Icons';

interface DoctorCardProps {
  doctor: any;
  onBook: () => void;
  isBooked: boolean;
  isSelfBookable: boolean;
  bookingReason?: 'DISABLED' | 'AWAY' | 'NO_SCHEDULE' | null;
  bookingPhone?: string | null;
}

export function DoctorCard({ doctor, onBook, isBooked, isSelfBookable, bookingReason, bookingPhone }: DoctorCardProps) {
  const waitTime = doctor.queueLength * doctor.avgConsultMinutes;
  const isAvailable = doctor.status === 'ACTIVE';

  const hasExp = doctor.experience !== null && doctor.experience !== undefined;
  const hasLang = doctor.languages !== null && doctor.languages !== undefined && doctor.languages.trim() !== '';
  const hasFee = doctor.consultationFee !== null && doctor.consultationFee !== undefined;

  const renderBookingReason = () => {
    switch (bookingReason) {
      case 'DISABLED':
        return 'Online Booking Disabled';
      case 'AWAY':
        return 'Professional Unavailable';
      case 'NO_SCHEDULE':
        return 'No Schedules Available';
      default:
        return 'Self-Booking Unavailable';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-5 hover:border-slate-200 dark:hover:border-slate-700/80 hover:shadow-lg transition-all duration-300 flex flex-col justify-between h-full relative">
      {/* Top section: Avatar and Basic details */}
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          {/* Avatar Placeholder */}
          <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-200 dark:from-slate-800 dark:to-slate-700/50 flex items-center justify-center shrink-0 shadow-inner">
            <span className="text-xl font-black text-brand-700 dark:text-brand-450">
              {doctor.name.substring(0, 2).toUpperCase()}
            </span>
            {/* Live Indicator */}
            <span className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 ${isAvailable ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-100 tracking-tight truncate">
                {doctor.name}
              </h4>
              {doctor.rating !== null && doctor.rating !== undefined && (
                <div className="flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-emerald-500 text-white text-[9px] font-black shrink-0 shadow-xs">
                  <span>{doctor.rating.toFixed(1)}</span>
                  <span>★</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-brand-600 dark:text-brand-400 font-bold uppercase tracking-wider mt-0.5">
              {doctor.specialization || 'General Practitioner'}
            </p>
            {(hasExp || hasLang) && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[10px] font-semibold text-slate-450 dark:text-slate-500">
                {hasExp && <span>{doctor.experience} Years Exp</span>}
                {hasExp && hasLang && <span>•</span>}
                {hasLang && <span>🗣️ {doctor.languages}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Live Queue status */}
        <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-950/40 p-3 rounded-xl border border-slate-100/50 dark:border-slate-850/30 text-center">
          <div>
            <div className="text-[10px] text-slate-450 dark:text-slate-550 font-bold uppercase tracking-wider">Queue Length</div>
            <div className="text-sm font-black text-slate-800 dark:text-slate-100 mt-0.5 font-mono">{doctor.queueLength} waiting</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-450 dark:text-slate-550 font-bold uppercase tracking-wider">Est. Wait Time</div>
            <div className="text-sm font-black text-slate-800 dark:text-slate-100 mt-0.5 font-mono">
              {waitTime === 0 ? 'No wait' : `${waitTime} mins`}
            </div>
          </div>
        </div>
      </div>

      {/* Booking Actions */}
      <div className="mt-5 pt-3.5 border-t border-slate-50 dark:border-slate-850 flex items-center justify-between gap-4">
        <div>
          {hasFee ? (
            <>
              <span className="text-[10px] text-slate-450 font-bold block uppercase tracking-wider">Consultation Fee</span>
              <span className="text-sm font-black text-slate-850 dark:text-slate-150">₹{doctor.consultationFee}</span>
            </>
          ) : (
            <div className="h-9" />
          )}
        </div>

        {isBooked ? (
          <button
            type="button"
            disabled
            className="btn !py-2 !px-5 text-xs font-bold shadow-xs bg-emerald-100 text-emerald-700 cursor-not-allowed dark:bg-emerald-950/40 dark:text-emerald-450"
          >
            ✓ Booked
          </button>
        ) : !isSelfBookable ? (
          <div className="text-right space-y-1">
            <span className="text-[10px] font-black text-rose-600 dark:text-rose-450 uppercase block tracking-wider animate-pulse">
              {renderBookingReason()}
            </span>
            {bookingPhone ? (
              <a
                href={`tel:${bookingPhone}`}
                className="inline-flex items-center gap-1 text-xs font-extrabold text-amber-600 dark:text-amber-450 hover:underline"
              >
                📞 Call branch: {bookingPhone}
              </a>
            ) : (
              <span className="text-xs font-bold text-slate-450 dark:text-slate-550">Contact clinic branch</span>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onBook}
            className="btn !py-2 !px-5 text-xs font-bold shadow-xs btn-primary hover:-translate-y-0.5 transition-all"
          >
            Book Appointment
          </button>
        )}
      </div>
    </div>
  );
}
