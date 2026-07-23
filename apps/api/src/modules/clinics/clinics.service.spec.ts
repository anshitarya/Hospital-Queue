import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ClinicsService } from './clinics.service';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Tests for the doctor-creation flow used by both reception and admin.
 *
 * The same `addDoctor` method is invoked from two different controllers
 * (clinic-scoped vs admin-targeted), so this suite focuses on the contract:
 *   - at least one identifier (email or phone) is required
 *   - identifier uniqueness is enforced across both
 *   - a strong temp password is generated, hashed with argon2, and the
 *     plaintext is returned exactly once
 *   - the user+doctor records are created atomically
 */

function makeFakePrisma() {
  const departments = new Map<string, { id: string; name: string }>([
    ['dept-1', { id: 'dept-1', name: 'General' }],
  ]);
  const clinics = new Map<string, { id: string; name: string }>([
    ['c-1', { id: 'c-1', name: 'Clinic One' }],
  ]);
  const users = new Map<
    string,
    {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      role: string;
      passwordHash: string | null;
      clinicId: string | null;
    }
  >();
  const doctors = new Map<
    string,
    {
      id: string;
      userId: string;
      departmentId: string;
      clinicId: string;
      avgConsultMinutes: number;
      status: string;
    }
  >();

  let userSeq = 0;
  let doctorSeq = 0;

  return {
    department: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        departments.get(where.id) ?? null,
      ),
    },
    clinic: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        clinics.get(where.id) ?? null,
      ),
    },
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string; email?: string; phone?: string } }) => {
        const all = [...users.values()];
        if (where.id) return all.find((u) => u.id === where.id) ?? null;
        if (where.email) return all.find((u) => u.email === where.email) ?? null;
        if (where.phone) return all.find((u) => u.phone === where.phone) ?? null;
        return null;
      }),
      findMany: jest.fn(async (args?: { where?: { clinicId?: string; role?: string | { in?: string[] } } }) => {
        const where = args?.where ?? {};
        let list = [...users.values()];
        if (where.clinicId) list = list.filter((u) => u.clinicId === where.clinicId);
        const roleFilter = where.role;
        if (typeof roleFilter === 'string') list = list.filter((u) => u.role === roleFilter);
        else if (roleFilter && Array.isArray(roleFilter.in)) {
          list = list.filter((u) => roleFilter.in!.includes(u.role));
        }
        return list.map((u) => ({ ...u, createdAt: new Date(), locations: [] }));
      }),
      create: jest.fn(async ({ data }: { data: any }) => {
        const id = `u-${++userSeq}`;
        const user = {
          id,
          name: data.name,
          email: data.email ?? null,
          phone: data.phone ?? null,
          loginId: data.loginId ?? null,
          role: data.role,
          passwordHash: data.passwordHash ?? null,
          clinicId: data.clinicId ?? null,
        };
        users.set(id, user);
        return user;
      }),
    },
    doctor: {
      create: jest.fn(async ({ data, include }: any) => {
        const id = `d-${++doctorSeq}`;
        const doc = {
          id,
          userId: data.userId,
          departmentId: data.departmentId,
          clinicId: data.clinicId,
          avgConsultMinutes: data.avgConsultMinutes,
          status: data.status,
        };
        doctors.set(id, doc);
        const out: any = { ...doc };
        if (include?.user) out.user = users.get(data.userId);
        if (include?.department) out.department = departments.get(data.departmentId);
        return out;
      }),
      findMany: jest.fn(async (args?: { where?: any; select?: any; include?: any }) => {
        const where = args?.where ?? {};
        let list = [...doctors.values()];
        if (where.clinicId) list = list.filter((d) => d.clinicId === where.clinicId);
        return list.map((d) => ({
          ...d,
          locations: [],
          user: users.get(d.userId),
          department: departments.get(d.departmentId),
        }));
      }),
      count: jest.fn(async () => 0),
    },
    location: {
      findFirst: jest.fn(async () => ({ id: 'loc-1' })),
      findMany: jest.fn(async () => [{ id: 'loc-1' }]),
    },
    userLocation: {
      createMany: jest.fn(async () => ({ count: 0 })),
    },
    doctorLocation: {
      createMany: jest.fn(async () => ({ count: 1 })),
    },
    professionalSchedule: {
      createMany: jest.fn(async () => ({ count: 0 })),
    },
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
      // Use the same fake prisma instance as the tx — enough for these tests.
      return fn({
        user: { create: this.user.create },
        doctor: { create: this.doctor.create },
        doctorLocation: { createMany: this.doctorLocation.createMany },
        professionalSchedule: { createMany: this.professionalSchedule.createMany },
      });
    }),

    // Inspection helpers
    _users: users,
    _doctors: doctors,
  };
}

