/** All displayed times and "today" boundaries use Indian Standard Time. */
export const APP_TIMEZONE = 'Asia/Kolkata';

const IST_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const IST_TIME: Intl.DateTimeFormatOptions = {
  timeZone: APP_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
};

const IST_DATETIME: Intl.DateTimeFormatOptions = {
  timeZone: APP_TIMEZONE,
  dateStyle: 'short',
  timeStyle: 'short',
};

/** YYYY-MM-DD in IST. */
export function serviceDay(date: Date = new Date()): string {
  return IST_DATE.format(date);
}

/** HH:mm (24h) for the current instant in IST. */
export function istNowHHMM(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

/** JS weekday 0=Sun … 6=Sat for a YYYY-MM-DD service day in IST. */
export function istDayOfWeekFromKey(dayKey: string): number {
  return new Date(`${dayKey}T12:00:00+05:30`).getDay();
}

/** True when an HH:mm shift block has not ended yet today. */
export function isShiftStillBookable(endTime: string, nowHHMM: string): boolean {
  return endTime > nowHHMM;
}

export function serviceDaysAgo(n: number): string {
  const t = new Date(`${serviceDay()}T12:00:00+05:30`);
  t.setTime(t.getTime() - n * 86_400_000);
  return serviceDay(t);
}

/** Shift a YYYY-MM-DD service day by N calendar days in IST. */
export function addServiceDays(day: string, delta: number): string {
  const t = new Date(`${day}T12:00:00+05:30`);
  t.setTime(t.getTime() + delta * 86_400_000);
  return serviceDay(t);
}

export function formatTimeIst(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleTimeString('en-IN', IST_TIME);
}

export function formatDateTimeIst(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString('en-IN', IST_DATETIME);
}

export function formatDateIst(iso: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-IN', { timeZone: APP_TIMEZONE, ...options });
}

export function formatRelativeTimeIst(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const diff = Math.round((Date.now() - d.getTime()) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  const min = Math.floor(diff / 60);
  if (min < 60) return `${min} min ago`;
  return formatTimeIst(d);
}

/** Resolve service day from entry field or joinedAt in IST. */
export function entryServiceDay(entry: { serviceDay?: string; joinedAt?: string }): string {
  return entry.serviceDay ?? serviceDay(new Date(entry.joinedAt ?? Date.now()));
}

/** Format milliseconds as HH:MM:SS for report tables. */
export function formatDurationHms(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Format a wait-time in minutes to a human-friendly string.
 *
 * Examples:
 *   fmtWait(5)    → "~5 min"
 *   fmtWait(90)   → "~1h 30m"
 *   fmtWait(1440) → "~1 day"
 *   fmtWait(2880) → "~2 days"
 */
export function fmtWait(mins: number, prefix = '~'): string {
  if (mins < 1) return `${prefix}<1 min`;
  if (mins < 60) return `${prefix}${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m > 0 ? `${prefix}${h}h ${m}m` : `${prefix}${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${prefix}${d}d ${rh}h` : `${prefix}${d} day${d !== 1 ? 's' : ''}`;
}
