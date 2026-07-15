import { ConflictException, NotFoundException } from '@nestjs/common';
import { DoctorStatus, EntryStatus, Role } from '@prisma/client';
import { QueueService } from './queue.service';
import { EtaService } from './eta.service';
import { QueueGateway } from './gateway/queue.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { CustomerService } from '../patients/customer.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

/**
 * Integration-style tests for QueueService. We mock prisma + redis at the
 * service boundary, and use a spy gateway so we can assert that the right
 * socket rooms are notified on every transition.
 *
 * The biggest behavioural test: after each operation that touches a patient,
 * the gateway MUST emit `patient:queue:updated` to that patient's private
 * room. This is the bug fix from task #22 — losing it again would silently
 * break the patient real-time view.
 */

interface FakeEntry {
  id: string;
  doctorId: string;
  patientId: string;
  createdById: string | null;
  serviceDay: string;
  tokenNumber: number;
  priority: number;
  notes: string | null;
  status: EntryStatus;
  version: number;
  joinedAt: Date;
  calledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

function makeFakePrisma() {
  const entries: FakeEntry[] = [];
  const users = new Map<string, { id: string; phone: string; name: string; role: Role }>();
  const events: { doctorId: string; entryId?: string; type: string }[] = [];
  const doctor: {
    id: string;
    userId: string;
    clinicId: string;
    departmentId: string;
    avgConsultMinutes: number;
    delayMinutes: number;
    status: DoctorStatus;
    createdAt: Date;
    updatedAt: Date;
    user: { id: string; name: string };
    department: { id: string; name: string };
  } = {
    id: 'doc-1',
    userId: 'doc-user',
    clinicId: 'c-1',
    departmentId: 'dept-1',
    avgConsultMinutes: 10,
    delayMinutes: 0,
    status: DoctorStatus.AVAILABLE,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: 'doc-user', name: 'Dr A' },
    department: { id: 'dept-1', name: 'General' },
  };

