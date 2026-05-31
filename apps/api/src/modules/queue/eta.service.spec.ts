import { Doctor, DoctorStatus, EntryStatus, QueueEntry } from '@prisma/client';
import { EtaService } from './eta.service';

/**
 * Helpers to keep each test compact.
 */
function doctor(overrides: Partial<Doctor> = {}): Doctor {
  return {
    id: 'doc-1',
    userId: 'user-1',
    clinicId: 'clinic-1',
    departmentId: 'dept-1',
    avgConsultMinutes: 10,
    delayMinutes: 0,
    status: DoctorStatus.AVAILABLE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Doctor;
}

function entry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: 'e-1',
    doctorId: 'doc-1',
    patientId: 'p-1',
    createdById: null,
    serviceDay: '2024-01-01',
    tokenNumber: 1,
    priority: 0,
    notes: null,
    status: EntryStatus.WAITING,
    version: 1,
    joinedAt: new Date('2024-01-01T09:00:00Z'),
    calledAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as QueueEntry;
}

describe('EtaService.enrich', () => {
  const svc = new EtaService();

  it('returns peopleAhead=0 and etaMinutes=0 for non-waiting entries', () => {
    const d = doctor();
    const e = entry({ status: EntryStatus.IN_CONSULTATION });
    const out = svc.enrich(d, [e]);
    expect(out[0].peopleAhead).toBe(0);
    expect(out[0].etaMinutes).toBe(0);
  });

  it('first waiting patient has peopleAhead=0 and eta=0 when no in-progress', () => {
    const d = doctor({ avgConsultMinutes: 8 });
    const e1 = entry({ id: 'e1', tokenNumber: 1, status: EntryStatus.WAITING });
    const out = svc.enrich(d, [e1]);
    expect(out[0].peopleAhead).toBe(0);
    expect(out[0].etaMinutes).toBe(0);
  });

  it('orders by (priority DESC, joinedAt ASC)', () => {
    const d = doctor({ avgConsultMinutes: 5 });
    const a = entry({ id: 'a', tokenNumber: 1, priority: 0, joinedAt: new Date('2024-01-01T09:00:00Z') });
    const b = entry({ id: 'b', tokenNumber: 2, priority: 0, joinedAt: new Date('2024-01-01T09:05:00Z') });
    const c = entry({ id: 'c', tokenNumber: 3, priority: 100, joinedAt: new Date('2024-01-01T09:10:00Z') }); // emergency

    const out = svc.enrich(d, [a, b, c]);
    // Emergency `c` jumps to the front → peopleAhead = 0
    expect(out.find((e) => e.id === 'c')!.peopleAhead).toBe(0);
    // `a` came first chronologically → peopleAhead = 1 (only c ahead)
    expect(out.find((e) => e.id === 'a')!.peopleAhead).toBe(1);
    // `b` → 2 ahead
    expect(out.find((e) => e.id === 'b')!.peopleAhead).toBe(2);
  });

  it('ETA = peopleAhead * avgConsult + delay when no in-progress', () => {
    const d = doctor({ avgConsultMinutes: 10, delayMinutes: 5 });
    const a = entry({ id: 'a', tokenNumber: 1, joinedAt: new Date('2024-01-01T09:00:00Z') });
    const b = entry({ id: 'b', tokenNumber: 2, joinedAt: new Date('2024-01-01T09:05:00Z') });
    const c = entry({ id: 'c', tokenNumber: 3, joinedAt: new Date('2024-01-01T09:10:00Z') });

    const out = svc.enrich(d, [a, b, c]);
    expect(out.find((e) => e.id === 'a')!.etaMinutes).toBe(0 + 5);   // 0 ahead + 5 delay
    expect(out.find((e) => e.id === 'b')!.etaMinutes).toBe(10 + 5);
    expect(out.find((e) => e.id === 'c')!.etaMinutes).toBe(20 + 5);
  });

  it('subtracts elapsed time of in-progress consultation from "remaining"', () => {
    // Fix Date.now so the test is deterministic.
    const NOW = new Date('2024-01-01T10:00:00Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);

    const d = doctor({ avgConsultMinutes: 10, delayMinutes: 0 });

    // In-progress patient started 4 minutes ago → 6 min remaining.
    const inProgress = entry({
      id: 'cur',
      status: EntryStatus.IN_CONSULTATION,
      startedAt: new Date(NOW - 4 * 60_000),
    });
    const next = entry({
      id: 'next',
      status: EntryStatus.WAITING,
      tokenNumber: 2,
    });

    const out = svc.enrich(d, [inProgress, next]);
    // ETA = 6 min remaining + 0 ahead * 10 = 6
    expect(out.find((e) => e.id === 'next')!.etaMinutes).toBe(6);

    jest.restoreAllMocks();
  });

  it('floors the remaining-time contribution at zero (overrun consultation)', () => {
    const NOW = new Date('2024-01-01T10:00:00Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);

    const d = doctor({ avgConsultMinutes: 10 });
    // Started 30 min ago → already overran by 20 min — remaining should clamp at 0.
    const overrun = entry({
      id: 'cur',
      status: EntryStatus.IN_CONSULTATION,
      startedAt: new Date(NOW - 30 * 60_000),
    });
    const next = entry({ id: 'next', status: EntryStatus.WAITING, tokenNumber: 2 });

    const out = svc.enrich(d, [overrun, next]);
    expect(out.find((e) => e.id === 'next')!.etaMinutes).toBe(0);

    jest.restoreAllMocks();
  });

  it('rounds ETA to nearest minute', () => {
    const NOW = new Date('2024-01-01T10:00:00Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);

    const d = doctor({ avgConsultMinutes: 10 });
    // 4 min 30 sec elapsed → 5.5 min remaining → ETA = 6 (rounded)
    const inProgress = entry({
      id: 'cur',
      status: EntryStatus.IN_CONSULTATION,
      startedAt: new Date(NOW - (4 * 60_000 + 30_000)),
    });
    const next = entry({ id: 'next', status: EntryStatus.WAITING });

    const out = svc.enrich(d, [inProgress, next]);
    expect(out.find((e) => e.id === 'next')!.etaMinutes).toBe(6);

    jest.restoreAllMocks();
  });

  it('handles empty queue', () => {
    expect(svc.enrich(doctor(), [])).toEqual([]);
  });
});
