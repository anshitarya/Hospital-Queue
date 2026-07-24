import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DoctorStatus, EntryStatus, Prisma, Role, StaffStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CustomerService } from '../patients/customer.service';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { UsageEventService } from '../billing/usage-event.service';
import { AddDoctorDto } from './dto/add-doctor.dto';
import { defaultWeeklyShifts, normalizeShiftInput } from '../../common/utils/default-schedule';
import { AddReceptionistDto } from './dto/add-receptionist.dto';
import { SetReceptionistAssignmentsDto } from './dto/set-receptionist-assignments.dto';
import {
  addServiceDays,
  formatHourLabel,
  istHour,
  monthRangeStart,
  recentMonthKeys,
  recentServiceDays,
  serviceDay,
  serviceDaysAgo,
} from '../../common/utils/timezone';
import { CLINIC_PORTAL_ROLES, isClinicPortalRole } from '../../common/constants/clinic-portal-roles';
import { normalizeBusinessType } from '../../common/utils/business-type';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { FEATURES } from '../../common/features';

@Injectable()
export class ClinicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomerService,
    private readonly usageEvents: UsageEventService,
  ) {}

  // ── Admin ──────────────────────────────────────────────────────────────────

  async listAll() {
    const clinics = await this.prisma.clinic.findMany({
      orderBy: { name: 'asc' },
      include: {
        locations: {
          include: {
            inviteCodes: { where: { usedById: null, expiresAt: { gt: new Date() } } },
            doctors: { select: { doctorId: true } },
          }
        },
      },
    });

    const ids = clinics.map((c) => c.id);
    const receptionistCounts = ids.length
      ? await this.prisma.user.groupBy({
          by: ['clinicId'],
          where: { clinicId: { in: ids }, role: { in: CLINIC_PORTAL_ROLES } },
          _count: { _all: true },
        })
      : [];
    const byClinic = new Map(receptionistCounts.map((r) => [r.clinicId, r._count._all]));

    return clinics.map((c) => {
      const allInviteCodes = c.locations.flatMap(l => l.inviteCodes);
      const doctorsCount = new Set(c.locations.flatMap(l => l.doctors.map(d => d.doctorId))).size;
      return {
        ...c,
        inviteCodes: allInviteCodes,
        _count: {
          users: byClinic.get(c.id) ?? 0,
          doctors: doctorsCount,
        },
        locations: c.locations,
      };
    });
  }

  /**
   * Public endpoint — returns locations where self-booking is allowed.
   * Results can be filtered by a free-text `search` (matches clinic/location name or doctor name).
   * Each result includes doctor list with queue depth for today.
   */
  async listPublicBusinesses(search?: string) {
    const today = serviceDay();

    const clinics = await this.prisma.clinic.findMany({
      where: {
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                {
                  locations: {
                    some: {
                      OR: [
                        { name: { contains: search, mode: 'insensitive' as const } },
                        {
                          doctors: {
                            some: { doctor: { user: { name: { contains: search, mode: 'insensitive' as const } } } },
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
        locations: {
          some: {
            status: 'ACTIVE',
          },
        },
      },
      include: {
        locations: {
          where: {
            status: 'ACTIVE',
          },
          include: {
            businessSetting: true,
            doctors: {
              include: {
                doctor: {
                  include: {
                    user: { select: { id: true, name: true } },
                    department: { select: { id: true, name: true } },
                    entries: {
                      where: {
                        serviceDay: today,
                        status: { in: ['WAITING', 'IN_CONSULTATION'] },
                      },
                      select: { id: true, status: true, appointmentTime: true, locationId: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return clinics.map((c) => ({
      id: c.id,
      name: c.name,
      businessType: c.businessType,
      locations: c.locations.map((loc) => ({
        id: loc.id,
        name: loc.name,
        address: `${loc.address}, ${loc.city}, ${loc.state}`,
        contactNumber: loc.contactNumber,
        bookingContactNumber: loc.bookingContactNumber,
        settings: loc.businessSetting,
        doctors: loc.doctors.map((dl) => {
          const d = dl.doctor;
          const locEntries = d.entries.filter((e) => e.locationId === loc.id);
          return {
            id: d.id,
            name: d.user.name,
            specialization: d.specialization,
            department: d.department?.name,
            status: d.status,
            avgConsultMinutes: d.avgConsultMinutes,
            queueLength: locEntries.filter((e) => e.status === 'WAITING').length,
            inConsultation: locEntries.some((e) => e.status === 'IN_CONSULTATION'),
          };
        }),
      })),
    }));
  }

  async create(dto: CreateClinicDto) {
    const clinic = await this.prisma.clinic.create({ data: dto });

    // Automatically link business to default standard plan
    try {
      let plan = await this.prisma.billingPlan.findFirst({
        where: { name: 'Standard Plan' },
      });

      if (!plan) {
        plan = await this.prisma.billingPlan.create({
          data: {
            name: 'Standard Plan',
            description: 'Standard per-completed token pricing plan',
            billingCycle: 'MONTHLY',
            status: 'ACTIVE',
            rules: {
              create: [
                {
                  eventType: 'TOKEN_COMPLETED',
                  price: new Prisma.Decimal(5.00),
                  ruleType: 'PER_EVENT',
                },
              ],
            },
          },
        });
      }

      const now = new Date();
      const end = new Date();
      end.setMonth(now.getMonth() + 1);

      await this.prisma.businessBilling.create({
        data: {
          businessId: clinic.id,
          planId: plan.id,
          billingCycleStart: now,
          billingCycleEnd: end,
          status: 'ACTIVE',
          outstandingAmount: new Prisma.Decimal(0.00),
        },
      });

      // Log BUSINESS_CREATED telemetry event
      void this.usageEvents.triggerEvent('BUSINESS_CREATED', {
        businessId: clinic.id,
        locationId: 'SYSTEM',
        referenceId: `${clinic.id}_CREATED`,
        metadata: { name: clinic.name, businessType: clinic.businessType },
      });
    } catch (e) {
      // Safe fallback: Log error but return created clinic
      console.error('Failed to link default billing plan or log business creation event', e);
    }

    return clinic;
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
        this.prisma.user.count({ where: { role: { in: CLINIC_PORTAL_ROLES } } }),
        this.prisma.user.count({ where: { role: Role.PATIENT } }),
        this.prisma.clinic.findMany({
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            _count: { select: { doctors: true } },
            users: {
              where: { role: { in: CLINIC_PORTAL_ROLES } },
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

  async generateInviteCode(locationId: string) {
    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location) throw new NotFoundException('Location not found');

    const raw = randomBytes(4).toString('hex').toUpperCase();
    const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    return this.prisma.inviteCode.create({ data: { code, locationId, expiresAt } });
  }

  async listInviteCodes(locationId: string) {
    return this.prisma.inviteCode.findMany({
      where: { locationId },
      include: { usedBy: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Admin-side listing. Same as `getMyClinic().doctors` but returns just the
   * doctor records (no other clinic metadata) so the admin UI can show them
   * inline under each clinic without an extra round-trip.
   */
  async listDoctorsInClinic(clinicId: string, caller?: AuthUser, locationId?: string) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) throw new NotFoundException('Clinic not found');
    await this.backfillStaffLocationLinks(clinicId);

    const doctors = await this.prisma.doctor.findMany({
      where: { clinicId },
      include: { user: { select: { id: true, name: true, email: true, phone: true, status: true, loginId: true } }, department: true },
      orderBy: { user: { name: 'asc' } },
    });
    if (caller && caller.role === Role.RECEPTIONIST && locationId) {
      const scope = await this.getAssignedDoctorIds(caller.id, locationId);
      return doctors.filter((d) => scope.includes(d.id));
    } else if (caller && caller.role === Role.RECEPTIONIST) {
      const userLocs = await this.prisma.userLocation.findMany({
        where: { userId: caller.id },
        select: { locationId: true },
      });
      const locIds = userLocs.map((l) => l.locationId);
      if (locIds.length === 0) return [];
      const assignments = await this.prisma.receptionistAssignment.findMany({
        where: { receptionistId: caller.id, locationId: { in: locIds } },
        select: { doctorId: true },
      });
      const docIds = [...new Set(assignments.map((a) => a.doctorId))];
      return doctors.filter((d) => docIds.includes(d.id));
    }
    return doctors;
  }
  async getDefaultLocationForUser(userId: string): Promise<string> {
    const userLoc = await this.prisma.userLocation.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { locationId: true },
    });
    if (userLoc) return userLoc.locationId;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { clinicId: true },
    });
    if (user?.clinicId) {
      let firstLoc = await this.prisma.location.findFirst({
        where: { clinicId: user.clinicId, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!firstLoc) {
        const clinic = await this.prisma.clinic.findUnique({ where: { id: user.clinicId } });
        if (clinic) {
          const created = await this.prisma.location.create({
            data: {
              clinicId: clinic.id,
              name: 'Demo Branch',
              address: 'Demo branch (You can rename or delete this branch and set up your own)',
              city: 'Bengaluru',
              state: 'Karnataka',
              country: 'India',
              postalCode: '560001',
              contactNumber: '+919999999999',
              status: 'ACTIVE',
            },
          });
          firstLoc = { id: created.id };
        }
      }
      if (firstLoc) {
        await this.prisma.userLocation.upsert({
          where: { userId_locationId: { userId, locationId: firstLoc.id } },
          update: {},
          create: { userId, locationId: firstLoc.id },
        }).catch(() => null);
        return firstLoc.id;
      }
    }
    throw new BadRequestException('User has no assigned locations');
  }


  /** Ensures legacy staff created before multi-location have branch links. */
  async backfillStaffLocationLinks(clinicId: string): Promise<void> {
    const locations = await this.prisma.location.findMany({
      where: { clinicId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (locations.length === 0) return;
    const primaryLocId = locations[0].id;

    const [staff, doctors] = await Promise.all([
      this.prisma.user.findMany({
        where: { clinicId, role: { in: [Role.RECEPTIONIST, Role.CLINIC_ADMIN, Role.MANAGER] } },
        select: { id: true, locations: { select: { locationId: true } } },
      }),
      this.prisma.doctor.findMany({
        where: { clinicId },
        select: { id: true, locations: { select: { locationId: true } } },
      }),
    ]);

    const userLinks = staff
      .filter((u) => !(u.locations?.length))
      .map((u) => ({ userId: u.id, locationId: primaryLocId }));
    if (userLinks.length > 0) {
      await this.prisma.userLocation.createMany({ data: userLinks, skipDuplicates: true });
    }

    const doctorLinks = doctors
      .filter((d) => !(d.locations?.length))
      .map((d) => ({ doctorId: d.id, locationId: primaryLocId }));
    if (doctorLinks.length > 0) {
      await this.prisma.doctorLocation.createMany({ data: doctorLinks, skipDuplicates: true });
    }
  }

  /** Doctors work clinic-wide — default to every active branch unless explicitly scoped. */
  private async resolveDoctorLocationIds(
    clinicId: string,
    locationId?: string,
    locationIds?: string[],
  ): Promise<string[]> {
    if (locationIds?.length || locationId) {
      return this.resolveStaffLocationIds(clinicId, locationId, locationIds);
    }
    const locations = await this.prisma.location.findMany({
      where: { clinicId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!locations.length) {
      throw new BadRequestException('Clinic has no active locations. Add a branch first.');
    }
    return locations.map((l) => l.id);
  }

  private async resolveStaffLocationIds(
    clinicId: string,
    locationId?: string,
    locationIds?: string[],
    opts?: { requireActive?: boolean },
  ): Promise<string[]> {
    const requireActive = opts?.requireActive !== false;
    if (locationIds) {
      if (locationIds.length === 0) return [];
      const valid = await this.prisma.location.findMany({
        where: { clinicId, status: 'ACTIVE', id: { in: locationIds } },
        select: { id: true },
      });
      if (valid.length !== locationIds.length) {
        throw new BadRequestException('One or more locations are invalid for this clinic');
      }
      return valid.map((l) => l.id);
    }
    if (locationId) {
      const loc = await this.prisma.location.findFirst({
        where: { id: locationId, clinicId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!loc) throw new BadRequestException('Invalid or inactive location for this clinic');
      return [loc.id];
    }
    const first = await this.prisma.location.findFirst({
      where: { clinicId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!first) {
      if (!requireActive) return [];
      throw new BadRequestException('Clinic has no active locations. Add a branch first.');
    }
    return [first.id];
  }

  /** Branch managers and receptionists must belong to the location; business admins see all branches. */
  async assertCallerManagesLocation(caller: AuthUser, locationId: string): Promise<void> {
    if (caller.role === Role.ADMIN) return;
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, clinicId: caller.clinicId ?? undefined },
    });
    if (!location) throw new ForbiddenException('Branch not found in your business');
    if (caller.role === Role.CLINIC_ADMIN) return;
    if (caller.role === Role.MANAGER || caller.role === Role.RECEPTIONIST) {
      const assigned = await this.prisma.userLocation.findFirst({
        where: { userId: caller.id, locationId },
      });
      if (!assigned) throw new ForbiddenException('You are not assigned to this branch');
      return;
    }
    throw new ForbiddenException('Not authorized for this branch');
  }

  /** Doctors this receptionist may manage at a branch. Empty = none assigned. */
  async getAssignedDoctorIds(receptionistId: string, locationId: string): Promise<string[]> {
    const rows = await this.prisma.receptionistAssignment.findMany({
      where: { receptionistId, locationId },
      select: { doctorId: true },
    });
    return rows.map((r) => r.doctorId);
  }

  /** Restricts receptionists to assigned doctors; clinic admins and platform admins see all. */
  private async resolveScopedDoctorIds(caller: AuthUser | undefined, locationId: string): Promise<string[] | null> {
    if (!caller || caller.role !== Role.RECEPTIONIST) return null;
    return this.getAssignedDoctorIds(caller.id, locationId);
  }

  private filterIdsByScope(ids: string[], scope: string[] | null): string[] {
    if (scope === null) return ids;
    return ids.filter((id) => scope.includes(id));
  }

  async assertCallerCanAccessDoctor(caller: AuthUser, doctorId: string): Promise<void> {
    if (!caller.clinicId) return;
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      select: { clinicId: true, locations: { select: { locationId: true } } },
    });
    if (!doctor || doctor.clinicId !== caller.clinicId) {
      throw new ForbiddenException('Not authorized: doctor belongs to a different clinic');
    }
    if (caller.role !== Role.RECEPTIONIST) return;
    const userLocs = await this.prisma.userLocation.findMany({
      where: { userId: caller.id },
      select: { locationId: true },
    });
    const locIds = userLocs.map(l => l.locationId);
    if (locIds.length === 0) return;

    const assigned = await this.prisma.receptionistAssignment.findFirst({
      where: {
        receptionistId: caller.id,
        doctorId,
        locationId: { in: locIds },
      },
    });

    if (!assigned) {
      throw new ForbiddenException(
        'You are not assigned to manage this professional at your branch',
      );
    }
  }

  async getReceptionistAssignments(locationId: string) {
    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location) throw new NotFoundException('Location not found');

    await this.backfillStaffLocationLinks(location.clinicId);

    const [receptionists, doctors, assignments] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          clinicId: location.clinicId,
          role: Role.RECEPTIONIST,
          locations: { some: { locationId } },
        },
        select: { id: true, name: true, email: true, phone: true, createdAt: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.doctor.findMany({
        where: {
          clinicId: location.clinicId,
          locations: { some: { locationId } },
        },
        include: { user: { select: { name: true } }, department: { select: { name: true } } },
        orderBy: { user: { name: 'asc' } },
      }),
      this.prisma.receptionistAssignment.findMany({ where: { locationId } }),
    ]);

    const byRecep = new Map<string, string[]>();
    for (const row of assignments) {
      const list = byRecep.get(row.receptionistId) ?? [];
      list.push(row.doctorId);
      byRecep.set(row.receptionistId, list);
    }

    return {
      receptionists: receptionists.map((r) => ({
        ...r,
        doctorIds: byRecep.get(r.id) ?? [],
      })),
      doctors: doctors.map((d) => ({
        id: d.id,
        name: d.user.name,
        department: d.department?.name ?? '—',
      })),
    };
  }

  async setReceptionistAssignments(locationId: string, dto: SetReceptionistAssignmentsDto, caller?: AuthUser) {
    if (caller) await this.assertCallerManagesLocation(caller, locationId);
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      select: { clinicId: true }
    });
    if (!location) throw new NotFoundException('Location not found');
    const clinicId = location.clinicId;

    const receptionistIds = Object.keys(dto.assignments);
    const allDoctorIds = [...new Set(Object.values(dto.assignments).flat())];

    if (receptionistIds.length > 0) {
      const validReceps = await this.prisma.user.count({
        where: {
          id: { in: receptionistIds },
          clinicId,
          role: Role.RECEPTIONIST,
          locations: { some: { locationId } },
        },
      });
      if (validReceps !== receptionistIds.length) {
        throw new BadRequestException('One or more receptionists are not assigned to this branch');
      }
    }

    if (allDoctorIds.length > 0) {
      const validDocs = await this.prisma.doctor.count({
        where: {
          id: { in: allDoctorIds },
          clinicId,
          locations: { some: { locationId } },
        },
      });
      if (validDocs !== allDoctorIds.length) {
        throw new BadRequestException('One or more professionals are not assigned to this branch');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.receptionistAssignment.deleteMany({ where: { locationId } });
      const rows: { locationId: string; receptionistId: string; doctorId: string }[] = [];
      for (const [receptionistId, doctorIds] of Object.entries(dto.assignments)) {
        const unique = [...new Set(doctorIds)];
        for (const doctorId of unique) {
          rows.push({ locationId, receptionistId, doctorId });
        }
      }
      if (rows.length > 0) {
        await tx.receptionistAssignment.createMany({ data: rows });
      }
    });

    return this.getReceptionistAssignments(locationId);
  }

  // ── Receptionist / Doctor ──────────────────────────────────────────────────

  async getMyClinic(clinicId: string, caller?: AuthUser, locationId?: string) {
    await this.backfillStaffLocationLinks(clinicId);

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

    if (locationId) {
      const atBranch = await this.prisma.doctor.findMany({
        where: { clinicId, locations: { some: { locationId } } },
        select: { id: true },
      });
      const branchDoctorIds = new Set(atBranch.map((d) => d.id));
      clinic.doctors = clinic.doctors.filter((d) => branchDoctorIds.has(d.id));
    }

    if (caller && caller.role === Role.RECEPTIONIST && locationId) {
      const scope = await this.getAssignedDoctorIds(caller.id, locationId);
      clinic.doctors = clinic.doctors.filter((d) => scope.includes(d.id));
    } else if (caller && caller.role === Role.RECEPTIONIST) {
      const userLocs = await this.prisma.userLocation.findMany({
        where: { userId: caller.id },
        select: { locationId: true },
      });
      const locIds = userLocs.map((l) => l.locationId);
      if (locIds.length === 0) {
        clinic.doctors = [];
      } else {
        const assignments = await this.prisma.receptionistAssignment.findMany({
          where: { receptionistId: caller.id, locationId: { in: locIds } },
          select: { doctorId: true },
        });
        const docIds = [...new Set(assignments.map((a) => a.doctorId))];
        clinic.doctors = clinic.doctors.filter((d) => docIds.includes(d.id));
      }
    }
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
  async addDoctor(clinicId: string, dto: AddDoctorDto, defaultLocationId?: string) {
    const { passwordHash, tempPassword } = await this.prepareStaffCreation(
      clinicId,
      { email: dto.email, phone: dto.phone, role: 'doctor' },
    );

    const loginId = await this.generateLoginId(dto.name, 'DOCTOR');

    const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
    if (!dept) throw new NotFoundException('Department not found');

    const branchIds = await this.resolveDoctorLocationIds(clinicId, defaultLocationId, dto.locationIds);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          loginId,
          role: Role.DOCTOR,
          passwordHash: passwordHash ?? null,
          clinicId,
          // New staff start as ACTIVE directly
          status: StaffStatus.ACTIVE,
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

      await tx.doctorLocation.createMany({
        data: branchIds.map((locationId) => ({ doctorId: doctor.id, locationId })),
        skipDuplicates: true,
      });

      const shiftRows =
        dto.shifts && dto.shifts.length > 0
          ? normalizeShiftInput(dto.shifts)
          : dto.useDefaultSchedule !== false
            ? defaultWeeklyShifts()
            : [];

      if (shiftRows.length > 0) {
        const scheduleData = branchIds.flatMap((locId) =>
          shiftRows.map((s) => ({
            doctorId: doctor.id,
            locationId: locId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            isHoliday: s.isHoliday ?? false,
          })),
        );
        await tx.professionalSchedule.createMany({ data: scheduleData });
      }

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
  async addReceptionist(clinicId: string, dto: AddReceptionistDto, defaultLocationId?: string) {
    const { passwordHash, tempPassword } = await this.prepareStaffCreation(
      clinicId,
      { email: dto.email, phone: dto.phone, role: 'receptionist' },
    );

    const loginId = await this.generateLoginId(dto.name, 'RECEPTIONIST');

    const branchIds = await this.resolveStaffLocationIds(
      clinicId,
      dto.locationId ?? defaultLocationId,
    );

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        loginId,
        role: Role.RECEPTIONIST,
        passwordHash: passwordHash ?? null,
        clinicId,
        // New staff start as ACTIVE directly
        status: StaffStatus.ACTIVE,
        locations: {
          create: branchIds.map((locationId) => ({ locationId })),
        },
      },
      select: { id: true, name: true, email: true, phone: true, role: true, clinicId: true, loginId: true },
    });

    return { user, tempPassword };
  }

  /**
   * Business admin for a clinic — full reception-portal access for the owner.
   */
  async addClinicAdmin(clinicId: string, dto: AddReceptionistDto, defaultLocationId?: string) {
    const { passwordHash, tempPassword } = await this.prepareStaffCreation(
      clinicId,
      { email: dto.email, phone: dto.phone, role: 'business admin' },
    );

    const loginId = await this.generateLoginId(dto.name, 'CLINIC_ADMIN');

    const explicitLocation = dto.locationId ?? defaultLocationId;
    const branchIds = explicitLocation
      ? await this.resolveStaffLocationIds(clinicId, explicitLocation)
      : [];

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        loginId,
        role: Role.CLINIC_ADMIN,
        passwordHash: passwordHash ?? null,
        clinicId,
        emailVerified: dto.email ? true : undefined,
        // New staff start as ACTIVE directly
        status: StaffStatus.ACTIVE,
        ...(branchIds.length > 0
          ? { locations: { create: branchIds.map((locationId) => ({ locationId })) } }
          : {}),
      },
      select: { id: true, name: true, email: true, phone: true, role: true, clinicId: true, loginId: true },
    });

    return { user, tempPassword };
  }

  async listClinicAdminsInClinic(clinicId: string) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) throw new NotFoundException('Clinic not found');
    return this.prisma.user.findMany({
      where: { clinicId, role: Role.CLINIC_ADMIN },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        loginId: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
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
    if (!isClinicPortalRole(user.role) && user.role !== Role.DOCTOR && user.role !== Role.MANAGER) {
      throw new BadRequestException('Only clinic staff passwords can be reset here');
    }

    const tempPassword = Math.floor(100000 + Math.random() * 900000).toString();
    const passwordHash = await argon2.hash(tempPassword);
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt: new Date() },
      select: { id: true, name: true, email: true, phone: true, role: true, clinicId: true, loginId: true, status: true },
    });

    return { user: updatedUser, tempPassword };
  }

  async addManager(clinicId: string, dto: AddReceptionistDto, defaultLocationId?: string) {
    const { passwordHash, tempPassword } = await this.prepareStaffCreation(
      clinicId,
      { email: dto.email, phone: dto.phone, role: 'manager' },
    );

    const loginId = await this.generateLoginId(dto.name, 'MANAGER');

    const branchIds = await this.resolveStaffLocationIds(
      clinicId,
      dto.locationId ?? defaultLocationId,
    );

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        loginId,
        role: Role.MANAGER,
        passwordHash,
        clinicId,
        emailVerified: dto.email ? true : undefined,
        locations: {
          create: branchIds.map((locationId) => ({ locationId })),
        },
      },
      select: { id: true, name: true, email: true, phone: true, role: true, clinicId: true, loginId: true },
    });

    return { user, tempPassword };
  }

  async listManagersInClinic(clinicId: string, locationId?: string) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) throw new NotFoundException('Clinic not found');
    await this.backfillStaffLocationLinks(clinicId);

    return this.prisma.user.findMany({
      where: {
        clinicId,
        role: Role.MANAGER,
        ...(locationId ? { locations: { some: { locationId } } } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        loginId: true,
        createdAt: true,
        locations: { select: { locationId: true, location: { select: { id: true, name: true } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Returns the receptionists assigned to a clinic. Used by the admin UI to
   * show who's already onboarded vs needing an invite code.
   */
  async listReceptionistsInClinic(clinicId: string, locationId?: string) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) throw new NotFoundException('Clinic not found');
    await this.backfillStaffLocationLinks(clinicId);

    return this.prisma.user.findMany({
      where: {
        clinicId,
        role: Role.RECEPTIONIST,
        ...(locationId ? { locations: { some: { locationId } } } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        loginId: true,
        createdAt: true,
        locations: { select: { locationId: true, location: { select: { id: true, name: true } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  private async cleanupDoctorAtLocation(
    tx: Prisma.TransactionClient,
    doctorId: string,
    locationId: string,
  ) {
    await tx.queueEntry.deleteMany({
      where: {
        doctorId,
        locationId,
        status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
      },
    });
    await tx.receptionistAssignment.deleteMany({
      where: { doctorId, locationId },
    });
    await tx.professionalSchedule.deleteMany({
      where: { doctorId, locationId },
    });
  }

  async addDoctorToLocation(clinicId: string, doctorId: string, locationId: string, caller?: AuthUser) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      include: { locations: { select: { locationId: true } } },
    });
    if (!doctor || doctor.clinicId !== clinicId) {
      throw new NotFoundException('Professional not found in this clinic');
    }

    await this.resolveStaffLocationIds(clinicId, locationId);
    if (caller?.role === Role.MANAGER) {
      await this.assertCallerManagesLocation(caller, locationId);
    }

    if (doctor.locations.some((l) => l.locationId === locationId)) {
      return { doctorId, locationId, locationIds: doctor.locations.map((l) => l.locationId) };
    }

    await this.prisma.doctorLocation.create({
      data: { doctorId, locationId },
    });

    const locationIds = [...doctor.locations.map((l) => l.locationId), locationId];
    return { doctorId, locationId, locationIds };
  }

  async removeDoctorFromLocation(clinicId: string, doctorId: string, locationId: string, caller?: AuthUser) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      include: { locations: { select: { locationId: true } } },
    });
    if (!doctor || doctor.clinicId !== clinicId) {
      throw new NotFoundException('Professional not found in this clinic');
    }
    if (!doctor.locations.some((l) => l.locationId === locationId)) {
      throw new BadRequestException('Professional is not assigned to this branch');
    }

    await this.resolveStaffLocationIds(clinicId, locationId);
    if (caller?.role === Role.MANAGER) {
      await this.assertCallerManagesLocation(caller, locationId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.doctorLocation.deleteMany({ where: { doctorId, locationId } });
      await this.cleanupDoctorAtLocation(tx, doctorId, locationId);
    });

    const locationIds = doctor.locations
      .map((l) => l.locationId)
      .filter((id) => id !== locationId);
    return { doctorId, locationId, locationIds };
  }

  async setDoctorLocations(clinicId: string, doctorId: string, locationIds: string[], caller?: AuthUser) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      include: { locations: { select: { locationId: true } } },
    });
    if (!doctor || doctor.clinicId !== clinicId) {
      throw new NotFoundException('Professional not found in this clinic');
    }

    let finalLocationIds = [...locationIds];

    if (caller && caller.role === Role.MANAGER) {
      const managedLocs = (
        await this.prisma.userLocation.findMany({
          where: { userId: caller.id },
          select: { locationId: true },
        })
      ).map((ul) => ul.locationId);

      const currentLocIds = doctor.locations.map((dl) => dl.locationId);
      const unmanagedLocs = currentLocIds.filter((id) => !managedLocs.includes(id));
      const managedToAddOrKeep = locationIds.filter((id) => managedLocs.includes(id));
      finalLocationIds = [...managedToAddOrKeep, ...unmanagedLocs];
    }

    const validIds = await this.resolveStaffLocationIds(clinicId, undefined, finalLocationIds);
    const currentLocIds = doctor.locations.map((dl) => dl.locationId);
    const removedLocIds = currentLocIds.filter((id) => !validIds.includes(id));

    await this.prisma.$transaction(async (tx) => {
      await tx.doctorLocation.deleteMany({ where: { doctorId } });
      await tx.doctorLocation.createMany({
        data: validIds.map((locationId) => ({ doctorId, locationId })),
      });
      if (removedLocIds.length > 0) {
        for (const locId of removedLocIds) {
          await this.cleanupDoctorAtLocation(tx, doctorId, locId);
        }
      }
    });
    return { doctorId, locationIds: validIds };
  }

  async addStaffToLocation(clinicId: string, userId: string, locationId: string, caller?: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { locations: { select: { locationId: true } } },
    });
    if (!user || user.clinicId !== clinicId) {
      throw new NotFoundException('Staff member not found in this clinic');
    }
    if (user.role !== Role.RECEPTIONIST && user.role !== Role.MANAGER) {
      throw new BadRequestException('Only receptionists and branch managers can be assigned to branches');
    }

    await this.resolveStaffLocationIds(clinicId, locationId);
    if (caller?.role === Role.MANAGER) {
      await this.assertCallerManagesLocation(caller, locationId);
    }

    if (user.locations.some((l) => l.locationId === locationId)) {
      return { userId, locationId, locationIds: user.locations.map((l) => l.locationId) };
    }

    await this.prisma.userLocation.create({
      data: { userId, locationId },
    });

    const locationIds = [...user.locations.map((l) => l.locationId), locationId];
    return { userId, locationId, locationIds };
  }

  async removeStaffFromLocation(clinicId: string, userId: string, locationId: string, caller?: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { locations: { select: { locationId: true } } },
    });
    if (!user || user.clinicId !== clinicId) {
      throw new NotFoundException('Staff member not found in this clinic');
    }
    if (!user.locations.some((l) => l.locationId === locationId)) {
      throw new BadRequestException('Staff member is not assigned to this branch');
    }

    await this.resolveStaffLocationIds(clinicId, locationId);
    if (caller?.role === Role.MANAGER) {
      await this.assertCallerManagesLocation(caller, locationId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userLocation.deleteMany({ where: { userId, locationId } });
      if (user.role === Role.RECEPTIONIST) {
        await tx.receptionistAssignment.deleteMany({ where: { receptionistId: userId, locationId } });
      }
    });

    const locationIds = user.locations
      .map((l) => l.locationId)
      .filter((id) => id !== locationId);
    return { userId, locationId, locationIds };
  }

  async setStaffLocations(clinicId: string, userId: string, locationIds: string[], caller?: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { locations: { select: { locationId: true } } },
    });
    if (!user || user.clinicId !== clinicId) {
      throw new NotFoundException('Staff member not found in this clinic');
    }

    let finalLocationIds = [...locationIds];
    if (caller?.role === Role.MANAGER) {
      const managedLocs = (
        await this.prisma.userLocation.findMany({
          where: { userId: caller.id },
          select: { locationId: true },
        })
      ).map((ul) => ul.locationId);
      const currentLocIds = user.locations.map((l) => l.locationId);
      const unmanagedLocs = currentLocIds.filter((id) => !managedLocs.includes(id));
      const managedToAddOrKeep = locationIds.filter((id) => managedLocs.includes(id));
      finalLocationIds = [...managedToAddOrKeep, ...unmanagedLocs];
    }

    const validIds = await this.resolveStaffLocationIds(clinicId, undefined, finalLocationIds);
    const currentLocIds = user.locations.map((l) => l.locationId);
    const removedLocIds = currentLocIds.filter((id) => !validIds.includes(id));

    await this.prisma.$transaction(async (tx) => {
      await tx.userLocation.deleteMany({ where: { userId } });
      if (validIds.length > 0) {
        await tx.userLocation.createMany({
          data: validIds.map((locationId) => ({ userId, locationId })),
        });
      }
      if (removedLocIds.length > 0 && user.role === Role.RECEPTIONIST) {
        await tx.receptionistAssignment.deleteMany({
          where: { receptionistId: userId, locationId: { in: removedLocIds } },
        });
      }
    });
    return { userId, locationIds: validIds };
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
    opts: { email?: string; phone?: string; role: 'doctor' | 'receptionist' | 'business admin' | 'manager' },
  ) {
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

    // When Google auth is enabled, staff sign in via Google (no password needed).
    // We still generate a temp password so the account can be activated via
    // legacy password login during testing / dev mode.
    if (FEATURES.ENABLE_GOOGLE_AUTH && !FEATURES.ENABLE_DEV_AUTH_BYPASS) {
      // Pure Google mode — no temp password generated
      return { passwordHash: null, tempPassword: null };
    }

    // Generate a simple, easy-to-remember 6-digit numeric password
    const tempPassword = Math.floor(100000 + Math.random() * 900000).toString();
    const passwordHash = await argon2.hash(tempPassword);
    return { passwordHash, tempPassword };
  }

  /**
   * Update the status of a staff member (ACTIVE / DISABLED).
   * Super Admin can activate or disable any staff member.
   * Disabling blocks login immediately — both password and Google.
   */
  async updateStaffStatus(clinicId: string, userId: string, status: 'ACTIVE' | 'DISABLED') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.clinicId !== clinicId) throw new ForbiddenException('User not in this clinic');
    if (user.role === Role.PATIENT || user.role === Role.ADMIN) {
      throw new BadRequestException('Cannot change status of this account type');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: status as StaffStatus,
        passwordChangedAt: new Date(), // Revokes existing JWT sessions immediately
        ...(status === 'ACTIVE' && !user.activatedAt ? { activatedAt: new Date() } : {}),
      },
      select: { id: true, name: true, email: true, role: true, status: true, clinicId: true, loginId: true },
    });

    return updated;
  }

  async removeDoctor(clinicId: string, doctorId: string, caller?: AuthUser) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      include: { locations: { select: { locationId: true } } },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');
    if (doctor.clinicId !== clinicId) throw new ForbiddenException('Doctor not in your clinic');
    if (caller?.role === Role.MANAGER) {
      const managed = await this.prisma.userLocation.findMany({
        where: { userId: caller.id },
        select: { locationId: true },
      });
      const managedIds = new Set(managed.map((m) => m.locationId));
      const atBranch = doctor.locations.some((l) => managedIds.has(l.locationId));
      if (!atBranch) throw new ForbiddenException('Professional is not at your branch');
    }
    const serviceDayKey = serviceDay();
    await this.prisma.queueEvent.deleteMany({ where: { doctorId } });
    await this.prisma.queueEntry.deleteMany({
      where: { doctorId, serviceDay: serviceDayKey, status: EntryStatus.WAITING },
    });
    await this.prisma.doctor.delete({ where: { id: doctorId } });
    return { deleted: true };
  }

  async removeReceptionist(clinicId: string, userId: string, caller?: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { locations: { select: { locationId: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.clinicId !== clinicId) throw new ForbiddenException('User not in your clinic');
    if (user.role !== Role.RECEPTIONIST) {
      throw new BadRequestException('User is not front-desk staff');
    }
    if (caller?.role === Role.MANAGER) {
      const managed = await this.prisma.userLocation.findMany({
        where: { userId: caller.id },
        select: { locationId: true },
      });
      const managedIds = new Set(managed.map((m) => m.locationId));
      const atBranch = user.locations.some((l) => managedIds.has(l.locationId));
      if (!atBranch) throw new ForbiddenException('Staff member is not at your branch');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { clinicId: null } });
    return { deleted: true };
  }

  async removeManager(clinicId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.clinicId !== clinicId) throw new ForbiddenException('User not in this clinic');
    if (user.role !== Role.MANAGER) throw new BadRequestException('User is not a branch manager');
    await this.prisma.user.update({ where: { id: userId }, data: { clinicId: null } });
    return { deleted: true };
  }

  async listDepartments() {
    return this.prisma.department.findMany({ orderBy: { name: 'asc' } });
  }

  async findOrCreateDepartment(name: string) {
    const trimmed = name.trim();
    const existing = await this.prisma.department.findFirst({ where: { name: { equals: trimmed, mode: 'insensitive' } } });
    if (existing) return existing;
    return this.prisma.department.create({ data: { name: trimmed } });
  }

  async lookupPatient(clinicId: string, phone: string) {
    if (!phone) return null;
    const patient = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true, name: true, role: true, customerPin: true },
    });
    if (!patient || patient.role !== Role.PATIENT) return null;

    let customerPin = patient.customerPin;
    if (!customerPin) {
      customerPin = await this.customers.ensurePin(patient);
    }

    const where = { patientId: patient.id, doctor: { clinicId }, status: EntryStatus.COMPLETED };
    const [totalVisits, entries] = await Promise.all([
      this.prisma.queueEntry.count({ where }),
      this.prisma.queueEntry.findMany({
        where,
        orderBy: { joinedAt: 'desc' },
        take: 50,
        select: { serviceDay: true, doctor: { include: { user: { select: { name: true } } } } },
      }),
    ]);

    const byProvider = new Map<string, { name: string; count: number; dates: string[] }>();
    for (const e of entries) {
      const provName = e.doctor?.user?.name;
      if (!provName) continue;
      if (!byProvider.has(provName)) byProvider.set(provName, { name: provName, count: 0, dates: [] });
      const rec = byProvider.get(provName)!;
      rec.count++;
      const day = e.serviceDay;
      if (day && !rec.dates.includes(day)) rec.dates.push(day);
    }
    const providers = [...byProvider.values()].map((p) => ({
      name: p.name,
      count: p.count,
      dates: p.dates.slice(0, 10),
    }));

    return {
      name: patient.name,
      customerPin,
      totalVisits,
      providers,
      registered: true,
    };
  }

  /**
   * Clinic-level dashboard stats: today's totals, per-doctor queue state,
   * and 7-day traffic. Used by the clinic admin portal.
   */
  async getClinicDashboard(clinicId: string, caller?: AuthUser, locationId?: string) {
    const serviceDayKey = serviceDay();

    let targetLocationId = locationId;
    if (!targetLocationId && caller) {
      targetLocationId = await this.getDefaultLocationForUser(caller.id).catch(() => undefined);
    }
    if (!targetLocationId) {
      const firstLoc = await this.prisma.location.findFirst({
        where: { clinicId, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      targetLocationId = firstLoc?.id;
    }

    if (targetLocationId) await this.backfillStaffLocationLinks(clinicId);
    if (caller?.role === Role.MANAGER && targetLocationId) {
      await this.assertCallerManagesLocation(caller, targetLocationId);
    }

    const locations =
      caller?.role === Role.RECEPTIONIST || caller?.role === Role.MANAGER
        ? await this.prisma.location.findMany({
            where: { clinicId, status: 'ACTIVE', users: { some: { userId: caller.id } } },
            select: { id: true, name: true },
          })
        : caller?.role === Role.DOCTOR
          ? await this.prisma.location.findMany({
              where: {
                clinicId,
                status: 'ACTIVE',
                doctors: { some: { doctor: { userId: caller.id } } },
              },
              select: { id: true, name: true },
            })
          : await this.prisma.location.findMany({
              where: { clinicId, status: 'ACTIVE' },
              select: { id: true, name: true },
            });

    const [clinic, doctors, allDoctorsRaw, branchSettings] = await Promise.all([
      this.prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, name: true, address: true, businessType: true },
      }),
      this.prisma.doctor.findMany({
        where: {
          clinicId,
          ...(targetLocationId ? { locations: { some: { locationId: targetLocationId } } } : {}),
        },
        include: {
          user: { select: { id: true, name: true } },
          department: { select: { name: true } },
          locations: { select: { locationId: true } },
        },
        orderBy: { user: { name: 'asc' } },
      }),
      this.prisma.doctor.findMany({
        where: { clinicId },
        include: {
          user: { select: { id: true, name: true } },
          department: { select: { name: true } },
          locations: { select: { locationId: true } },
        },
        orderBy: { user: { name: 'asc' } },
      }),
      targetLocationId
        ? this.prisma.businessSetting.findUnique({
            where: { locationId: targetLocationId },
            select: { businessType: true },
          })
        : Promise.resolve(null),
    ]);

    if (!clinic) throw new NotFoundException('Clinic not found');

    const effectiveBusinessType = normalizeBusinessType(
      branchSettings?.businessType ?? clinic.businessType,
    );
    const clinicWithType = { ...clinic, businessType: effectiveBusinessType };

    const allDoctors = allDoctorsRaw.map((d) => ({
      id: d.id,
      userId: d.user.id,
      name: d.user.name,
      department: d.department?.name ?? '—',
      locationIds: d.locations.map((l) => l.locationId),
    }));

    const scope = targetLocationId
      ? await this.resolveScopedDoctorIds(caller, targetLocationId)
      : null;
    const visibleDoctors = scope === null ? doctors : doctors.filter((d) => scope.includes(d.id));
    const doctorIds = visibleDoctors.map((d) => d.id);

    const [todayStats, doctorQueues, weeklyEntries] = doctorIds.length
      ? await Promise.all([
          this.prisma.queueEntry.groupBy({
            by: ['status'],
            where: {
              doctorId: { in: doctorIds },
              serviceDay: serviceDayKey,
              ...(targetLocationId ? { locationId: targetLocationId } : {}),
            },
            _count: { _all: true },
          }),
          this.prisma.queueEntry.groupBy({
            by: ['doctorId', 'status'],
            where: {
              doctorId: { in: doctorIds },
              serviceDay: serviceDayKey,
              ...(targetLocationId ? { locationId: targetLocationId } : {}),
            },
            _count: { _all: true },
          }),
          this.prisma.queueEntry.groupBy({
            by: ['serviceDay'],
            where: {
              doctorId: { in: doctorIds },
              serviceDay: { in: recentServiceDays(7) },
              status: { in: [EntryStatus.COMPLETED, EntryStatus.SKIPPED, EntryStatus.CANCELLED] },
              ...(targetLocationId ? { locationId: targetLocationId } : {}),
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

    const doctorList = visibleDoctors.map((d) => ({
      id: d.id,
      userId: d.user.id,
      name: d.user.name,
      department: d.department?.name ?? '—',
      status: d.status,
      locationIds: d.locations.map((l) => l.locationId),
      waiting:        dqMap.get(d.id)?.[EntryStatus.WAITING]         ?? 0,
      inConsultation: dqMap.get(d.id)?.[EntryStatus.IN_CONSULTATION] ?? 0,
      completed:      dqMap.get(d.id)?.[EntryStatus.COMPLETED]       ?? 0,
      missed:         dqMap.get(d.id)?.[EntryStatus.MISSED]          ?? 0,
      skipped:        dqMap.get(d.id)?.[EntryStatus.SKIPPED]         ?? 0,
      cancelled:      dqMap.get(d.id)?.[EntryStatus.CANCELLED]       ?? 0,
    }));

    // Last-7-days traffic
    const weekMap = new Map(weeklyEntries.map((e) => [e.serviceDay, e._count._all]));
    const weeklyTraffic = recentServiceDays(7).map((date) => ({
      date,
      label: new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Kolkata',
      }),
      count: weekMap.get(date) ?? 0,
    }));

    return {
      clinic: clinicWithType,
      today,
      doctors: doctorList,
      allDoctors,
      weeklyTraffic,
      activeLocationId: targetLocationId ?? null,
      locations,
    };
  }

  // ── Locations Management ───────────────────────────────────────────────────

  async listLocations(clinicId: string, caller?: AuthUser) {
    const where: {
      clinicId: string;
      status: string;
      users?: { some: { userId: string } };
      doctors?: { some: { doctor: { userId: string } } };
    } = {
      clinicId,
      status: 'ACTIVE',
    };
    if (caller?.role === Role.RECEPTIONIST) {
      where.users = { some: { userId: caller.id } };
    } else if (caller?.role === Role.MANAGER) {
      where.users = { some: { userId: caller.id } };
    } else if (caller?.role === Role.DOCTOR) {
      where.doctors = { some: { doctor: { userId: caller.id } } };
    }
    let locs = await this.prisma.location.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    if (locs.length === 0) {
      const clinic = await this.prisma.clinic.findUnique({
        where: { id: clinicId },
        include: { locations: true },
      });
      if (clinic) {
        let defaultLoc = clinic.locations.find((l) => l.status === 'ACTIVE');
        if (!defaultLoc) {
          defaultLoc = await this.prisma.location.create({
            data: {
              clinicId: clinic.id,
              name: 'Demo Branch',
              address: 'Demo branch (You can rename or delete this branch and set up your own)',
              city: 'Bengaluru',
              state: 'Karnataka',
              country: 'India',
              postalCode: '560001',
              contactNumber: '+919999999999',
              status: 'ACTIVE',
            },
          });
        }
        if (caller?.id) {
          await this.prisma.userLocation.upsert({
            where: { userId_locationId: { userId: caller.id, locationId: defaultLoc.id } },
            update: {},
            create: { userId: caller.id, locationId: defaultLoc.id },
          }).catch(() => null);
        }
        locs = [defaultLoc];
      }
    }

    return locs;
  }


  async createLocation(clinicId: string, dto: any) {
    const loc = await this.prisma.location.create({
      data: {
        clinicId,
        name: dto.name,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        postalCode: dto.postalCode,
        contactNumber: dto.contactNumber,
        email: dto.email ?? null,
        googleReviewUrl: dto.googleReviewUrl ?? null,
        bookingContactNumber: dto.bookingContactNumber ?? null,
        timeZone: dto.timeZone ?? 'Asia/Kolkata',
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        status: dto.status ?? 'ACTIVE',
      },
    });
    // Initialize default business settings for this location branch
    await this.prisma.businessSetting.create({
      data: {
        locationId: loc.id,
        businessType: 'CLINIC',
        queueMode: 'LIVE_QUEUE',
        appointmentMode: 'HYBRID',
        allowOnlineBooking: false,
      },
    });

    // Log LOCATION_CREATED telemetry event
    void this.usageEvents.triggerEvent('LOCATION_CREATED', {
      businessId: clinicId,
      locationId: loc.id,
      referenceId: `${loc.id}_CREATED`,
      metadata: { name: loc.name, city: loc.city, state: loc.state },
    });

    return loc;
  }

  async updateLocation(locationId: string, dto: any) {
    const loc = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!loc) throw new NotFoundException('Location not found');
    return this.prisma.location.update({
      where: { id: locationId },
      data: {
        name: dto.name,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        postalCode: dto.postalCode,
        contactNumber: dto.contactNumber,
        email: dto.email ?? null,
        googleReviewUrl: dto.googleReviewUrl !== undefined ? (dto.googleReviewUrl ?? null) : undefined,
        bookingContactNumber: dto.bookingContactNumber !== undefined ? (dto.bookingContactNumber ?? null) : undefined,
        timeZone: dto.timeZone,
        latitude: dto.latitude,
        longitude: dto.longitude,
        status: dto.status,
      },
    });
  }

  async deleteLocation(locationId: string) {
    const loc = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!loc) throw new NotFoundException('Location not found');
    const count = await this.prisma.location.count({
      where: { clinicId: loc.clinicId, status: 'ACTIVE' },
    });
    if (count <= 1 && loc.status === 'ACTIVE') {
      throw new BadRequestException('Cannot delete the last active location of the clinic');
    }
    return this.prisma.location.delete({ where: { id: locationId } });
  }

  // ── Admin clinic management ────────────────────────────────────────────────

  async updateClinic(clinicId: string, dto: { name?: string; address?: string; businessType?: string }) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) throw new NotFoundException('Clinic not found');
    return this.prisma.clinic.update({
      where: { id: clinicId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.businessType ? { businessType: dto.businessType as any } : {}),
      },
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

  async adminDeleteManager(clinicId: string, userId: string) {
    return this.removeManager(clinicId, userId);
  }

  async adminDeleteDoctor(clinicId: string, doctorId: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    if (doctor.clinicId !== clinicId) throw new ForbiddenException('Doctor not in this clinic');
    const serviceDayKey = serviceDay();
    await this.prisma.queueEvent.deleteMany({ where: { doctorId } });
    await this.prisma.queueEntry.deleteMany({ where: { doctorId, serviceDay: serviceDayKey, status: { in: ['WAITING'] } } });
    await this.prisma.doctor.delete({ where: { id: doctorId } });
    return { deleted: true };
  }

  async adminDeleteReceptionist(clinicId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.clinicId !== clinicId) throw new ForbiddenException('User not in this clinic');
    if (user.role !== Role.RECEPTIONIST && user.role !== Role.CLINIC_ADMIN) {
      throw new BadRequestException('User is not clinic front-desk staff');
    }
    // Null out clinic link rather than deleting — preserves patient queue history.
    await this.prisma.user.update({ where: { id: userId }, data: { clinicId: null } });
    return { deleted: true };
  }

  async adminDeleteClinicAdmin(clinicId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.clinicId !== clinicId) throw new ForbiddenException('User not in this clinic');
    if (user.role !== Role.CLINIC_ADMIN) throw new BadRequestException('User is not a business admin');
    await this.prisma.user.update({ where: { id: userId }, data: { clinicId: null } });
    return { deleted: true };
  }

  /**
   * Time-series analytics for the clinic admin charts.
   *
   *  period=daily   → last `count` days (default 30), one row per day
   *               OR a custom date range when `from` + `to` are supplied
   *  period=monthly → last `count` months (default 12), one row per calendar month
   *  period=hourly  → 24 hourly buckets for a single day (default: today)
   *
   * Returned shape:
   *   { period, points: [{ label, date, completed, missed, cancelled, skipped, total }] }
   */
  async getClinicAnalytics(
    clinicId: string,
    period: 'daily' | 'monthly' | 'hourly' = 'daily',
    count = 30,
    dateParam?: string,
    from?: string,
    to?: string,
    caller?: AuthUser,
    locationId?: string,
  ) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true } });
    if (!clinic) throw new NotFoundException('Clinic not found');

    const doctors = await this.prisma.doctor.findMany({
      where: {
        clinicId,
        ...(locationId ? { locations: { some: { locationId } } } : {}),
      },
      select: { id: true },
    });
    const scope = locationId ? await this.resolveScopedDoctorIds(caller, locationId) : null;
    const doctorIds = this.filterIdsByScope(
      doctors.map((d) => d.id),
      scope,
    );

    if (!doctorIds.length) {
      return { period, points: [] };
    }

    const trackedStatuses = [
      EntryStatus.COMPLETED,
      EntryStatus.MISSED,
      EntryStatus.CANCELLED,
      EntryStatus.SKIPPED,
    ] as const;

    // ── Hourly ───────────────────────────────────────────────────────────────
    if (period === 'hourly') {
      const targetDay = dateParam ?? serviceDay();
      const entries = await this.prisma.queueEntry.findMany({
        where: {
          doctorId: { in: doctorIds },
          serviceDay: targetDay,
          status: { in: [...trackedStatuses] },
          ...(locationId ? { locationId } : {}),
        },
        select: { status: true, completedAt: true, joinedAt: true },
      });
      const hourMap = new Map<number, Record<string, number>>();
      for (let h = 0; h < 24; h++) hourMap.set(h, {});
      for (const e of entries) {
        const ts = e.completedAt ?? e.joinedAt;
        const hour = istHour(ts);
        const hm = hourMap.get(hour)!;
        hm[e.status] = (hm[e.status] ?? 0) + 1;
      }
      const points = Array.from({ length: 24 }, (_, h) => {
        const m = hourMap.get(h) ?? {};
        const completed = m[EntryStatus.COMPLETED] ?? 0;
        const missed    = m[EntryStatus.MISSED]    ?? 0;
        const cancelled = m[EntryStatus.CANCELLED] ?? 0;
        const skipped   = m[EntryStatus.SKIPPED]   ?? 0;
        return {
          date: `${targetDay}T${String(h).padStart(2, '0')}:00:00+05:30`,
          label: formatHourLabel(h),
          completed, missed, cancelled, skipped,
          total: completed + missed + cancelled + skipped,
        };
      });
      return { period, points };
    }

    // ── Daily (range or count-based) ─────────────────────────────────────────
    if (period === 'daily') {
      let dates: string[];
      if (from && to) {
        dates = [];
        for (let d = from; d <= to; d = addServiceDays(d, 1)) {
          dates.push(d);
        }
        if (dates.length > 366) dates = dates.slice(-366);
      } else {
        dates = Array.from({ length: count }, (_, i) => addServiceDays(serviceDay(), i - (count - 1)));
      }
      const rangeStart = dates[0];
      const rangeEnd   = dates[dates.length - 1];

      const rows = await this.prisma.queueEntry.groupBy({
        by: ['serviceDay', 'status'],
        where: {
          doctorId: { in: doctorIds },
          serviceDay: { gte: rangeStart, lte: rangeEnd },
          status: { in: [...trackedStatuses] },
          ...(locationId ? { locationId } : {}),
        },
        _count: { _all: true },
      });

      const dayMap = new Map<string, Record<string, number>>();
      for (const r of rows) {
        if (!dayMap.has(r.serviceDay)) dayMap.set(r.serviceDay, {});
        dayMap.get(r.serviceDay)![r.status] = r._count._all;
      }

      const points = dates.map((date) => {
        const m = dayMap.get(date) ?? {};
        const completed = m[EntryStatus.COMPLETED]  ?? 0;
        const missed    = m[EntryStatus.MISSED]     ?? 0;
        const cancelled = m[EntryStatus.CANCELLED]  ?? 0;
        const skipped   = m[EntryStatus.SKIPPED]    ?? 0;
        return {
          date,
          label: new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }),
          completed, missed, cancelled, skipped,
          total: completed + missed + cancelled + skipped,
        };
      });

      return { period, points };
    }

    // ── Monthly ───────────────────────────────────────────────────────────────
    const start = monthRangeStart(count);

    const rows = await this.prisma.queueEntry.groupBy({
      by: ['serviceDay', 'status'],
      where: {
        doctorId: { in: doctorIds },
        serviceDay: { gte: start },
        status: { in: [...trackedStatuses] },
        ...(locationId ? { locationId } : {}),
      },
      _count: { _all: true },
    });

    const monthMap = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const ym = r.serviceDay.slice(0, 7);
      if (!monthMap.has(ym)) monthMap.set(ym, {});
      const m = monthMap.get(ym)!;
      m[r.status] = (m[r.status] ?? 0) + r._count._all;
    }

    const months = recentMonthKeys(count);

    const points = months.map((ym) => {
      const m = monthMap.get(ym) ?? {};
      const completed = m[EntryStatus.COMPLETED]  ?? 0;
      const missed    = m[EntryStatus.MISSED]     ?? 0;
      const cancelled = m[EntryStatus.CANCELLED]  ?? 0;
      const skipped   = m[EntryStatus.SKIPPED]    ?? 0;
      const [year, mo] = ym.split('-');
      const label = new Date(`${year}-${mo}-01T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata' });
      return {
        date: ym + '-01',
        label,
        completed, missed, cancelled, skipped,
        total: completed + missed + cancelled + skipped,
      };
    });

    return { period, points };
  }

  /**
   * Per-doctor breakdown for a date range — used by the histogram "past data" feature.
   * Returns each doctor's completed/missed/cancelled/skipped totals between `from` and `to`.
   */
  async getDoctorAnalytics(clinicId: string, from: string, to: string, caller?: AuthUser, locationId?: string) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true } });
    if (!clinic) throw new NotFoundException('Clinic not found');

    const doctors = await this.prisma.doctor.findMany({
      where: {
        clinicId,
        ...(locationId ? { locations: { some: { locationId } } } : {}),
      },
      include: { user: { select: { name: true } }, department: { select: { name: true } } },
      orderBy: { user: { name: 'asc' } },
    });
    const scope = locationId ? await this.resolveScopedDoctorIds(caller, locationId) : null;
    const visibleDoctors = scope === null ? doctors : doctors.filter((d) => scope.includes(d.id));
    const doctorIds = visibleDoctors.map((d) => d.id);
    if (!doctorIds.length) return { from, to, doctors: [] };

    const trackedStatuses = [EntryStatus.COMPLETED, EntryStatus.MISSED, EntryStatus.CANCELLED, EntryStatus.SKIPPED];
    const rows = await this.prisma.queueEntry.groupBy({
      by: ['doctorId', 'status'],
      where: {
        doctorId: { in: doctorIds },
        serviceDay: { gte: from, lte: to },
        status: { in: trackedStatuses },
        ...(locationId ? { locationId } : {}),
      },
      _count: { _all: true },
    });

    const docMap = new Map<string, Record<string, number>>();
    for (const r of rows) {
      if (!docMap.has(r.doctorId)) docMap.set(r.doctorId, {});
      docMap.get(r.doctorId)![r.status] = r._count._all;
    }

    return {
      from, to,
      doctors: visibleDoctors.map((d) => {
        const m = docMap.get(d.id) ?? {};
        return {
          id: d.id,
          name: d.user.name,
          department: d.department?.name ?? '—',
          status: d.status,
          completed: m[EntryStatus.COMPLETED] ?? 0,
          missed:    m[EntryStatus.MISSED]    ?? 0,
          cancelled: m[EntryStatus.CANCELLED] ?? 0,
          skipped:   m[EntryStatus.SKIPPED]   ?? 0,
        };
      }),
    };
  }

  /**
   * Paginated visit history for the clinic. Returns entries with patient/doctor info
   * plus a summary of totals for the selected date range.
   */
  async getClinicHistory(
    clinicId: string,
    from: string,
    to: string,
    page = 1,
    limit = 50,
    scopedDoctorId?: string,
    caller?: AuthUser,
    locationId?: string,
  ) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true } });
    if (!clinic) throw new NotFoundException('Clinic not found');

    const doctors = await this.prisma.doctor.findMany({
      where: {
        clinicId,
        ...(locationId ? { locations: { some: { locationId } } } : {}),
      },
      select: { id: true }
    });
    const scope = locationId ? await this.resolveScopedDoctorIds(caller, locationId) : null;
    let doctorIds = this.filterIdsByScope(
      doctors.map((d) => d.id),
      scope,
    );
    if (!doctorIds.length) {
      return { entries: [], total: 0, page, pages: 0, summary: { completed: 0, missed: 0, cancelled: 0, skipped: 0, total: 0 } };
    }

    if (scopedDoctorId) {
      if (!doctorIds.includes(scopedDoctorId)) {
        throw new ForbiddenException('You are not assigned to this professional');
      }
    }

    const filteredDoctorId = scopedDoctorId && doctorIds.includes(scopedDoctorId) ? scopedDoctorId : undefined;

    const trackedStatuses = [EntryStatus.COMPLETED, EntryStatus.MISSED, EntryStatus.CANCELLED, EntryStatus.SKIPPED];
    const where = {
      doctorId: filteredDoctorId ? filteredDoctorId : { in: doctorIds },
      serviceDay: { gte: from, lte: to },
      status: { in: trackedStatuses },
      ...(locationId ? { locationId } : {}),
    };

    const [entries, total, summaryRows] = await Promise.all([
      this.prisma.queueEntry.findMany({
        where,
        include: {
          patient: { select: { name: true, phone: true } },
          doctor: { include: { user: { select: { name: true } }, department: { select: { name: true } } } },
        },
        orderBy: [{ serviceDay: 'asc' }, { tokenNumber: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.queueEntry.count({ where }),
      this.prisma.queueEntry.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ]);

    const summary = { completed: 0, missed: 0, cancelled: 0, skipped: 0, total: 0 };
    for (const r of summaryRows) {
      if (r.status === EntryStatus.COMPLETED) summary.completed = r._count._all;
      else if (r.status === EntryStatus.MISSED) summary.missed = r._count._all;
      else if (r.status === EntryStatus.CANCELLED) summary.cancelled = r._count._all;
      else if (r.status === EntryStatus.SKIPPED) summary.skipped = r._count._all;
    }
    summary.total = summary.completed + summary.missed + summary.cancelled + summary.skipped;

    return {
      entries: entries.map((e) => {
        const serviceStart = e.startedAt ?? e.calledAt;
        const consultMs =
          e.status === EntryStatus.COMPLETED && e.completedAt && serviceStart
            ? e.completedAt.getTime() - serviceStart.getTime()
            : null;

        return {
          id: e.id,
          tokenNumber: e.tokenNumber,
          status: e.status,
          serviceDay: e.serviceDay,
          joinedAt: e.joinedAt.toISOString(),
          completedAt: e.completedAt?.toISOString() ?? null,
          consultMinutes: consultMs !== null ? Math.round(consultMs / 60_000) : null,
          patient: { name: e.patient.name, phone: e.patient.phone ?? '' },
          doctor: { name: e.doctor.user.name, department: e.doctor.department?.name ?? '—' },
        };
      }),
      total,
      page,
      pages: Math.ceil(total / limit),
      summary,
    };
  }

  async deleteClinicHistory(clinicId: string, from: string, to: string, caller?: AuthUser, locationId?: string) {
    const doctors = await this.prisma.doctor.findMany({
      where: {
        clinicId,
        ...(locationId ? { locations: { some: { locationId } } } : {}),
      },
      select: { id: true },
    });
    const scope = locationId ? await this.resolveScopedDoctorIds(caller, locationId) : null;
    const doctorIds = this.filterIdsByScope(
      doctors.map((d) => d.id),
      scope,
    );
    if (!doctorIds.length) return { deleted: 0 };
    const result = await this.prisma.queueEntry.deleteMany({
      where: {
        doctorId: { in: doctorIds },
        serviceDay: { gte: from, lte: to },
        status: { in: [EntryStatus.COMPLETED, EntryStatus.MISSED, EntryStatus.CANCELLED, EntryStatus.SKIPPED] },
        ...(locationId ? { locationId } : {}),
      },
    });
    return { deleted: result.count };
  }

  async getStaffPerformanceReport(
    clinicId: string,
    from: string,
    to: string,
    search?: string,
    caller?: AuthUser,
    locationId?: string,
  ) {
    const doctors = await this.listDoctorsInClinic(clinicId, caller);
    const visible = search
      ? doctors.filter((d) => d.user.name.toLowerCase().includes(search.toLowerCase()))
      : doctors;

    const doctorIds = visible.map((d) => d.id);
    if (!doctorIds.length) {
      return { from, to, staff: [] };
    }

    const entries = await this.prisma.queueEntry.findMany({
      where: {
        doctorId: { in: doctorIds },
        serviceDay: { gte: from, lte: to },
        ...(locationId ? { locationId } : {}),
      },
      select: {
        id: true,
        doctorId: true,
        serviceDay: true,
        status: true,
        calledAt: true,
        startedAt: true,
        completedAt: true,
      },
    });

    const byDoctor = new Map<string, typeof entries>();
    for (const e of entries) {
      if (!byDoctor.has(e.doctorId)) byDoctor.set(e.doctorId, []);
      byDoctor.get(e.doctorId)!.push(e);
    }

    const staff = visible.map((doc) => {
      const list = byDoctor.get(doc.id) ?? [];
      const completed = list.filter((e) => e.status === EntryStatus.COMPLETED);
      const tokensGenerated = list.filter((e) => e.status !== EntryStatus.CANCELLED).length;

      let totalServedMs = 0;
      for (const e of completed) {
        const start = e.startedAt ?? e.calledAt;
        if (start && e.completedAt) {
          totalServedMs += e.completedAt.getTime() - start.getTime();
        }
      }

      const visitorsServed = completed.length;
      const avgServedMs = visitorsServed > 0 ? Math.round(totalServedMs / visitorsServed) : 0;

      let idleMs = 0;
      const days = [...new Set(completed.map((e) => e.serviceDay))];
      for (const day of days) {
        const dayCompleted = completed.filter(
          (e) => e.serviceDay === day && e.calledAt && e.completedAt,
        );
        if (dayCompleted.length === 0) continue;
        const first = Math.min(...dayCompleted.map((e) => e.calledAt!.getTime()));
        const last = Math.max(...dayCompleted.map((e) => e.completedAt!.getTime()));
        let servedDay = 0;
        for (const e of dayCompleted) {
          const start = e.startedAt ?? e.calledAt!;
          servedDay += e.completedAt!.getTime() - start.getTime();
        }
        idleMs += Math.max(0, last - first - servedDay);
      }

      return {
        doctorId: doc.id,
        staffName: doc.user.name,
        department: doc.department?.name ?? '—',
        visitorsServed,
        tokensGenerated,
        totalServedMs,
        avgServedMs,
        idleMs,
      };
    });

    return { from, to, staff: staff.sort((a, b) => b.visitorsServed - a.visitorsServed) };
  }

  async exportStaffPerformanceCsv(
    clinicId: string,
    from: string,
    to: string,
    search?: string,
    caller?: AuthUser,
    locationId?: string,
  ) {
    const report = await this.getStaffPerformanceReport(clinicId, from, to, search, caller, locationId);
    const header = [
      'staffName',
      'department',
      'visitorsServed',
      'tokensGenerated',
      'totalServedSeconds',
      'avgServedSeconds',
      'idleSeconds',
    ];
    const escape = (v: string | number) => {
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = [
      header.join(','),
      ...report.staff.map((s) =>
        [
          s.staffName,
          s.department,
          s.visitorsServed,
          s.tokensGenerated,
          Math.round(s.totalServedMs / 1000),
          Math.round(s.avgServedMs / 1000),
          Math.round(s.idleMs / 1000),
        ]
          .map(escape)
          .join(','),
      ),
    ];
    return { csv: lines.join('\n'), count: report.staff.length, from, to };
  }

  async exportClinicHistoryCsv(clinicId: string, from: string, to: string, caller?: AuthUser) {
    const data = await this.getClinicHistory(clinicId, from, to, 1, 10_000, undefined, caller);
    const header = [
      'tokenNumber',
      'serviceDay',
      'joinedAt',
      'completedAt',
      'consultMinutes',
      'patientName',
      'patientPhone',
      'doctorName',
      'department',
      'status',
    ];
    const escape = (v: string | number | null | undefined) => {
      const s = v == null ? '' : String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = [
      header.join(','),
      ...data.entries.map((e) =>
        [
          e.tokenNumber,
          e.serviceDay,
          e.joinedAt,
          e.completedAt ?? '',
          e.consultMinutes ?? '',
          e.patient.name,
          e.patient.phone,
          e.doctor.name,
          e.doctor.department,
          e.status,
        ]
          .map(escape)
          .join(','),
      ),
    ];
    return { csv: lines.join('\n'), count: data.entries.length, from, to };
  }

  async importClinicHistoryCsv(clinicId: string, csv: string, caller?: AuthUser) {
    if (caller?.role === Role.RECEPTIONIST) {
      throw new ForbiddenException('Only business admins can import history');
    }

    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new BadRequestException('CSV must include a header row and at least one data row');

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, ''));
    const col = (...names: string[]) => {
      for (const n of names) {
        const i = header.indexOf(n.toLowerCase().replace(/\s+/g, ''));
        if (i >= 0) return i;
      }
      return -1;
    };
    const iServiceDay = col('serviceday');
    const iPatientName = col('patientname');
    const iPatientPhone = col('patientphone');
    const iDoctorName = col('doctorname');
    const iStatus = col('status');
    const iToken = col('tokennumber');
    if (iServiceDay < 0 || iPatientName < 0 || iPatientPhone < 0 || iDoctorName < 0) {
      throw new BadRequestException('CSV must include serviceDay, patientName, patientPhone, doctorName columns');
    }

    const doctors = await this.listDoctorsInClinic(clinicId, caller);
    const doctorByName = new Map(doctors.map((d) => [d.user.name.toLowerCase(), d.id]));

    let imported = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = this.parseCsvLine(lines[i]);
      try {
        const serviceDayCol = cols[iServiceDay];
        const patientName = cols[iPatientName];
        const patientPhone = cols[iPatientPhone];
        const doctorName = cols[iDoctorName];
        const statusRaw = (iStatus >= 0 ? cols[iStatus] : 'COMPLETED').toUpperCase();
        const tokenRaw = iToken >= 0 ? cols[iToken] : undefined;

        if (!serviceDayCol || !patientName || !patientPhone || !doctorName) {
          throw new Error('Missing required fields');
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDayCol)) {
          throw new Error('serviceDay must be YYYY-MM-DD');
        }

        const doctorId = doctorByName.get(doctorName.toLowerCase());
        if (!doctorId) throw new Error(`Unknown doctor: ${doctorName}`);

        const patient = await this.customers.upsertByPhone(patientPhone, patientName);
        const status = Object.values(EntryStatus).includes(statusRaw as EntryStatus)
          ? (statusRaw as EntryStatus)
          : EntryStatus.COMPLETED;

        const last = await this.prisma.queueEntry.findFirst({
          where: { doctorId, serviceDay: serviceDayCol },
          orderBy: { tokenNumber: 'desc' },
          select: { tokenNumber: true },
        });
        const tokenNumber = tokenRaw ? parseInt(tokenRaw, 10) : (last?.tokenNumber ?? 0) + 1;

        const docLoc = await this.prisma.doctorLocation.findFirst({
          where: { doctorId },
          select: { locationId: true },
        });
        const locationId = docLoc?.locationId;
        if (!locationId) throw new Error(`Doctor is not assigned to any location`);

        await this.prisma.queueEntry.create({
          data: {
            doctorId,
            locationId,
            patientId: patient.id,
            serviceDay: serviceDayCol,
            tokenNumber: Number.isFinite(tokenNumber) ? tokenNumber : 1,
            status,
            joinedAt: new Date(),
            completedAt: status === EntryStatus.COMPLETED ? new Date() : null,
          },
        });
        imported += 1;
      } catch (e) {
        errors.push(`Row ${i + 1}: ${(e as Error).message}`);
      }
    }

    return { imported, errors: errors.slice(0, 20), totalRows: lines.length - 1 };
  }

  /** Minimal RFC4180-style CSV line parser (handles quoted fields). */
  private parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  async updateStaffEmail(clinicId: string, userId: string, email: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.clinicId !== clinicId) throw new ForbiddenException('User not in this clinic');
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== userId) throw new BadRequestException('Email already in use');
    return this.prisma.user.update({ where: { id: userId }, data: { email } });
  }

  private async generateLoginId(name: string, role: string): Promise<string> {
    const prefixMap: Record<string, string> = {
      DOCTOR: 'doc',
      RECEPTIONIST: 'staff',
      CLINIC_ADMIN: 'admin',
      MANAGER: 'mgr',
      ADMIN: 'super',
    };
    const prefix = prefixMap[role] || 'user';
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
    
    // Generate code and guarantee uniqueness
    for (let i = 0; i < 50; i++) {
      const suffix = Math.floor(100 + Math.random() * 900).toString(); // 3-digit number
      const candidate = `${prefix}_${cleanName}${suffix}`;
      const existing = await this.prisma.user.findUnique({ where: { loginId: candidate } });
      if (!existing) {
        return candidate;
      }
    }
    return `${prefix}_${cleanName}_${Date.now().toString().slice(-4)}`;
  }
}

