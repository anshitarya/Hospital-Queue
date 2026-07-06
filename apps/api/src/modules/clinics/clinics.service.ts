import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DoctorStatus, EntryStatus, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { AddDoctorDto } from './dto/add-doctor.dto';
import { AddReceptionistDto } from './dto/add-receptionist.dto';

@Injectable()
export class ClinicsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Admin ──────────────────────────────────────────────────────────────────

  async listAll() {
    const clinics = await this.prisma.clinic.findMany({
      orderBy: { name: 'asc' },
      include: {
        inviteCodes: { where: { usedById: null, expiresAt: { gt: new Date() } } },
        doctors: { select: { id: true } },
      },
    });

    // Filtered counts — count receptionists separately so doctors (who also have
    // clinicId) aren't lumped into the receptionist tally.
    const ids = clinics.map((c) => c.id);
    const receptionistCounts = ids.length
      ? await this.prisma.user.groupBy({
          by: ['clinicId'],
          where: { clinicId: { in: ids }, role: Role.RECEPTIONIST },
          _count: { _all: true },
        })
      : [];
    const byClinic = new Map(receptionistCounts.map((r) => [r.clinicId, r._count._all]));

    return clinics.map((c) => ({
      ...c,
      _count: {
        users: byClinic.get(c.id) ?? 0,
        doctors: c.doctors.length,
      },
      doctors: undefined,
    }));
  }

  create(dto: CreateClinicDto) {
    return this.prisma.clinic.create({ data: dto });
  }

  /**
   * Cross-org stats for the admin landing page. Single roundtrip — five
   * cheap aggregate queries fanned out in parallel.
   *
   * Returned shape:
   *   {
   *     totals: { clinics, doctors, receptionists, patients },
   *     perClinic: [ { id, name, doctors, receptionists } ]
   *   }
   */
  async getOverviewStats() {
    const [clinicCount, doctorCount, receptionistCount, patientCount, clinics] =
      await Promise.all([
        this.prisma.clinic.count(),
        this.prisma.doctor.count(),
        this.prisma.user.count({ where: { role: Role.RECEPTIONIST } }),
        this.prisma.user.count({ where: { role: Role.PATIENT } }),
        this.prisma.clinic.findMany({
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            _count: { select: { doctors: true } },
            users: {
              where: { role: Role.RECEPTIONIST },
              select: { id: true },
            },
          },
        }),
      ]);

    return {
      totals: {
        clinics: clinicCount,
        doctors: doctorCount,
        receptionists: receptionistCount,
        patients: patientCount,
      },
      perClinic: clinics.map((c) => ({
        id: c.id,
        name: c.name,
        doctors: c._count.doctors,
        receptionists: c.users.length,
      })),
    };
  }

  async generateInviteCode(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) throw new NotFoundException('Clinic not found');

    const raw = randomBytes(4).toString('hex').toUpperCase();
    const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    return this.prisma.inviteCode.create({ data: { code, clinicId, expiresAt } });
  }

  async listInviteCodes(clinicId: string) {
    return this.prisma.inviteCode.findMany({
      where: { clinicId },
      include: { usedBy: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Admin-side listing. Same as `getMyClinic().doctors` but returns just the
   * doctor records (no other clinic metadata) so the admin UI can show them
   * inline under each clinic without an extra round-trip.
   */
  async listDoctorsInClinic(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) throw new NotFoundException('Clinic not found');
    return this.prisma.doctor.findMany({
      where: { clinicId },
      include: { user: { select: { id: true, name: true, email: true, phone: true } }, department: true },
      orderBy: { user: { name: 'asc' } },
    });
  }

  // ── Receptionist / Doctor ──────────────────────────────────────────────────

  async getMyClinic(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      include: {
        doctors: {
          include: { user: true, department: true },
          orderBy: { user: { name: 'asc' } },
        },
      },
    });
    if (!clinic) throw new NotFoundException('Clinic not found');
    return clinic;
  }

  /**
   * Creates a doctor user + doctor record in a single transaction.
   *
   * The caller (reception or admin) MUST supply at least one of email/phone
   * — without an identifier the doctor literally cannot sign in. We reject
   * up-front rather than silently creating a dead-end account.
   *
   * Uniqueness is checked on BOTH email and phone independently. If either
   * is already taken by another user (regardless of role), we throw — phone/
   * email are global identifiers across the whole system.
   *
   * Returns the doctor PLUS the plaintext temp password. This is the ONLY
   * place the plaintext leaves memory — the receptionist/admin UI must
   * surface it to the user immediately and they have to write it down or
   * copy it. We never log it.
   */
  async addDoctor(clinicId: string, dto: AddDoctorDto) {
    // Shared pre-flight: identifier required, clinic exists, identifiers unique,
    // temp password generated. Centralising means addDoctor and addReceptionist
    // can't drift apart.
    const { passwordHash, tempPassword } = await this.prepareStaffCreation(
      clinicId,
      { email: dto.email, phone: dto.phone, role: 'doctor' },
    );

    // Department check is doctor-specific.
    const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
    if (!dept) throw new NotFoundException('Department not found');

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          role: Role.DOCTOR,
          passwordHash,
          clinicId,
        },
      });
      const doctor = await tx.doctor.create({
        data: {
          userId: user.id,
          departmentId: dto.departmentId,
          clinicId,
          avgConsultMinutes: dto.avgConsultMinutes ?? 7,
          status: DoctorStatus.AVAILABLE,
        },
        include: { user: true, department: true },
      });
      return { doctor, tempPassword };
    });
  }

  /**
   * Direct receptionist creation (admin-only — see clinics.controller).
   *
   * Mirrors `addDoctor` but with no department / avg-consult fields. Returns
   * the new user PLUS the plaintext temp password — the only chance the caller
   * has to capture it, since we immediately hash it with argon2.
   */
  async addReceptionist(clinicId: string, dto: AddReceptionistDto) {
    const { passwordHash, tempPassword } = await this.prepareStaffCreation(
      clinicId,
      { email: dto.email, phone: dto.phone, role: 'receptionist' },
    );

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        role: Role.RECEPTIONIST,
        passwordHash,
        clinicId,
      },
      select: { id: true, name: true, email: true, phone: true, role: true, clinicId: true },
    });

    // The shape of the return value matches `addDoctor` deliberately — the
    // frontend's DoctorCredentialsModal accepts both via the same prop type.
    return { user, tempPassword };
  }

  /**
   * Resets a staff member's password to a new random temp value.
   *
   * Why this exists: storing the actual password in plaintext (or recoverably
   * encrypted) is a hard no — it's an OWASP A02:2021 violation, fails every
   * pen-test, and ends a HIPAA audit immediately. argon2 hashes are
   * one-way by design.
   *
   * What the admin actually NEEDS is the ability to re-issue credentials on
   * demand, which is what this method does:
   *   1. Generates a fresh 16-hex-char temp password.
   *   2. argon2-hashes it and overwrites `passwordHash`.
   *   3. Returns the plaintext exactly once so the caller's UI can surface
   *      it through the existing credentials modal.
   *
   * Authorization:
   *   - Only ADMIN may call this (controller-enforced).
   *   - The user being reset MUST belong to the target clinic AND be one of
   *     DOCTOR / RECEPTIONIST. Patients are excluded — they use OTP and
   *     don't have admin-resettable passwords.
   */
  async resetStaffPassword(clinicId: string, userId: string) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) throw new NotFoundException('Clinic not found');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true, role: true, clinicId: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.clinicId !== clinicId) {
      // Even ADMIN can't accidentally reset a user in the wrong clinic — the
      // caller has to send the matching clinicId on purpose.
      throw new ForbiddenException('User does not belong to this clinic');
    }
    if (user.role !== Role.DOCTOR && user.role !== Role.RECEPTIONIST) {
      throw new BadRequestException('Only doctor or receptionist passwords can be reset here');
    }

    const tempPassword = randomBytes(8).toString('hex');
    const passwordHash = await argon2.hash(tempPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { user, tempPassword };
  }

  /**
   * Returns the receptionists assigned to a clinic. Used by the admin UI to
   * show who's already onboarded vs needing an invite code.
   */
  async listReceptionistsInClinic(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) throw new NotFoundException('Clinic not found');
    return this.prisma.user.findMany({
      where: { clinicId, role: Role.RECEPTIONIST },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Shared pre-flight for both doctor and receptionist creation.
   *
   *  - At-least-one identifier (email or phone) must be present.
   *  - The clinic must exist.
   *  - Email + phone must each be unique across the whole User table.
   *  - Generates a 16-hex-char temp password (~64 bits) and argon2-hashes it.
   *
   * Returns `{ passwordHash, tempPassword }` so the caller's transaction can
   * use the hash and the controller response can echo the plaintext exactly
   * once. The plaintext NEVER leaves this method any other way — no logs.
   */
  private async prepareStaffCreation(
    clinicId: string,
    opts: { email?: string; phone?: string; role: 'doctor' | 'receptionist' },
  ) {
    if (!opts.email && !opts.phone) {
      throw new BadRequestException(
        `Provide either an email or a mobile number so the ${opts.role} can sign in.`,
      );
    }

    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) throw new NotFoundException('Clinic not found');

    if (opts.email) {
      const taken = await this.prisma.user.findUnique({ where: { email: opts.email } });
      if (taken) throw new BadRequestException('That email is already registered');
    }
    if (opts.phone) {
      const taken = await this.prisma.user.findUnique({ where: { phone: opts.phone } });
      if (taken) throw new BadRequestException('That mobile number is already registered');
    }

    const tempPassword = randomBytes(8).toString('hex');
    const passwordHash = await argon2.hash(tempPassword);
    return { passwordHash, tempPassword };
  }

  async removeDoctor(clinicId: string, doctorId: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    if (doctor.clinicId !== clinicId) throw new ForbiddenException('Doctor not in your clinic');
    await this.prisma.doctor.delete({ where: { id: doctorId } });
    return { deleted: true };
  }

  async listDepartments() {
    return this.prisma.department.findMany({ orderBy: { name: 'asc' } });
  }

  /**
   * Clinic-level dashboard stats: today's totals, per-doctor queue state,
   * and 7-day traffic. Used by the clinic admin portal.
   */
  async getClinicDashboard(clinicId: string) {
    const serviceDay = todayServiceDay();

    const [clinic, doctors] = await Promise.all([
      this.prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, name: true, address: true },
      }),
      this.prisma.doctor.findMany({
        where: { clinicId },
        include: { user: { select: { name: true } }, department: { select: { name: true } } },
        orderBy: { user: { name: 'asc' } },
      }),
    ]);

    if (!clinic) throw new NotFoundException('Clinic not found');

    const doctorIds = doctors.map((d) => d.id);

    const [todayStats, doctorQueues, weeklyEntries] = doctorIds.length
      ? await Promise.all([
          this.prisma.queueEntry.groupBy({
            by: ['status'],
            where: { doctorId: { in: doctorIds }, serviceDay },
            _count: { _all: true },
          }),
          this.prisma.queueEntry.groupBy({
            by: ['doctorId', 'status'],
            where: { doctorId: { in: doctorIds }, serviceDay },
            _count: { _all: true },
          }),
          this.prisma.queueEntry.groupBy({
            by: ['serviceDay'],
            where: {
              doctorId: { in: doctorIds },
              serviceDay: { gte: last7DaysStart() },
              status: { in: [EntryStatus.COMPLETED, EntryStatus.SKIPPED, EntryStatus.CANCELLED] },
            },
            _count: { _all: true },
          }),
        ])
      : [[], [], []];

    // Aggregate today's clinic-wide stats
    const today = { waiting: 0, inConsultation: 0, completed: 0, skipped: 0, cancelled: 0 };
    for (const row of todayStats) {
      if (row.status === EntryStatus.WAITING) today.waiting = row._count._all;
      else if (row.status === EntryStatus.IN_CONSULTATION) today.inConsultation = row._count._all;
      else if (row.status === EntryStatus.COMPLETED) today.completed = row._count._all;
      else if (row.status === EntryStatus.SKIPPED) today.skipped = row._count._all;
      else if (row.status === EntryStatus.CANCELLED) today.cancelled = row._count._all;
    }

    // Per-doctor queue snapshot
    type CountMap = Record<string, number>;
    const dqMap = new Map<string, CountMap>();
    for (const row of doctorQueues) {
      if (!dqMap.has(row.doctorId)) dqMap.set(row.doctorId, {});
      dqMap.get(row.doctorId)![row.status] = row._count._all;
    }

    const doctorList = doctors.map((d) => ({
      id: d.id,
      name: d.user.name,
      department: d.department?.name ?? '—',
      status: d.status,
      waiting: dqMap.get(d.id)?.[EntryStatus.WAITING] ?? 0,
      inConsultation: dqMap.get(d.id)?.[EntryStatus.IN_CONSULTATION] ?? 0,
      completed: dqMap.get(d.id)?.[EntryStatus.COMPLETED] ?? 0,
    }));

    // Last-7-days traffic
    const weekMap = new Map(weeklyEntries.map((e) => [e.serviceDay, e._count._all]));
    const weeklyTraffic = getLast7Days().map((date) => ({
      date,
      label: new Date(date + 'T12:00:00').toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
      count: weekMap.get(date) ?? 0,
    }));

    return { clinic, today, doctors: doctorList, weeklyTraffic };
  }

  // ── Admin clinic management ────────────────────────────────────────────────

  async updateClinic(clinicId: string, dto: { name?: string; address?: string }) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) throw new NotFoundException('Clinic not found');
    return this.prisma.clinic.update({
      where: { id: clinicId },
      data: { ...(dto.name ? { name: dto.name } : {}), ...(dto.address !== undefined ? { address: dto.address } : {}) },
    });
  }

  async deleteClinic(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      include: { doctors: { select: { id: true } } },
    });
    if (!clinic) throw new NotFoundException('Clinic not found');

    // Delete in dependency order to avoid FK constraint errors.
    const doctorIds = clinic.doctors.map((d) => d.id);
    if (doctorIds.length > 0) {
      await this.prisma.queueEvent.deleteMany({ where: { doctorId: { in: doctorIds } } });
      await this.prisma.queueEntry.deleteMany({ where: { doctorId: { in: doctorIds } } });
      await this.prisma.doctor.deleteMany({ where: { clinicId } });
    }
    // Null out users (receptionists) linked to this clinic instead of deleting
    // them — they may have queue entries as patients.
    await this.prisma.user.updateMany({ where: { clinicId }, data: { clinicId: null } });
    // InviteCodes cascade via schema FK.
    await this.prisma.clinic.delete({ where: { id: clinicId } });
    return { deleted: true };
  }

  async adminDeleteDoctor(clinicId: string, doctorId: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    if (doctor.clinicId !== clinicId) throw new ForbiddenException('Doctor not in this clinic');
    const serviceDay = new Date().toISOString().slice(0, 10);
    await this.prisma.queueEvent.deleteMany({ where: { doctorId } });
    await this.prisma.queueEntry.deleteMany({ where: { doctorId, serviceDay, status: { in: ['WAITING'] } } });
    await this.prisma.doctor.delete({ where: { id: doctorId } });
    return { deleted: true };
  }

  async adminDeleteReceptionist(clinicId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.clinicId !== clinicId) throw new ForbiddenException('User not in this clinic');
    if (user.role !== Role.RECEPTIONIST) throw new BadRequestException('User is not a receptionist');
    // Null out clinic link rather than deleting — preserves patient queue history.
    await this.prisma.user.update({ where: { id: userId }, data: { clinicId: null } });
    return { deleted: true };
  }

  async updateStaffEmail(clinicId: string, userId: string, email: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.clinicId !== clinicId) throw new ForbiddenException('User not in this clinic');
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== userId) throw new BadRequestException('Email already in use');
    return this.prisma.user.update({ where: { id: userId }, data: { email } });
  }
}

function todayServiceDay(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function last7DaysStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

function getLast7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}
