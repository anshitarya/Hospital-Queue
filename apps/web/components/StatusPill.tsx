import clsx from 'clsx';
import type { DoctorStatus, EntryStatus } from '@/lib/api';

const ENTRY_STYLES: Record<EntryStatus, string> = {
  WAITING: 'bg-slate-100 text-slate-700 ring-slate-200',
  IN_CONSULTATION: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  COMPLETED: 'bg-blue-100 text-blue-800 ring-blue-200',
  SKIPPED: 'bg-amber-100 text-amber-800 ring-amber-200',
  CANCELLED: 'bg-rose-100 text-rose-800 ring-rose-200',
};
const DOCTOR_STYLES: Record<DoctorStatus, string> = {
  AVAILABLE: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  BUSY: 'bg-blue-100 text-blue-800 ring-blue-200',
  PAUSED: 'bg-amber-100 text-amber-800 ring-amber-200',
  AWAY: 'bg-slate-200 text-slate-700 ring-slate-300',
};

export function EntryStatusPill({ status }: { status: EntryStatus }) {
  return <span className={clsx('pill', ENTRY_STYLES[status])}>{status.replace('_', ' ')}</span>;
}

export function DoctorStatusPill({ status }: { status: DoctorStatus }) {
  return <span className={clsx('pill', DOCTOR_STYLES[status])}>{status}</span>;
}

export function LiveIndicator({ connected, label }: { connected: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span className={connected ? 'live-dot' : 'offline-dot'} />
      {label ?? (connected ? 'Live' : 'Offline')}
    </span>
  );
}
