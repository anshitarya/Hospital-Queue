import clsx from 'clsx';
import type { DoctorStatus, EntryStatus } from '@/lib/api';

const ENTRY_CONFIG: Record<EntryStatus, { dot: string; text: string; bg: string; ring: string; label: string }> = {
  WAITING:         { dot: 'bg-slate-400',   text: 'text-slate-700',   bg: 'bg-slate-100',   ring: 'ring-slate-200',   label: 'Waiting'         },
  IN_CONSULTATION: { dot: 'bg-emerald-500', text: 'text-emerald-800', bg: 'bg-emerald-100', ring: 'ring-emerald-200', label: 'In consultation'  },
  COMPLETED:       { dot: 'bg-blue-500',    text: 'text-blue-800',    bg: 'bg-blue-100',    ring: 'ring-blue-200',    label: 'Completed'        },
  SKIPPED:         { dot: 'bg-amber-500',   text: 'text-amber-800',   bg: 'bg-amber-100',   ring: 'ring-amber-200',   label: 'Skipped'          },
  CANCELLED:       { dot: 'bg-rose-500',    text: 'text-rose-800',    bg: 'bg-rose-100',    ring: 'ring-rose-200',    label: 'Cancelled'        },
  MISSED:          { dot: 'bg-rose-400',    text: 'text-rose-700',    bg: 'bg-rose-100',    ring: 'ring-rose-200',    label: 'Missed'           },
};

const DOCTOR_CONFIG: Record<DoctorStatus, { dot: string; text: string; bg: string; ring: string; label: string }> = {
  AVAILABLE: { dot: 'bg-emerald-500', text: 'text-emerald-800', bg: 'bg-emerald-100', ring: 'ring-emerald-200', label: 'Available' },
  BUSY:      { dot: 'bg-blue-500',    text: 'text-blue-800',    bg: 'bg-blue-100',    ring: 'ring-blue-200',    label: 'Busy'      },
  PAUSED:    { dot: 'bg-amber-500',   text: 'text-amber-800',   bg: 'bg-amber-100',   ring: 'ring-amber-200',   label: 'Paused'    },
  AWAY:      { dot: 'bg-slate-400',   text: 'text-slate-700',   bg: 'bg-slate-100',   ring: 'ring-slate-200',   label: 'Away'      },
};

export function EntryStatusPill({ status }: { status: EntryStatus }) {
  const c = ENTRY_CONFIG[status];
  return (
    <span className={clsx('pill', c.bg, c.text, c.ring)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full shrink-0', c.dot)} />
      {c.label}
    </span>
  );
}

export function DoctorStatusPill({ status }: { status: DoctorStatus }) {
  const c = DOCTOR_CONFIG[status];
  return (
    <span className={clsx('pill', c.bg, c.text, c.ring)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full shrink-0', c.dot)} />
      {c.label}
    </span>
  );
}

export function LiveIndicator({ connected, label }: { connected: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      <span className={connected ? 'live-dot' : 'offline-dot'} />
      {label ?? (connected ? 'Live' : 'Offline')}
    </span>
  );
}