  return {
    doctor: {
      findUnique: jest.fn(async () => doctor),
      update: jest.fn(async ({ data }: { data: { status: DoctorStatus } }) => {
        doctor.status = data.status;
        return doctor;
      }),
    },
    user: {
      upsert: jest.fn(async ({ where, update, create }: any) => {
        const existing = [...users.values()].find((u) => u.phone === where.phone);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = { id: `u-${users.size + 1}`, ...create };
        users.set(created.id, created);
        return created;
      }),
    },
    queueEntry: {
      findFirst: jest.fn(async ({ where, orderBy }: any) => {
        const list = entries
          .filter((e) => {
            if (where.doctorId && e.doctorId !== where.doctorId) return false;
            if (where.serviceDay && e.serviceDay !== where.serviceDay) return false;
            if (where.patientId && e.patientId !== where.patientId) return false;
            if (where.status && e.status !== where.status) return false;
            return true;
          })
          .sort((a, b) =>
            orderBy?.tokenNumber === 'desc'
              ? b.tokenNumber - a.tokenNumber
              : a.tokenNumber - b.tokenNumber,
          );
        return list[0] ?? null;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        // Return a COPY so the caller can hold a pre-update snapshot — production
        // prisma returns a fresh object on every call, and the service relies
        // on that to read the "from" status during a state transition.
        const e = entries.find((x) => x.id === where.id);
        return e ? { ...e } : null;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        return entries
          .filter(
            (e) => {
              const statusMatch = where.status && typeof where.status === 'object' && 'in' in where.status
                ? where.status.in.includes(e.status)
                : where.status === undefined || e.status === where.status;
              return (
                e.doctorId === where.doctorId &&
                e.serviceDay === where.serviceDay &&
                statusMatch
              );
            }
          )
          .map((e) => ({ ...e, patient: users.get(e.patientId) }));
      }),
      count: jest.fn(async ({ where }: any) => {
        return entries.filter((e) => {
          if (where.doctorId && e.doctorId !== where.doctorId) return false;
          if (where.serviceDay && e.serviceDay !== where.serviceDay) return false;
          if (where.calledAt && where.calledAt.not === null && e.calledAt === null) return false;
          if (where.status && e.status !== where.status) return false;
          return true;
        }).length;
      }),
      create: jest.fn(async ({ data }: any) => {
        const e: FakeEntry = {
          id: `e-${entries.length + 1}`,
          createdById: data.createdById ?? null,
          notes: data.notes ?? null,
          priority: data.priority ?? 0,
          tokenNumber: data.tokenNumber,
          serviceDay: data.serviceDay,
          doctorId: data.doctorId,
          patientId: data.patientId,
          status: data.status,
          version: 1,
          joinedAt: new Date(),
          calledAt: null,
          startedAt: null,
          completedAt: null,
        };
        entries.push(e);
        return { ...e, patient: users.get(e.patientId) };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const e = entries.find((x) => x.id === where.id);
        if (!e) throw new Error('not found');
        if (data.status) e.status = data.status;
        if (data.version?.increment) e.version += data.version.increment;
        if (data.priority !== undefined) e.priority = data.priority;
        if (data.calledAt) e.calledAt = data.calledAt;
        if (data.startedAt) e.startedAt = data.startedAt;
        if (data.completedAt) e.completedAt = data.completedAt;
        return { ...e, patient: users.get(e.patientId) };
      }),
    },
    queueEvent: {
      create: jest.fn(async ({ data }: any) => {
        events.push(data);
        return data;
      }),
    },
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
      // Pass the same fake prisma in as tx — good enough for tests.
      return fn({
        doctor: {
          findUnique: jest.fn(async () => doctor),
        },
        queueEntry: {
          findFirst: jest.fn(async ({ where, orderBy }: any) => {
            const list = entries
              .filter((e) => {
                if (where.doctorId && e.doctorId !== where.doctorId) return false;
                if (where.serviceDay && e.serviceDay !== where.serviceDay) return false;
                if (where.patientId && e.patientId !== where.patientId) return false;
                if (where.status && e.status !== where.status) return false;
                return true;
              })
              .sort((a, b) =>
                orderBy?.tokenNumber === 'desc'
                  ? b.tokenNumber - a.tokenNumber
                  : a.tokenNumber - b.tokenNumber,
              );
            return list[0] ?? null;
          }),
          findMany: jest.fn(async ({ where }: any) => {
            return entries
              .filter(
                (e) => {
                  const statusMatch = where.status && typeof where.status === 'object' && 'in' in where.status
                    ? where.status.in.includes(e.status)
                    : where.status === undefined || e.status === where.status;
                  return (
                    e.doctorId === where.doctorId &&
                    e.serviceDay === where.serviceDay &&
                    statusMatch
                  );
                }
              )
              .map((e) => ({ ...e, patient: users.get(e.patientId) }));
          }),
          create: async ({ data }: any) => {
            const e: FakeEntry = {
              id: `e-${entries.length + 1}`,
              createdById: data.createdById ?? null,
              notes: data.notes ?? null,
              priority: data.priority ?? 0,
              tokenNumber: data.tokenNumber,
              serviceDay: data.serviceDay,
              doctorId: data.doctorId,
              patientId: data.patientId,
              status: data.status,
              version: 1,
              joinedAt: new Date(),
              calledAt: null,
              startedAt: null,
              completedAt: null,
            };
            entries.push(e);
            return { ...e, patient: users.get(e.patientId) };
          },
        },
      });
    }),
    _entries: entries,
    _users: users,
    _events: events,
    _doctor: doctor,
  };
}

function makeFakeRedis() {
  const store = new Map<string, string>();
  return {
    client: {
      async get(k: string) { return store.get(k) ?? null; },
      async set(k: string, v: string) { store.set(k, v); return 'OK'; },
    },
  };
}

function makeGatewaySpy() {
  return {
    emitToDoctorRoom: jest.fn(),
    emitToPatientRoom: jest.fn(),
  };
}

function makeService() {
  const prisma = makeFakePrisma();
  const redis = makeFakeRedis();
  const gateway = makeGatewaySpy();
  const eta = new EtaService();
  const notifications = {
    notifyJoined: () => Promise.resolve(),
    notifyTurnNow: () => Promise.resolve(),
    notifyAlmostNext: () => Promise.resolve(),
    notifyQueueCleared: () => Promise.resolve(),
    notifyTurnSoon: () => Promise.resolve(),
    notifyDelayed: () => Promise.resolve(),
  } as unknown as NotificationsService;
  const customers = {
    upsertByPhone: jest.fn(async (phone: string, name: string) => {
      const users = prisma._users as unknown as Map<string, { id: string; phone: string; name: string; customerPin?: string }>;
      const existing = [...users.values()].find((u) => u.phone === phone);
      if (existing) {
        Object.assign(existing, { name });
        return existing;
      }
      const created = {
        id: `u-${users.size + 1}`,
        role: 'PATIENT',
        phone,
        name,
        customerPin: '1234',
      };
      users.set(created.id, created);
      return created;
    }),
    ensurePin: jest.fn(async (u: { id: string; customerPin?: string | null }) => u.customerPin ?? '1234'),
  } as unknown as CustomerService;
  const svc = new QueueService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    eta,
    gateway as unknown as QueueGateway,
    notifications,
    customers,
  );
  return { svc, prisma, gateway, redis };
}

