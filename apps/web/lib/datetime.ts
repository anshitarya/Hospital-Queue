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
