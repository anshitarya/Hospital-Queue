import { EntryStatus } from '@prisma/client';
import { compareActiveEntries, computeManualMoveData, effectivePosition } from './queue-ordering';

describe('compareActiveEntries', () => {
  it('sorts by appointment time before token number on the same day', () => {
    const day = '2026-07-19';
    const early = {
      serviceDay: day,
      appointmentTime: new Date('2026-07-19T03:25:00.000Z'), // 08:55 IST
      sortOrder: null,
      tokenNumber: 2,
    };
    const late = {
      serviceDay: day,
      appointmentTime: new Date('2026-07-19T08:25:00.000Z'), // 13:55 IST
      sortOrder: null,
      tokenNumber: 1,
    };
    expect(compareActiveEntries(early, late)).toBeLessThan(0);
    expect(effectivePosition(late)).toBeLessThan(effectivePosition(early));
  });
});

describe('computeManualMoveData', () => {
  it('adopts the target slot when moving across days', () => {
    const fri = {
      id: 'fri',
      sortOrder: null,
      tokenNumber: 1,
      status: EntryStatus.WAITING,
      serviceDay: '2026-07-24',
      appointmentTime: new Date('2026-07-24T03:30:00.000Z'),
      appointmentSlot: '09:00',
    };
    const mon = {
      id: 'mon',
      sortOrder: null,
      tokenNumber: 2,
      status: EntryStatus.WAITING,
      serviceDay: '2026-07-20',
      appointmentTime: new Date('2026-07-20T03:30:00.000Z'),
      appointmentSlot: '09:00',
    };
    const move = computeManualMoveData(fri, [mon], 1);
    expect(move.serviceDay).toBe('2026-07-24');
    expect(move.appointmentSlot).toBe('09:00');
    expect(move.sortOrder).toBeLessThan(effectivePosition(mon));
  });
});
