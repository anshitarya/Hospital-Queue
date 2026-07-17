import { APP_TIMEZONE, serviceDay, addServiceDays } from './timezone';

export interface ScheduleShift {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isHoliday?: boolean;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** JS weekday 0=Sun … 6=Sat in IST. */
export function istDayOfWeek(date: Date = new Date()): number {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    weekday: 'short',
  }).format(date);
  return WEEKDAY_MAP[short] ?? 0;
}

/** Minutes since midnight IST for an instant. */
export function istMinutesOfDay(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return hour * 60 + minute;
}

export function parseHmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToHm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Build a Date for a service day + HH:MM in IST. */
export function istAppointmentDate(serviceDayKey: string, hm: string): Date {
  return new Date(`${serviceDayKey}T${hm}:00+05:30`);
}

export function istTimeSlotFromHm(hm: string): string {
  return hm;
}

/**
 * Enumerate slot start times (HH:MM IST) for one shift on a given service day,
 * starting at shift start or the next interval boundary after `afterMinutes`.
 */
export function enumerateShiftSlots(
  shift: ScheduleShift,
  intervalMinutes: number,
  afterMinutes: number,
): string[] {
  if (shift.isHoliday) return [];
  const start = parseHmToMinutes(shift.startTime);
  const end = parseHmToMinutes(shift.endTime);
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

/**
 * All shifts for a weekday sorted by start time.
 */
export function shiftsForDay(shifts: ScheduleShift[], dayOfWeek: number): ScheduleShift[] {
  return shifts
    .filter((s) => s.dayOfWeek === dayOfWeek && !s.isHoliday)
    .sort((a, b) => parseHmToMinutes(a.startTime) - parseHmToMinutes(b.startTime));
}

/**
 * Find the next available slot at or after `now` on `serviceDayKey`, searching
 * later shifts the same day then up to 14 future days.
 */
export function findNextSlot(
  allShifts: ScheduleShift[],
  serviceDayKey: string,
  now: Date,
  intervalMinutes: number,
  maxCap: number,
  bookingCounts: Map<string, number>,
  searchDays = 14,
): { serviceDay: string; slotStr: string; time: Date } | null {
  let dayKey = serviceDayKey;
  let dayOffset = 0;
  let afterMinutes = istMinutesOfDay(now);

  while (dayOffset <= searchDays) {
    const dow = istDayOfWeek(istAppointmentDate(dayKey, '12:00'));
    const dayShifts = shiftsForDay(allShifts, dow);

    for (const shift of dayShifts) {
      const shiftEnd = parseHmToMinutes(shift.endTime);
      if (dayOffset === 0 && afterMinutes >= shiftEnd) continue;

      const startFrom = dayOffset === 0 ? afterMinutes : parseHmToMinutes(shift.startTime) - 1;
      const slots = enumerateShiftSlots(shift, intervalMinutes, startFrom);

      for (const slotStr of slots) {
        const key = `${dayKey}:${slotStr}`;
        const count = bookingCounts.get(key) ?? bookingCounts.get(slotStr) ?? 0;
        if (count < maxCap) {
          return {
            serviceDay: dayKey,
            slotStr,
            time: istAppointmentDate(dayKey, slotStr),
          };
        }
      }
    }

    dayOffset += 1;
    dayKey = addServiceDays(serviceDayKey, dayOffset);
    afterMinutes = -1;
  }

  return null;
}

/** First slot of the first shift on a service day (for empty queues). */
export function firstSlotOfDay(
  allShifts: ScheduleShift[],
  serviceDayKey: string,
  intervalMinutes: number,
): { slotStr: string; time: Date } | null {
  const dow = istDayOfWeek(istAppointmentDate(serviceDayKey, '12:00'));
  const dayShifts = shiftsForDay(allShifts, dow);
  if (!dayShifts.length) return null;
  const slots = enumerateShiftSlots(dayShifts[0], intervalMinutes, -1);
  if (!slots.length) return null;
  const slotStr = slots[0];
  return { slotStr, time: istAppointmentDate(serviceDayKey, slotStr) };
}

/** Shifts that start after `afterMinutes` on the same IST day. */
export function nextShiftSameDay(
  allShifts: ScheduleShift[],
  dayOfWeek: number,
  afterMinutes: number,
): ScheduleShift | null {
  const dayShifts = shiftsForDay(allShifts, dayOfWeek);
  return dayShifts.find((s) => parseHmToMinutes(s.startTime) > afterMinutes) ?? null;
}

export { serviceDay };
