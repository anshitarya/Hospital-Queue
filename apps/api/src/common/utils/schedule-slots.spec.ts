import {
  resolveNextShiftAfter,
  resolveRolloverRefTime,
  type ScheduleShift,
} from './schedule-slots';

const sundayShifts: ScheduleShift[] = [
  { dayOfWeek: 0, startTime: '09:23', endTime: '09:25' },
  { dayOfWeek: 0, startTime: '09:27', endTime: '09:30' },
  { dayOfWeek: 1, startTime: '09:00', endTime: '18:00' },
];

describe('resolveRolloverRefTime', () => {
  it('uses shift end when wall clock is before the assigned slot', () => {
    const now = new Date('2026-07-19T04:00:00.000Z'); // 9:30 IST
    const appt = new Date('2026-07-19T03:57:00.000Z'); // 9:27 IST
    const ref = resolveRolloverRefTime(
      [{ appointmentTime: appt }],
      '2026-07-19',
      sundayShifts,
      now,
    );
    const next = resolveNextShiftAfter(sundayShifts, ref);
    expect(next?.serviceDay).toBe('2026-07-20');
    expect(next?.slotStr).toBe('09:00');
  });

  it('advances past the last same-day shift instead of repeating it', () => {
    const now = new Date('2026-07-19T03:50:00.000Z'); // 9:20 IST
    const appt = new Date('2026-07-19T03:57:00.000Z'); // 9:27 IST (2nd shift)
    const ref = resolveRolloverRefTime(
      [{ appointmentTime: appt }],
      '2026-07-19',
      sundayShifts,
      now,
    );
    const next = resolveNextShiftAfter(sundayShifts, ref);
    expect(next?.serviceDay).not.toBe('2026-07-19');
  });
});
