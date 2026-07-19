/** All queue calendar days and analytics hours use Indian Standard Time. */
export const APP_TIMEZONE = 'Asia/Kolkata';

/** YYYY-MM-DD for the given instant in IST (defaults to now). */
export function serviceDay(date: Date = new Date(), timeZone = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Hour bucket 0–23 in IST. */
export function istHour(date: Date | string, timeZone = APP_TIMEZONE): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).format(d);
  return parseInt(formatted, 10);
}

/** Display label e.g. "10 PM". */
export function formatHourLabel(hour24: number): string {
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  const hr = hour24 % 12 || 12;
  return `${hr} ${ampm}`;
}

/** Shift a YYYY-MM-DD service day by N calendar days in IST. */
export function addServiceDays(day: string, delta: number): string {
  const t = new Date(`${day}T12:00:00+05:30`);
  t.setTime(t.getTime() + delta * 86_400_000);
  return serviceDay(t);
}

export function serviceDaysAgo(n: number): string {
  return addServiceDays(serviceDay(), -n);
}

/** Build consecutive IST service days ending today (inclusive). */
export function recentServiceDays(count: number): string[] {
  const today = serviceDay();
  return Array.from({ length: count }, (_, i) => addServiceDays(today, i - (count - 1)));
}

/** YYYY-MM in IST. */
export function istMonthKey(date: Date = new Date()): string {
  return serviceDay(date).slice(0, 7);
}

/** Consecutive IST month keys ending with the current month. */
export function recentMonthKeys(count: number): string[] {
  const today = serviceDay();
  const anchor = new Date(`${today.slice(0, 7)}-01T12:00:00+05:30`);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(anchor);
    d.setMonth(d.getMonth() - (count - 1 - i));
    return istMonthKey(d);
  });
}

/** First day of the oldest month in a consecutive IST month window. */
export function monthRangeStart(count: number): string {
  const keys = recentMonthKeys(count);
  return `${keys[0]}-01`;
}

/** HH:mm in IST (24-hour). */
export function istTimeSlot(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}