function makeService() {
  const prisma = makeFakePrisma();
  // $transaction proxying — needs `this` to be valid. Re-create with arrow style.
  prisma.$transaction = jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
    fn({
      user: prisma.user,
      doctor: prisma.doctor,
      doctorLocation: prisma.doctorLocation,
      professionalSchedule: prisma.professionalSchedule,
    }),
  );
  return { svc: new ClinicsService(
    prisma as unknown as PrismaService,
    { ensurePin: jest.fn(async (u: { id: string }) => '1234') } as any,
    { triggerEvent: jest.fn() } as any,
  ), prisma };
}

describe('ClinicsService.addDoctor', () => {
  it('creates a doctor with name only using generated loginId', async () => {
    const { svc } = makeService();
    const out = await svc.addDoctor('c-1', {
      name: 'Dr A',
      departmentId: 'dept-1',
    } as any);
    expect(out.doctor.user!.loginId).toBeDefined();
    expect(out.tempPassword).toMatch(/^\d{6}$/);
  });

  it('creates a doctor with email only — returns plaintext temp password', async () => {
    const { svc, prisma } = makeService();
    const out = await svc.addDoctor('c-1', {
      name: 'Dr A',
      email: 'a@x.com',
      departmentId: 'dept-1',
    } as any);

    expect(out.tempPassword).toMatch(/^\d{6}$/);
    expect(out.doctor.user!.email).toBe('a@x.com');
    expect(out.doctor.user!.phone).toBeNull();
    expect(prisma._users.size).toBe(1);
  });

  it('creates a doctor with phone only', async () => {
    const { svc, prisma } = makeService();
    const out = await svc.addDoctor('c-1', {
      name: 'Dr A',
      phone: '+919876543210',
      departmentId: 'dept-1',
    } as any);

    expect(out.doctor.user!.phone).toBe('+919876543210');
    expect(out.doctor.user!.email).toBeNull();
    expect(prisma._users.size).toBe(1);
  });

  it('creates a doctor with both email AND phone', async () => {
    const { svc } = makeService();
    const out = await svc.addDoctor('c-1', {
      name: 'Dr A',
      email: 'a@x.com',
      phone: '+919876543210',
      departmentId: 'dept-1',
    } as any);

    expect(out.doctor.user!.email).toBe('a@x.com');
    expect(out.doctor.user!.phone).toBe('+919876543210');
  });

  it('rejects duplicate email', async () => {
    const { svc } = makeService();
    await svc.addDoctor('c-1', {
      name: 'A',
      email: 'dup@x.com',
      departmentId: 'dept-1',
    } as any);

    await expect(
      svc.addDoctor('c-1', {
        name: 'B',
        email: 'dup@x.com',
        departmentId: 'dept-1',
      } as any),
    ).rejects.toThrow(/email is already registered/i);
  });

  it('rejects duplicate phone', async () => {
    const { svc } = makeService();
    await svc.addDoctor('c-1', {
      name: 'A',
      phone: '+919876543210',
      departmentId: 'dept-1',
    } as any);

    await expect(
      svc.addDoctor('c-1', {
        name: 'B',
        phone: '+919876543210',
        departmentId: 'dept-1',
      } as any),
    ).rejects.toThrow(/mobile.*already registered/i);
  });

  it('throws NotFoundException when department is missing', async () => {
    const { svc } = makeService();
    await expect(
      svc.addDoctor('c-1', {
        name: 'A',
        email: 'a@x.com',
        departmentId: 'absent',
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when clinic is missing (admin path)', async () => {
    const { svc } = makeService();
    await expect(
      svc.addDoctor('absent-clinic', {
        name: 'A',
        email: 'a@x.com',
        departmentId: 'dept-1',
      } as any),
    ).rejects.toThrow(/clinic not found/i);
  });

  it('temp password is stored as an argon2 hash (not plaintext)', async () => {
    const { svc, prisma } = makeService();
    const out = await svc.addDoctor('c-1', {
      name: 'A',
      email: 'a@x.com',
      departmentId: 'dept-1',
    } as any);

    const user = [...prisma._users.values()][0];
    expect(user.passwordHash).not.toBe(out.tempPassword);
    expect(user.passwordHash).toMatch(/^\$argon2/);
    // Round-trip: verify the returned plaintext against the stored hash.
    expect(await argon2.verify(user.passwordHash!, out.tempPassword!)).toBe(true);
  });

  it('the doctor user is assigned to the requested clinic', async () => {
    const { svc, prisma } = makeService();
    await svc.addDoctor('c-1', {
      name: 'A',
      email: 'a@x.com',
      departmentId: 'dept-1',
    } as any);
    const user = [...prisma._users.values()][0];
    expect(user.clinicId).toBe('c-1');
    expect(user.role).toBe('DOCTOR');
  });

  it('uses default avgConsultMinutes (7) when omitted', async () => {
    const { svc, prisma } = makeService();
    await svc.addDoctor('c-1', {
      name: 'A',
      email: 'a@x.com',
      departmentId: 'dept-1',
    } as any);
    const doc = [...prisma._doctors.values()][0];
    expect(doc.avgConsultMinutes).toBe(7);
  });

  it('respects custom avgConsultMinutes when provided', async () => {
    const { svc, prisma } = makeService();
    await svc.addDoctor('c-1', {
      name: 'A',
      email: 'a@x.com',
      departmentId: 'dept-1',
      avgConsultMinutes: 20,
    } as any);
    const doc = [...prisma._doctors.values()][0];
    expect(doc.avgConsultMinutes).toBe(20);
  });
});

describe('ClinicsService.addReceptionist', () => {
  it('creates a receptionist with name only using generated loginId', async () => {
    const { svc } = makeService();
    const out = await svc.addReceptionist('c-1', { name: 'Rep A' } as any);
    expect(out.user.loginId).toBeDefined();
    expect(out.tempPassword).toMatch(/^\d{6}$/);
  });

  it('creates a receptionist with email only — returns plaintext temp password', async () => {
    const { svc, prisma } = makeService();
    const out = await svc.addReceptionist('c-1', {
      name: 'Rep A',
      email: 'rep@x.com',
    } as any);

    expect(out.tempPassword).toMatch(/^\d{6}$/);
    expect(out.user.email).toBe('rep@x.com');
    expect(out.user.phone).toBeNull();
    expect(out.user.role).toBe('RECEPTIONIST');
    expect(prisma._users.size).toBe(1);
  });

  it('creates a receptionist with phone only', async () => {
    const { svc } = makeService();
    const out = await svc.addReceptionist('c-1', {
      name: 'Rep A',
      phone: '+919876543210',
    } as any);

    expect(out.user.phone).toBe('+919876543210');
    expect(out.user.email).toBeNull();
  });

  it('rejects duplicate email across roles (a doctor with same email blocks receptionist creation)', async () => {
    const { svc } = makeService();
    await svc.addDoctor('c-1', {
      name: 'Doc',
      email: 'shared@x.com',
      departmentId: 'dept-1',
    } as any);

    await expect(
      svc.addReceptionist('c-1', {
        name: 'Rep',
        email: 'shared@x.com',
      } as any),
    ).rejects.toThrow(/email is already registered/i);
  });

  it('rejects duplicate phone across roles', async () => {
    const { svc } = makeService();
    await svc.addDoctor('c-1', {
      name: 'Doc',
      phone: '+919876543210',
      departmentId: 'dept-1',
    } as any);

    await expect(
      svc.addReceptionist('c-1', {
        name: 'Rep',
        phone: '+919876543210',
      } as any),
    ).rejects.toThrow(/mobile.*already registered/i);
  });

  it('throws NotFoundException when clinic does not exist', async () => {
    const { svc } = makeService();
    await expect(
      svc.addReceptionist('absent', { name: 'R', email: 'r@x.com' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('the receptionist user is assigned to the requested clinic', async () => {
    const { svc, prisma } = makeService();
    await svc.addReceptionist('c-1', {
      name: 'Rep',
      email: 'r@x.com',
    } as any);
    const user = [...prisma._users.values()][0];
    expect(user.clinicId).toBe('c-1');
    expect(user.role).toBe('RECEPTIONIST');
  });
});

describe('ClinicsService.resetStaffPassword', () => {
  it('generates a new temp password and overwrites the hash', async () => {
    const { svc, prisma } = makeService();
    const created = await svc.addReceptionist('c-1', {
      name: 'R',
      email: 'r@x.com',
    } as any);

    // Capture the original hash for comparison.
    const before = [...prisma._users.values()][0].passwordHash;

    // Add update support to the fake prisma.
    (prisma as any).user.update = jest.fn(async ({ where, data }: any) => {
      const u = prisma._users.get(where.id);
      if (!u) throw new Error('not found');
      if (data.passwordHash) u.passwordHash = data.passwordHash;
      return u;
    });

    const out = await svc.resetStaffPassword('c-1', created.user.id);

    expect(out.tempPassword).toMatch(/^\d{6}$/);
    expect(out.tempPassword).not.toBe(before);
    const after = [...prisma._users.values()][0].passwordHash;
    expect(after).not.toBe(before);
    expect(after).toMatch(/^\$argon2/);
  });

  it('refuses to reset a user from a different clinic', async () => {
    const { svc, prisma } = makeService();
    // Allow second clinic
    (prisma as any).clinic.findUnique = jest.fn(async ({ where }: any) =>
      where.id === 'c-1' || where.id === 'c-2'
        ? { id: where.id, name: where.id }
        : null,
    );
    const created = await svc.addReceptionist('c-1', {
      name: 'R',
      email: 'r@x.com',
    } as any);

    await expect(svc.resetStaffPassword('c-2', created.user.id)).rejects.toThrow(
      /does not belong/i,
    );
  });

  it('refuses to reset for patient role', async () => {
    const { svc, prisma } = makeService();
    // Seed a PATIENT user manually.
    prisma._users.set('p-1', {
      id: 'p-1',
      name: 'P',
      email: null,
      phone: '+919876543210',
      role: 'PATIENT',
      passwordHash: null,
      clinicId: 'c-1',
    });

    await expect(svc.resetStaffPassword('c-1', 'p-1')).rejects.toThrow(
      /clinic staff/i,
    );
  });

  it('NotFoundException when the user does not exist', async () => {
    const { svc } = makeService();
    await expect(svc.resetStaffPassword('c-1', 'absent')).rejects.toThrow(/User not found/i);
  });

  it('NotFoundException when the clinic does not exist', async () => {
    const { svc } = makeService();
    await expect(svc.resetStaffPassword('absent', 'u-1')).rejects.toThrow(/Clinic not found/i);
  });
});

describe('ClinicsService.getOverviewStats', () => {
  it('returns aggregate counts and per-clinic breakdown', async () => {
    const { svc, prisma } = makeService();

    // Add clinic.count + doctor.count + per-clinic helpers to the fake.
    (prisma as any).clinic.count = jest.fn(async () => 1);
    (prisma as any).doctor.count = jest.fn(async () => 2);
    (prisma as any).user.count = jest.fn(async ({ where }: any) => {
      if (where?.role && typeof where.role === 'object' && 'in' in where.role) return 3;
      if (where?.role === 'RECEPTIONIST') return 3;
      if (where?.role === 'PATIENT') return 50;
      return 0;
    });
    (prisma as any).clinic.findMany = jest.fn(async () => [
      {
        id: 'c-1',
        name: 'Clinic One',
        _count: { doctors: 2 },
        users: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }],
      },
    ]);

    const stats = await svc.getOverviewStats();
    expect(stats.totals).toEqual({ clinics: 1, doctors: 2, receptionists: 3, patients: 50 });
    expect(stats.perClinic).toEqual([
      { id: 'c-1', name: 'Clinic One', doctors: 2, receptionists: 3 },
    ]);
  });
});

describe('ClinicsService.listReceptionistsInClinic', () => {
  it('returns only receptionists, not doctors', async () => {
    const { svc } = makeService();
    await svc.addDoctor('c-1', {
      name: 'Doc',
      email: 'doc@x.com',
      departmentId: 'dept-1',
    } as any);
    await svc.addReceptionist('c-1', {
      name: 'Rep',
      email: 'rep@x.com',
    } as any);

    const out = await svc.listReceptionistsInClinic('c-1');
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Rep');
  });

  it('throws NotFoundException for missing clinic', async () => {
    const { svc } = makeService();
    await expect(svc.listReceptionistsInClinic('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ClinicsService.listDoctorsInClinic', () => {
  it('returns doctors filtered to that clinic only', async () => {
    const { svc, prisma } = makeService();
    // Add a second clinic.
    (prisma as any).clinic.findUnique = jest.fn(async ({ where }: any) => {
      const map = new Map([
        ['c-1', { id: 'c-1', name: 'One' }],
        ['c-2', { id: 'c-2', name: 'Two' }],
      ]);
      return map.get(where.id) ?? null;
    });

    await svc.addDoctor('c-1', {
      name: 'A',
      email: 'a@x.com',
      departmentId: 'dept-1',
    } as any);
    await svc.addDoctor('c-2', {
      name: 'B',
      email: 'b@x.com',
      departmentId: 'dept-1',
    } as any);

    const c1Doctors = await svc.listDoctorsInClinic('c-1');
    expect(c1Doctors).toHaveLength(1);
    expect(c1Doctors[0].user?.name).toBe('A');
  });

  it('throws NotFoundException for missing clinic', async () => {
    const { svc } = makeService();
    await expect(svc.listDoctorsInClinic('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ClinicsService staff location rules', () => {
  it('creates a business admin without any active branch', async () => {
    const { svc, prisma } = makeService();
    prisma.location.findFirst = jest.fn(async () => null) as any;
    prisma.location.findMany = jest.fn(async () => []) as any;

    const out = await svc.addClinicAdmin('c-1', {
      name: 'Owner',
      email: 'owner@x.com',
    } as any);

    expect(out.user.role).toBe('CLINIC_ADMIN');
    expect(out.tempPassword).toMatch(/^\d{6}$/);
  });

  it('requires an active branch before adding a receptionist', async () => {
    const { svc, prisma } = makeService();
    prisma.location.findFirst = jest.fn(async () => null) as any;

    await expect(
      svc.addReceptionist('c-1', { name: 'Rep', email: 'rep@x.com' } as any),
    ).rejects.toThrow(/no active locations/i);
  });

  it('requires an active branch before adding a branch manager', async () => {
    const { svc, prisma } = makeService();
    prisma.location.findFirst = jest.fn(async () => null) as any;

    await expect(
      svc.addManager('c-1', { name: 'Mgr', email: 'mgr@x.com' } as any),
    ).rejects.toThrow(/no active locations/i);
  });
});
