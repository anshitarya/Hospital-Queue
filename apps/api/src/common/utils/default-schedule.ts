import { ScheduleShift } from '../utils/schedule-slots';

/** Default Mon–Fri 09:00–17:00, Sat 09:00–14:00 (matches seed pattern). */
export function defaultWeeklyShifts(): ScheduleShift[] {
  return [
    { dayOfWeek: 0, startTime: '09:00', endTime: '17:00', isHoliday: true },
    { dayOfWeek: 1, startTime: '09:00', endTime: '13:00', isHoliday: false },
    { dayOfWeek: 1, startTime: '14:00', endTime: '18:00', isHoliday: false },
    { dayOfWeek: 2, startTime: '09:00', endTime: '18:00', isHoliday: false },
    { dayOfWeek: 3, startTime: '09:00', endTime: '18:00', isHoliday: false },
    { dayOfWeek: 4, startTime: '09:00', endTime: '18:00', isHoliday: false },
    { dayOfWeek: 5, startTime: '09:00', endTime: '18:00', isHoliday: false },
    { dayOfWeek: 6, startTime: '09:00', endTime: '14:00', isHoliday: false },
  ];
}

export function normalizeShiftInput(
  shifts: Array<{ dayOfWeek: number; startTime: string; endTime: string; isHoliday?: boolean }>,
): ScheduleShift[] {
  return shifts.map((s) => ({
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    isHoliday: s.isHoliday ?? false,
  }));
}
