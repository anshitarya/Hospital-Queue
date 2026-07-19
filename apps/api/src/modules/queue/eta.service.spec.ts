import { Doctor, DoctorStatus, EntryStatus, QueueEntry } from '@prisma/client';
import { EtaService, removeOutliers, ema } from './eta.service';

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

const svc = new EtaService();

// ─── enrich() ────────────────────────────────────────────────────────────────

describe('EtaService.enrich', () => {
  it('returns peopleAhead=0 and etaMinutes=0 for non-waiting entries', () => {
    const out = svc.enrich(doctor(), [entry({ status: EntryStatus.IN_CONSULTATION })]);
    expect(out[0].peopleAhead).toBe(0);
    expect(out[0].etaMinutes).toBe(0);
  });

  it('first waiting patient has peopleAhead=0 and eta=0 when no in-progress', () => {
    const out = svc.enrich(doctor({ avgConsultMinutes: 8 }), [entry()]);
    expect(out[0].peopleAhead).toBe(0);
    expect(out[0].etaMinutes).toBe(0);
  });

  it('ETA = peopleAhead × avg + delay when no in-progress patient', () => {
    const d  = doctor({ avgConsultMinutes: 10, delayMinutes: 5 });
    const a  = entry({ id: 'a', tokenNumber: 1 });
    const b  = entry({ id: 'b', tokenNumber: 2 });
    const c  = entry({ id: 'c', tokenNumber: 3 });
    const out = svc.enrich(d, [a, b, c]);

    expect(out.find((e) => e.id === 'a')!.etaMinutes).toBe(5);   // 0 ahead + 5 delay
    expect(out.find((e) => e.id === 'b')!.etaMinutes).toBe(15);  // 1 ahead × 10 + 5
    expect(out.find((e) => e.id === 'c')!.etaMinutes).toBe(25);  // 2 ahead × 10 + 5
  });

  it('subtracts elapsed time for the in-progress patient', () => {
    const NOW = new Date('2024-01-01T10:00:00Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);

    const d          = doctor({ avgConsultMinutes: 10 });
    const inProgress = entry({ id: 'cur', status: EntryStatus.IN_CONSULTATION, startedAt: new Date(NOW - 4 * 60_000) });
    const next       = entry({ id: 'nxt', status: EntryStatus.WAITING, tokenNumber: 2 });

    const out = svc.enrich(d, [inProgress, next]);
    // Remaining = 10 - 4 = 6 min; peopleAhead = 0 → ETA = 6
    expect(out.find((e) => e.id === 'nxt')!.etaMinutes).toBe(6);
    jest.restoreAllMocks();
  });

  it('clamps remaining time to 0 when consultation has overrun', () => {
    const NOW = new Date('2024-01-01T10:00:00Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);

    const d       = doctor({ avgConsultMinutes: 10 });
    const overrun = entry({ id: 'cur', status: EntryStatus.IN_CONSULTATION, startedAt: new Date(NOW - 30 * 60_000) });
    const next    = entry({ id: 'nxt', status: EntryStatus.WAITING, tokenNumber: 2 });

    const out = svc.enrich(d, [overrun, next]);
    expect(out.find((e) => e.id === 'nxt')!.etaMinutes).toBe(0);
    jest.restoreAllMocks();
  });

  it('adds break remaining time to all waiting patients', () => {
    const d    = doctor({ avgConsultMinutes: 10 });
    const a    = entry({ id: 'a', tokenNumber: 1 });
    const b    = entry({ id: 'b', tokenNumber: 2 });
    const out  = svc.enrich(d, [a, b], { breakRemainingMinutes: 15 });

    expect(out.find((e) => e.id === 'a')!.etaMinutes).toBe(15);  // 0 ahead + 15 break
    expect(out.find((e) => e.id === 'b')!.etaMinutes).toBe(25);  // 1 ahead × 10 + 15 break
  });

  it('prefers movingAvgMinutes from options over doctor.avgConsultMinutes', () => {
    const d   = doctor({ avgConsultMinutes: 10 });
    const a   = entry({ id: 'a', tokenNumber: 1 });
    const b   = entry({ id: 'b', tokenNumber: 2 });
    const out = svc.enrich(d, [a, b], { movingAvgMinutes: 6 });

    expect(out.find((e) => e.id === 'b')!.etaMinutes).toBe(6);  // 1 ahead × 6
    expect(out.find((e) => e.id === 'b')!.movingAvgMinutes).toBe(6);
  });

  it('does not push morning-queue patients to the evening shift baseline', () => {
    const NOW = new Date('2026-07-19T04:01:00.000Z').getTime(); // 9:31 IST, after 09:30 shift
    jest.spyOn(Date, 'now').mockReturnValue(NOW);

    const morningApt = new Date('2026-07-19T03:53:00.000Z'); // 09:23 IST
    const d = doctor({ avgConsultMinutes: 10 });
    const a = entry({
      id: 'a',
      tokenNumber: 1,
      appointmentTime: morningApt,
      appointmentSlot: '09:23',
      locationId: 'loc-morning',
    });
    const shifts = [
      { dayOfWeek: 0, startTime: '09:23', endTime: '09:25', locationId: 'loc-morning' },
      { dayOfWeek: 0, startTime: '18:00', endTime: '20:00', locationId: 'loc-evening' },
    ];

    const out = svc.enrich(d, [a], { shifts, settings: { queueMode: 'LIVE_QUEUE' } });
    expect(out[0].etaMinutes).toBeLessThan(30);
    jest.restoreAllMocks();
  });

  it('handles empty queue', () => {
    expect(svc.enrich(doctor(), [])).toEqual([]);
  });

  it('rounds ETA to nearest minute', () => {
    const NOW = new Date('2024-01-01T10:00:00Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);

    const d          = doctor({ avgConsultMinutes: 10 });
    // 4 min 30 sec elapsed → 5.5 min remaining → rounds to 6
    const inProgress = entry({ id: 'cur', status: EntryStatus.IN_CONSULTATION, startedAt: new Date(NOW - (4 * 60_000 + 30_000)) });
    const next       = entry({ id: 'nxt', status: EntryStatus.WAITING });

    const out = svc.enrich(d, [inProgress, next]);
    expect(out.find((e) => e.id === 'nxt')!.etaMinutes).toBe(6);
    jest.restoreAllMocks();
  });
});

// ─── removeOutliers() ─────────────────────────────────────────────────────────

describe('removeOutliers', () => {
  it('removes extreme high values (e.g. doctor went for lunch)', () => {
    // Typical consultations 5–10 min, one 90-min outlier
    const durations = [5, 6, 7, 8, 7, 6, 8, 9, 7, 90];
    const cleaned   = removeOutliers(durations);
    expect(cleaned).not.toContain(90);
    expect(cleaned.every((d) => d <= 30)).toBe(true);
  });

  it('removes extreme low values (accidental near-instant completions)', () => {
    const durations = [0.2, 7, 8, 9, 6, 7, 8, 10, 8, 7];
    const cleaned   = removeOutliers(durations);
    expect(cleaned).not.toContain(0.2);
  });

  it('keeps clean data unchanged', () => {
    const durations = [7, 8, 9, 6, 7, 8, 7, 8, 9, 8];
    const cleaned   = removeOutliers(durations);
    expect(cleaned.length).toBe(durations.length);
  });

  it('returns original array when fewer than 4 samples', () => {
    const durations = [5, 90];
    expect(removeOutliers(durations)).toEqual(durations);
  });

  it('does not produce an empty result even if IQR≈0 (all identical)', () => {
    const durations = [8, 8, 8, 8, 8];
    expect(removeOutliers(durations).length).toBeGreaterThan(0);
  });
});

// ─── ema() ───────────────────────────────────────────────────────────────────

describe('ema', () => {
  it('returns single value unchanged', () => {
    expect(ema([10], 0.3)).toBeCloseTo(10);
  });

  it('weights recent values more than older ones with α=0.3', () => {
    // Series: [10, 10, 10, 5] — recent value dropped to 5
    // A simple mean would give 8.75; EMA should be closer to 5
    const result = ema([10, 10, 10, 5], 0.3);
    expect(result).toBeLessThan(8.75); // more sensitive to recent drop
    expect(result).toBeGreaterThan(5); // but not all the way there yet
  });

  it('converges toward the recent trend faster than a simple mean', () => {
    // 15 slow consultations followed by 5 fast ones
    const series  = [...Array(15).fill(15), ...Array(5).fill(5)];
    const emaVal  = ema(series, 0.3);
    const meanVal = series.reduce((s, v) => s + v, 0) / series.length;
    // EMA should be closer to the recent fast pace (5) than simple mean
    expect(Math.abs(emaVal - 5)).toBeLessThan(Math.abs(meanVal - 5));
  });

  it('handles empty series without throwing', () => {
    expect(ema([], 0.3)).toBe(0);
  });
});