describe('QueueService — reception join → patient sync', () => {
  it('creates the entry and emits to BOTH doctor room and patient room', async () => {
    const { svc, prisma, gateway } = makeService();

    const entry = await svc.joinByReception(
      {
        doctorId: 'doc-1',
        patientName: 'Alice',
        patientPhone: '+919876543210',
      },
      'recp-1',
    );

    expect(entry.tokenNumber).toBe(1);
    expect(prisma._entries).toHaveLength(1);

    // Doctor room — the reception screen + display board listen here
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(gateway.emitToDoctorRoom).toHaveBeenCalledWith(
      'doc-1',
      'queue:updated',
      expect.objectContaining({
        eventType: 'patient_joined',
      }),
    );

    // Patient room — THIS IS THE FIX from task #22.
    // Without it, the patient page misses the check-in until the next poll.
    expect(gateway.emitToPatientRoom).toHaveBeenCalledWith(
      expect.any(String),
      'patient:queue:updated',
      expect.objectContaining({
        eventType: 'joined',
        doctorId: 'doc-1',
      }),
    );
  });

  it('upserts the patient by phone — second join reuses the same user', async () => {
    const { svc, prisma } = makeService();

    await svc.joinByReception(
      { doctorId: 'doc-1', patientName: 'Alice', patientPhone: '+919876543210' },
      'recp-1',
    );
    await svc.joinByReception(
      { doctorId: 'doc-1', patientName: 'Alice K', patientPhone: '+919876543210' },
      'recp-1',
    );

    expect(prisma._users.size).toBe(1);
    expect([...prisma._users.values()][0].name).toBe('Alice K');
  });

  it('returns the cached entry when idempotencyKey replays', async () => {
    const { svc } = makeService();

    const a = await svc.joinByReception(
      {
        doctorId: 'doc-1',
        patientName: 'Bob',
        patientPhone: '+919876543210',
        idempotencyKey: 'dup-key-1',
      },
      'recp-1',
    );
    const b = await svc.joinByReception(
      {
        doctorId: 'doc-1',
        patientName: 'Bob',
        patientPhone: '+919876543210',
        idempotencyKey: 'dup-key-1',
      },
      'recp-1',
    );

    expect(b.id).toBe(a.id);
  });
});

describe('QueueService — transitions notify the patient', () => {
  it('callNext emits patient:queue:updated for the called patient', async () => {
    const { svc, gateway } = makeService();

    const entry = await svc.joinByReception(
      { doctorId: 'doc-1', patientName: 'C', patientPhone: '+919876543210' },
      'r-1',
    );
    gateway.emitToPatientRoom.mockClear();

    await svc.callNext('doc-1', 'r-1');

    expect(gateway.emitToPatientRoom).toHaveBeenCalledWith(
      expect.any(String),
      'patient:queue:updated',
      expect.objectContaining({
        eventType: 'entry_in_consultation',
        entryId: entry.id,
        from: EntryStatus.WAITING,
        to: EntryStatus.IN_CONSULTATION,
      }),
    );
  });

  it('complete emits patient:queue:updated', async () => {
    const { svc, gateway } = makeService();
    const e = await svc.joinByReception(
      { doctorId: 'doc-1', patientName: 'C', patientPhone: '+919876543210' },
      'r-1',
    );
    await svc.callNext('doc-1', 'r-1');
    gateway.emitToPatientRoom.mockClear();

    await svc.complete(e.id, 'r-1');

    expect(gateway.emitToPatientRoom).toHaveBeenCalledWith(
      expect.any(String),
      'patient:queue:updated',
      expect.objectContaining({ to: EntryStatus.COMPLETED }),
    );
  });

  it('skip emits patient:queue:updated', async () => {
    const { svc, gateway } = makeService();
    const e = await svc.joinByReception(
      { doctorId: 'doc-1', patientName: 'C', patientPhone: '+919876543210' },
      'r-1',
    );
    gateway.emitToPatientRoom.mockClear();

    await svc.skip(e.id, 'r-1');

    expect(gateway.emitToPatientRoom).toHaveBeenCalledWith(
      expect.any(String),
      'patient:queue:updated',
      expect.objectContaining({ to: EntryStatus.SKIPPED }),
    );
  });

  it('cancel emits patient:queue:updated', async () => {
    const { svc, gateway } = makeService();
    const e = await svc.joinByReception(
      { doctorId: 'doc-1', patientName: 'C', patientPhone: '+919876543210' },
      'r-1',
    );
    gateway.emitToPatientRoom.mockClear();

    await svc.cancel(e.id, { id: 'r-1', role: 'RECEPTIONIST' });

    expect(gateway.emitToPatientRoom).toHaveBeenCalledWith(
      expect.any(String),
      'patient:queue:updated',
      expect.objectContaining({ to: EntryStatus.CANCELLED }),
    );
  });

  it('reorder emits patient:queue:updated', async () => {
    const { svc, gateway } = makeService();
    const e = await svc.joinByReception(
      { doctorId: 'doc-1', patientName: 'C', patientPhone: '+919876543210' },
      'r-1',
    );
    gateway.emitToPatientRoom.mockClear();

    await svc.reorder(e.id, { priority: 50 }, 'r-1');

    expect(gateway.emitToPatientRoom).toHaveBeenCalledWith(
      expect.any(String),
      'patient:queue:updated',
      expect.objectContaining({ eventType: 'reordered' }),
    );
  });
});

describe('QueueService — state-machine guards', () => {
  it('callNext throws ConflictException if a patient is already in consultation', async () => {
    const { svc } = makeService();
    await svc.joinByReception(
      { doctorId: 'doc-1', patientName: 'A', patientPhone: '+919876543210' },
      'r',
    );
    await svc.joinByReception(
      { doctorId: 'doc-1', patientName: 'B', patientPhone: '+919876543211' },
      'r',
    );
    await svc.callNext('doc-1', 'r');

    await expect(svc.callNext('doc-1', 'r')).rejects.toBeInstanceOf(ConflictException);
  });

  it('callNext throws NotFoundException when queue is empty', async () => {
    const { svc } = makeService();
    await expect(svc.callNext('doc-1', 'r')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cannot complete a WAITING entry — only IN_CONSULTATION', async () => {
    const { svc } = makeService();
    const e = await svc.joinByReception(
      { doctorId: 'doc-1', patientName: 'A', patientPhone: '+919876543210' },
      'r',
    );
    await expect(svc.complete(e.id, 'r')).rejects.toBeInstanceOf(ConflictException);
  });

  it('cannot reorder a non-WAITING entry', async () => {
    const { svc } = makeService();
    const e = await svc.joinByReception(
      { doctorId: 'doc-1', patientName: 'A', patientPhone: '+919876543210' },
      'r',
    );
    await svc.callNext('doc-1', 'r');
    await expect(svc.reorder(e.id, { priority: 50 }, 'r')).rejects.toThrow();
  });
});

describe('QueueService — priority handling', () => {
  it('emergency patient (priority 100) is called before normal priority', async () => {
    const { svc, prisma } = makeService();
    await svc.joinByReception(
      { doctorId: 'doc-1', patientName: 'Normal-1', patientPhone: '+919876543210' },
      'r',
    );
    await svc.joinByReception(
      { doctorId: 'doc-1', patientName: 'Normal-2', patientPhone: '+919876543211' },
      'r',
    );
    const urgent = await svc.joinByReception(
      {
        doctorId: 'doc-1',
        patientName: 'Emergency',
        patientPhone: '+919876543212',
        priority: 100,
      },
      'r',
    );

    const next = await svc.callNext('doc-1', 'r');
    expect(next.id).toBe(urgent.id);
  });
});

describe('QueueService — pause / resume', () => {
  it('pauseDoctor sets status PAUSED and broadcasts to doctor room', async () => {
    const { svc, prisma, gateway } = makeService();
    await svc.pauseDoctor('doc-1', 'r-1');
    expect(prisma._doctor.status).toBe(DoctorStatus.PAUSED);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(gateway.emitToDoctorRoom).toHaveBeenCalledWith(
      'doc-1',
      'queue:updated',
      expect.objectContaining({ eventType: 'doctor_status' }),
    );
  });

  it('resumeDoctor sets status AVAILABLE', async () => {
    const { svc, prisma } = makeService();
    await svc.pauseDoctor('doc-1', 'r-1');
    await svc.resumeDoctor('doc-1', 'r-1');
    expect(prisma._doctor.status).toBe(DoctorStatus.AVAILABLE);
  });
});
