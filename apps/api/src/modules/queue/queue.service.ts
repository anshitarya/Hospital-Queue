import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { DoctorStatus, EntryStatus, Prisma, Role, SlotType, VisitStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { EtaService, EnrichedEntry } from './eta.service';
import { ClearQueueDto, JoinQueueDto, ReorderEntryDto, TransferPatientDto } from './dto/queue.dto';
import { QueueGateway } from './gateway/queue.gateway';
import { clinicDefaults } from '../../config/clinic.config';
import { NotificationsService } from '../notifications/notifications.service';
import { CustomerService, CUSTOMER_PUBLIC_SELECT } from '../patients/customer.service';
import { FEATURES } from '../../common/features';
import {
  effectivePosition,
  calculateSortOrder,
  calculateRejoinSortOrder,
  OrderingInput,
} from './queue-ordering';
import { istTimeSlot, serviceDay as istServiceDay, addServiceDays } from '../../common/utils/timezone';
import {
  findNextSlot,
  istDayOfWeek,
  istMinutesOfDay,
  parseHmToMinutes,
  istAppointmentDate,
  type ScheduleShift,
} from '../../common/utils/schedule-slots';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { ClinicsService } from '../clinics/clinics.service';

function tokenToCode(n: number, settings?: any): string {
  if (n <= 0) return '---';
  const prefix = settings?.tokenPrefix ?? 'TK';
  const format = settings?.queueNumberFormat ?? 'NUMBER';
  
  if (format === 'CODE') {
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const M = 17576; // 26^3
    const A = 6949;
    const ADD = 3749;
    const x = (((n - 1) * A) + ADD) % M;
    const code = CHARS[Math.floor(x / 676)] + CHARS[Math.floor((x % 676) / 26)] + CHARS[x % 26];
    return `${prefix}-${code}`;
  }
  
  return `${prefix}-${n}`;
}

function todayKey(): string {
  return istServiceDay();
}

/** Read-path defaults — avoid INSERT-on-read during hot snapshot paths. */
const DEFAULT_BUSINESS_SETTINGS = {
  queueMode: 'LIVE_QUEUE',
  appointmentMode: 'HYBRID',
  businessType: 'CLINIC',
} as const;


@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  /** Coalesce concurrent snapshot builds for the same doctor (subscribe + broadcast). */
  private readonly snapshotInflight = new Map<string, Promise<Awaited<ReturnType<QueueService['buildSnapshot']>>>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eta: EtaService,
    @Inject(forwardRef(() => QueueGateway))
    private readonly gateway: QueueGateway,
    private readonly notifications: NotificationsService,
    private readonly customers: CustomerService,
    private readonly clinics: ClinicsService,
  ) {}

  // ---------- read paths ----------

  async snapshot(doctorId: string): Promise<Awaited<ReturnType<QueueService['buildSnapshot']>>> {
    const inflight = this.snapshotInflight.get(doctorId);
    if (inflight) return inflight;

    const promise = this.buildSnapshot(doctorId).finally(() => {
      this.snapshotInflight.delete(doctorId);
    });
    this.snapshotInflight.set(doctorId, promise);
    return promise;
  }

  private sortActiveEntries<T extends { appointmentTime?: Date | null; sortOrder: number | null; tokenNumber: number }>(
    rawEntries: T[],
    settings: { queueMode?: string | null },
  ): T[] {
    return [...rawEntries].sort((a, b) => {
      const timeA = a.appointmentTime ? new Date(a.appointmentTime).getTime() : Infinity;
      const timeB = b.appointmentTime ? new Date(b.appointmentTime).getTime() : Infinity;
      if (timeA !== timeB) return timeA - timeB;
      return effectivePosition(a) - effectivePosition(b);
    });
  }

  private async buildSnapshot(doctorId: string): Promise<{
    doctor: Awaited<ReturnType<PrismaService['doctor']['findUnique']>>;
    entries: EnrichedEntry[];
    currentToken: number | null;
    missedEntries: Array<{ id: string; tokenNumber: number; patient: { id: string; name: string; phone?: string | null; customerPin?: string | null } | null; completedAt: string | null; missedCount: number }>;
    movingAvgMinutes: number | null;
    hasStartedToday: boolean;
  }> {
    const serviceDay = todayKey();

    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      include: { user: true, department: true, clinic: true },
    });
    if (!doctor) throw new NotFoundException(`Doctor ${doctorId} not found`);

    // Run remaining reads in parallel (settings is read-only — no INSERT on hot path).
    const [rawEntries, missedRaw, movingAvgMinutes, calledToday, settingsRow, shifts] = await Promise.all([
      this.prisma.queueEntry.findMany({
        where: {
          doctorId,
          serviceDay,
          status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
        },
        include: { patient: { select: CUSTOMER_PUBLIC_SELECT } },
        orderBy: { tokenNumber: 'asc' },
      }),
      this.prisma.queueEntry.findMany({
        where: { doctorId, serviceDay, status: EntryStatus.MISSED },
        include: { patient: { select: CUSTOMER_PUBLIC_SELECT } },
        orderBy: { completedAt: 'desc' },
      }),
      this.eta.getMovingAvg(doctorId, { serviceDay }),
      this.prisma.queueEntry.count({ where: { doctorId, serviceDay, calledAt: { not: null } } }),
      doctor.clinicId
        ? this.prisma.businessSetting.findUnique({ where: { clinicId: doctor.clinicId } })
        : Promise.resolve(null),
      this.prisma.professionalSchedule.findMany({
        where: { doctorId, isHoliday: false },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
    ]);

    const settings = settingsRow ?? DEFAULT_BUSINESS_SETTINGS;

    const entries = this.sortActiveEntries(rawEntries, settings);

    const missedEntries = missedRaw.map((e) => ({
      id: e.id,
      tokenNumber: e.tokenNumber,
      patient: e.patient,
      completedAt: e.completedAt?.toISOString() ?? null,
      missedCount: e.missedCount,
    }));

    const breakRemainingMinutes = doctor.breakUntil
      ? Math.max(0, (doctor.breakUntil.getTime() - Date.now()) / 60_000)
      : 0;

    let effectiveAvg = movingAvgMinutes;
    if (effectiveAvg === null) {
      const inProgress = entries.find((e) => e.status === EntryStatus.IN_CONSULTATION);
      effectiveAvg = this.eta.inProgressAvg(inProgress);
    }

    const enriched = this.eta.enrich(doctor, entries, {
      movingAvgMinutes: effectiveAvg,
      breakRemainingMinutes,
      settings,
      shifts,
    });

    const current =
      entries.find((e) => e.status === EntryStatus.IN_CONSULTATION)?.tokenNumber ?? null;

    return {
      doctor,
      entries: enriched,
      currentToken: current,
      missedEntries,
      // Only completed-history average; client derives in-progress estimate for display.
      movingAvgMinutes,
      hasStartedToday: calledToday > 0,
    };
  }

  async getEntry(entryId: string) {
    const entry = await this.prisma.queueEntry.findUnique({
      where: { id: entryId },
      include: {
        patient: { select: CUSTOMER_PUBLIC_SELECT },
        doctor: { include: { user: true, department: true, clinic: true } },
      },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    return entry;
  }

  async getPatientView(entryId: string) {
    const entry = await this.getEntry(entryId);
    const serviceDay = entry.serviceDay;

    const [rawEntries, movingAvgMinutes, settingsRow, shifts] = await Promise.all([
      this.prisma.queueEntry.findMany({
        where: {
          doctorId: entry.doctorId,
          serviceDay,
          status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
        },
        include: { patient: { select: CUSTOMER_PUBLIC_SELECT } },
        orderBy: { tokenNumber: 'asc' },
      }),
      this.eta.getMovingAvg(entry.doctorId, { serviceDay }),
      entry.doctor.clinicId
        ? this.prisma.businessSetting.findUnique({ where: { clinicId: entry.doctor.clinicId } })
        : Promise.resolve(null),
      this.prisma.professionalSchedule.findMany({
        where: { doctorId: entry.doctorId, isHoliday: false },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
    ]);

    const settings = settingsRow ?? DEFAULT_BUSINESS_SETTINGS;
    const entries = this.sortActiveEntries(rawEntries, settings);

    let effectiveAvg = movingAvgMinutes;
    if (effectiveAvg === null) {
      effectiveAvg = this.eta.inProgressAvg(
        entries.find((e) => e.status === EntryStatus.IN_CONSULTATION),
      );
    }

    const enriched = this.eta.enrich(entry.doctor, entries, {
      movingAvgMinutes: effectiveAvg,
      breakRemainingMinutes: entry.doctor.breakUntil
        ? Math.max(0, (entry.doctor.breakUntil.getTime() - Date.now()) / 60_000)
        : 0,
      settings,
      shifts,
    });
    const enrichedSelf = enriched.find((e) => e.id === entryId);
    const current =
      entries.find((e) => e.status === EntryStatus.IN_CONSULTATION)?.tokenNumber ?? null;

    return {
      entry: enrichedSelf ?? entry,
      currentToken: current,
      doctor: entry.doctor,
      movingAvgMinutes,
    };
  }

  /** Public join-info for the QR landing page — no auth required. */
  async getPublicJoinInfo(doctorId: string) {
    const serviceDay = todayKey();
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      include: {
        user: { select: { name: true } },
        department: { select: { name: true } },
        clinic: { select: { id: true, name: true, address: true, businessType: true } },
      },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const [queueLength, settings] = await Promise.all([
      this.prisma.queueEntry.count({
        where: { doctorId, serviceDay, status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] } },
      }),
      doctor.clinicId
        ? this.prisma.businessSetting.findUnique({ where: { clinicId: doctor.clinicId } })
        : Promise.resolve(null),
    ]);

    if (!settings?.allowOnlineBooking) {
      return { error: 'Self-booking is not enabled for this professional', allowOnlineBooking: false };
    }

    return {
      allowOnlineBooking: true,
      doctor: {
        id: doctor.id,
        name: doctor.user.name,
        specialization: doctor.specialization,
        department: doctor.department?.name,
        status: doctor.status,
        avgConsultMinutes: doctor.avgConsultMinutes,
      },
      clinic: doctor.clinic,
      queueLength,
      etaMinutes: Math.max(1, queueLength * doctor.avgConsultMinutes),
    };
  }

  // ---------- write paths ----------

  async joinByReception(dto: JoinQueueDto, caller: AuthUser) {
    await this.clinics.assertCallerCanAccessDoctor(caller, dto.doctorId);
    if (dto.idempotencyKey) {
      const cached = await this.redis.client.get(`idem:${dto.idempotencyKey}`);
      if (cached) return this.getEntry(cached);
    }

    const patient = await this.customers.upsertByPhone(dto.patientPhone, dto.patientName);

    const serviceDay = todayKey();

    // If the patient is in the MISSED panel, auto-rejoin instead of creating a duplicate.
    const missedEntry = await this.prisma.queueEntry.findFirst({
      where: { patientId: patient.id, doctorId: dto.doctorId, serviceDay, status: EntryStatus.MISSED },
    });
    if (missedEntry) {
      const rejoined = await this.rejoinQueue(missedEntry.id, caller);
      if (dto.idempotencyKey) {
        await this.redis.client.set(`idem:${dto.idempotencyKey}`, rejoined.id, 'EX', 600);
      }
      void this.broadcast(dto.doctorId, 'patient_joined', { entryId: rejoined.id });
      return rejoined;
    }

    // Reject if patient already has an active entry for this doctor today.
    const activeEntry = await this.prisma.queueEntry.findFirst({
      where: {
        patientId: patient.id,
        doctorId: dto.doctorId,
        serviceDay,
        status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
      },
    });
    if (activeEntry) {
      throw new ConflictException('Patient is already in the queue for this doctor today');
    }

    const entry = await this.createEntry({
      doctorId: dto.doctorId,
      patientId: patient.id,
      createdById: caller.id,
      priority: dto.priority ?? 0,
      notes: dto.notes,
      walkin: dto.walkin ?? false,
      slotType: dto.slotType === 'FOLLOWUP' ? SlotType.FOLLOWUP : SlotType.NEW,
      insertAtPosition: dto.insertAtPosition,
      appointmentTime: dto.appointmentTime,
    });

    if (dto.idempotencyKey) {
      await this.redis.client.set(`idem:${dto.idempotencyKey}`, entry.id, 'EX', 600);
    }

    void this.broadcast(dto.doctorId, 'patient_joined', { entryId: entry.id });
    this.gateway.emitToPatientRoom(patient.id, 'patient:queue:updated', {
      eventType: 'joined',
      entryId: entry.id,
      doctorId: dto.doctorId,
    });

    // Fire-and-forget: notify patient of their queue spot (doesn't block the response)
    if (patient.phone) void this.notifyJoinedAsync(patient.phone, entry.tokenNumber, dto.doctorId);

    return entry;
  }

  async joinByPatient(patientId: string, doctorId: string, notes?: string, appointmentTime?: string) {
    const entry = await this.createEntry({
      doctorId,
      patientId,
      priority: 0,
      notes,
      walkin: false,
      slotType: SlotType.NEW,
      appointmentTime,
    });
    void this.broadcast(doctorId, 'patient_joined', { entryId: entry.id });
    this.gateway.emitToPatientRoom(patientId, 'patient:queue:updated', {
      eventType: 'joined',
      entryId: entry.id,
      doctorId,
    });
    return entry;
  }

  /**
   * Allocates the next token number atomically.
   * Walk-ins get a fractional sortOrder computed between two adjacent queue
   * positions so they slot in near current_position + walkinGap without
   * disturbing anyone else's token number. Feature 1.
   */
  private async createEntry(input: {
    doctorId: string;
    patientId: string;
    createdById?: string;
    priority: number;
    notes?: string;
    walkin: boolean;
    slotType: SlotType;
    sortOrder?: number;
    missedCount?: number;
    insertAtPosition?: number;
    visitId?: string;
    appointmentTime?: string;
    /** Preserve the originating service day (workflow handoffs near midnight). */
    serviceDay?: string;
    /** Skip time-slot allocation — used for automatic workflow routing. */
    fromWorkflow?: boolean;
  }) {
    const serviceDay = input.serviceDay ?? todayKey();
    return this.prisma.$transaction(
      async (tx) => {
        const doctor = await tx.doctor.findUnique({
          where: { id: input.doctorId },
          select: { clinicId: true, userId: true },
        });
        if (!doctor) throw new NotFoundException('Doctor profile not found');
        const clinicId = doctor.clinicId;
        if (!clinicId) throw new BadRequestException('Doctor is not assigned to a clinic');

        // Fetch settings or default
        let settings = await tx.businessSetting.findUnique({
          where: { clinicId },
        });
        if (!settings) {
          settings = await tx.businessSetting.create({
            data: {
              clinicId,
              businessType: 'CLINIC',
              queueMode: 'LIVE_QUEUE',
              appointmentMode: 'HYBRID',
            },
          });
        }

        // Check if doctor has active approved leaves/breaks right now
        const now = new Date();
        const activeLeave = await tx.staffLeave.findFirst({
          where: {
            userId: doctor.userId,
            status: 'APPROVED',
            startDate: { lte: now },
            endDate: { gte: now },
          },
        });

        if (activeLeave && !input.fromWorkflow) {
          throw new BadRequestException('The professional is currently unavailable (on leave or break)');
        }

        // Slot allocation
        let finalAppointmentTime: Date | null = null;
        let appointmentSlotStr: string | null = null;

        if (!input.fromWorkflow) {
          if (input.appointmentTime) {
            let parsedTime: Date;
            if (input.appointmentTime.includes('T')) {
              parsedTime = new Date(input.appointmentTime);
            } else {
              parsedTime = new Date(`${serviceDay}T${input.appointmentTime}:00+05:30`);
            }
            finalAppointmentTime = parsedTime;
            appointmentSlotStr = input.appointmentTime.includes('T')
              ? input.appointmentTime.slice(11, 16)
              : input.appointmentTime;
          } else {
            if (settings.queueMode === 'TIME_SLOT' || settings.queueMode === 'CAPACITY_TIME_SLOT') {
              const allocated = await this.findNextAvailableSlot(tx, input.doctorId, settings, serviceDay, now);
              if (allocated) {
                finalAppointmentTime = allocated.time;
                appointmentSlotStr = allocated.slotStr;
              } else {
                throw new BadRequestException('No available appointment slots left for today');
              }
            } else if (settings.queueMode === 'LIVE_QUEUE') {
              const nextShiftStart = await this.getNextAvailableShift(tx, input.doctorId, serviceDay, now);
              if (nextShiftStart) {
                finalAppointmentTime = nextShiftStart;
                const hrs = String(nextShiftStart.getHours()).padStart(2, '0');
                const mins = String(nextShiftStart.getMinutes()).padStart(2, '0');
                appointmentSlotStr = `${hrs}:${mins}`;
              }
            }
          }
        }

        let visitId = input.visitId;
        if (!visitId) {
          let visit = await tx.visit.findFirst({
            where: {
              clinicId,
              patientId: input.patientId,
              serviceDay,
              status: VisitStatus.ACTIVE,
            },
          });
          if (!visit) {
            visit = await tx.visit.create({
              data: {
                clinicId,
                patientId: input.patientId,
                serviceDay,
                status: VisitStatus.ACTIVE,
              },
            });
          }
          visitId = visit.id;
        }

        const last = await tx.queueEntry.findFirst({
          where: { doctorId: input.doctorId, serviceDay },
          orderBy: { tokenNumber: 'desc' },
          select: { tokenNumber: true },
        });
        const tokenNumber = (last?.tokenNumber ?? 0) + 1;

        const orderingInput: OrderingInput = {
          doctorId:         input.doctorId,
          priority:         input.priority,
          walkin:           input.walkin,
          slotType:         input.slotType,
          insertAtPosition: input.insertAtPosition,
          sortOrder:        input.sortOrder,
        };

        const sortOrder = await calculateSortOrder(orderingInput, tx, serviceDay, settings);

        return tx.queueEntry.create({
          data: {
            doctorId: input.doctorId,
            patientId: input.patientId,
            createdById: input.createdById,
            serviceDay,
            tokenNumber,
            priority: input.priority,
            notes: input.notes,
            status: EntryStatus.WAITING,
            walkin: input.walkin ?? false,
            slotType: input.slotType,
            sortOrder,
            missedCount: input.missedCount ?? 0,
            visitId,
            appointmentTime: finalAppointmentTime,
            appointmentSlot: appointmentSlotStr,
          },
          include: { patient: { select: CUSTOMER_PUBLIC_SELECT } },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  // ---------- transitions ----------

  async callNext(doctorId: string, caller: AuthUser) {
    await this.clinics.assertCallerCanAccessDoctor(caller, doctorId);
    const serviceDay = todayKey();

    // Fetch all three needed facts in parallel — skip missed/movingAvg (not needed here).
    const [doctor, rawEntries, servedToday] = await Promise.all([
      this.prisma.doctor.findUnique({
        where: { id: doctorId },
        select: { followUpEvery: true, user: { select: { name: true } } },
      }),
      this.prisma.queueEntry.findMany({
        where: {
          doctorId,
          serviceDay,
          status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
        },
        include: { patient: { select: CUSTOMER_PUBLIC_SELECT } },
        orderBy: { tokenNumber: 'asc' },
      }),
      this.prisma.queueEntry.count({
        where: { doctorId, serviceDay, status: EntryStatus.COMPLETED },
      }),
    ]);

    const entries = [...rawEntries].sort(
      (a, b) => effectivePosition(a) - effectivePosition(b),
    );

    const alreadyInProgress = entries.find((e) => e.status === EntryStatus.IN_CONSULTATION);
    if (alreadyInProgress) {
      throw new ConflictException(
        `Doctor already has token #${tokenToCode(alreadyInProgress.tokenNumber)} in consultation`,
      );
    }

    const waiting = entries.filter((e) => e.status === EntryStatus.WAITING);
    if (!waiting.length) throw new NotFoundException('No patients waiting');

    let next: (typeof waiting)[0];

    // Emergency patients (priority >= 100) always go first regardless of slot rules.
    const emergency = waiting
      .filter((e) => e.priority >= 100)
      .sort((a, b) => effectivePosition(a) - effectivePosition(b))[0];

    if (emergency) {
      next = emergency;
    } else {
      const followUpEvery = doctor?.followUpEvery ?? 0;
      if (followUpEvery > 0 && (servedToday + 1) % followUpEvery === 0) {
        // This slot should be a follow-up. Prefer first FOLLOWUP patient; fall back to anyone.
        next = waiting.find((e) => e.slotType === SlotType.FOLLOWUP) ?? waiting[0];
      } else if (followUpEvery > 0) {
        // Normal slot with follow-up scheduling active: prefer NEW patients.
        next = waiting.find((e) => e.slotType === SlotType.NEW) ?? waiting[0];
      } else {
        // No follow-up scheduling configured — serve in strict queue order.
        next = waiting[0];
      }
    }

    const result = await this.transition(next.id, EntryStatus.IN_CONSULTATION, caller.id, {
      calledAt: new Date(),
      startedAt: new Date(),
    });

    // Fire-and-forget notifications — never block the call flow
    const doctorName = doctor?.user?.name ?? 'the doctor';
    if (next.patient?.phone) {
      void this.notifications.notifyTurnNow(next.patient.phone, doctorName).catch(() => {});
    }
    // Notify the next patient in line: "you're almost next"
    const nextInLine = waiting.find((e) => e.id !== next.id);
    if (nextInLine?.patient?.phone) {
      void this.notifications.notifyAlmostNext(nextInLine.patient.phone, doctorName).catch(() => {});
    }

    return result;
  }

  async complete(entryId: string, caller: AuthUser) {
    await this.verifyCallerCanAccessEntry(caller, entryId);
    return this.transition(entryId, EntryStatus.COMPLETED, caller.id, {
      completedAt: new Date(),
    });
  }

  async skip(entryId: string, caller: AuthUser) {
    await this.verifyCallerCanAccessEntry(caller, entryId);
    return this.transition(entryId, EntryStatus.SKIPPED, caller.id, { completedAt: new Date() });
  }

  async cancel(entryId: string, caller: AuthUser) {
    if (caller.role === Role.PATIENT) {
      const entry = await this.prisma.queueEntry.findUnique({ where: { id: entryId }, select: { patientId: true } });
      if (!entry) throw new NotFoundException('Entry not found');
      if (entry.patientId !== caller.id) throw new ForbiddenException('Cannot cancel another patient\'s entry');
    } else if (caller.role === Role.RECEPTIONIST) {
      await this.verifyCallerCanAccessEntry(caller, entryId);
    }
    return this.transition(entryId, EntryStatus.CANCELLED, caller.id, { completedAt: new Date() });
  }

  /** Mark a patient as missed (called but didn't appear). Feature 2. */
  async markMissed(entryId: string, caller: AuthUser) {
    await this.verifyCallerCanAccessEntry(caller, entryId);
    await this.prisma.queueEntry.update({
      where: { id: entryId },
      data: { missedCount: { increment: 1 } },
    });
    return this.transition(entryId, EntryStatus.MISSED, caller.id, { completedAt: new Date() });
  }

  /**
   * Re-insert a previously-missed patient near the current position + missedGap.
   * Creates a brand-new entry so the original MISSED record stays for audit. Feature 2.
   */
  async rejoinQueue(missedEntryId: string, caller: AuthUser) {
    const missed = await this.prisma.queueEntry.findUnique({
      where: { id: missedEntryId },
      include: { doctor: { select: { id: true, clinicId: true } } },
    });
    if (!missed) throw new NotFoundException('Entry not found');
    await this.clinics.assertCallerCanAccessDoctor(caller, missed.doctor.id);
    if (missed.status !== EntryStatus.MISSED) {
      throw new BadRequestException('Only MISSED entries can rejoin');
    }

    const serviceDay = todayKey();
    const clinicId = missed.doctor.clinicId;
    if (!clinicId) throw new BadRequestException('Doctor is not assigned to a clinic');

    let settings = await this.prisma.businessSetting.findUnique({
      where: { clinicId },
    });
    if (!settings) {
      settings = await this.prisma.businessSetting.create({
        data: {
          clinicId,
          businessType: 'CLINIC',
          queueMode: 'LIVE_QUEUE',
          appointmentMode: 'HYBRID',
        },
      });
    }

    const allActive = await this.prisma.queueEntry.findMany({
      where: {
        doctorId: missed.doctorId,
        serviceDay,
        status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
      },
      select: { sortOrder: true, tokenNumber: true },
    });
    const positions = allActive.map((e) => effectivePosition(e)).sort((a, b) => a - b);

    const lastMissedInQueue = await this.prisma.queueEntry.findFirst({
      where: {
        doctorId: missed.doctorId,
        serviceDay,
        status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
        sortOrder: { not: null },
        missedCount: { gt: 0 },
      },
      orderBy: { sortOrder: 'desc' },
      select:  { sortOrder: true },
    });

    const sortOrder = calculateRejoinSortOrder(positions, settings, lastMissedInQueue as { sortOrder: number } | null);

    const entry = await this.createEntry({
      doctorId: missed.doctorId,
      patientId: missed.patientId,
      createdById: caller.id,
      priority: missed.priority,
      notes: missed.notes ?? undefined,
      walkin: false,
      slotType: missed.slotType,
      sortOrder,
      missedCount: missed.missedCount,
    });

    // Remove the old MISSED entry from the panel by marking it CANCELLED.
    await this.prisma.queueEntry.update({
      where: { id: missedEntryId },
      data: { status: EntryStatus.CANCELLED, completedAt: new Date() },
    });

    void this.broadcast(missed.doctorId, 'patient_rejoined', { entryId: entry.id, missedEntryId });
    this.gateway.emitToPatientRoom(missed.patientId, 'patient:queue:updated', {
      eventType: 'rejoined',
      entryId: entry.id,
      doctorId: missed.doctorId,
    });
    return entry;
  }

  async transfer(
    entryId: string,
    dto: TransferPatientDto,
    caller: AuthUser,
  ) {
    const serviceDay = todayKey();

    const currentEntryPreview = await this.prisma.queueEntry.findUnique({
      where: { id: entryId },
      select: { doctorId: true },
    });
    if (!currentEntryPreview) throw new NotFoundException('Current queue entry not found');
    await this.clinics.assertCallerCanAccessDoctor(caller, currentEntryPreview.doctorId);
    await this.clinics.assertCallerCanAccessDoctor(caller, dto.destinationDoctorId);

    const clinicId = caller.clinicId;
    if (!clinicId) throw new ForbiddenException('No clinic assigned');

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Get the current entry and ensure it exists and belongs to the same clinic
      const currentEntry = await tx.queueEntry.findUnique({
        where: { id: entryId },
        include: {
          doctor: true,
          patient: true,
        },
      });

      if (!currentEntry) {
        throw new NotFoundException('Current queue entry not found');
      }

      if (currentEntry.doctor.clinicId !== clinicId) {
        throw new ForbiddenException('You do not have access to this patient entry');
      }

      // 2. Ensure destination doctor exists and belongs to the same clinic
      const destinationDoctor = await tx.doctor.findUnique({
        where: { id: dto.destinationDoctorId },
        include: { user: true },
      });

      if (!destinationDoctor || destinationDoctor.clinicId !== clinicId) {
        throw new BadRequestException('Destination doctor not found in this clinic');
      }

      if (destinationDoctor.id === currentEntry.doctorId) {
        throw new BadRequestException('Cannot transfer patient to the same doctor');
      }

      // 3. Find or create the active Visit for this patient today
      let visitId = currentEntry.visitId;
      if (!visitId) {
        let visit = await tx.visit.findFirst({
          where: {
            clinicId,
            patientId: currentEntry.patientId,
            serviceDay,
            status: VisitStatus.ACTIVE,
          },
        });
        if (!visit) {
          visit = await tx.visit.create({
            data: {
              clinicId,
              patientId: currentEntry.patientId,
              serviceDay,
              status: VisitStatus.ACTIVE,
            },
          });
        }
        visitId = visit.id;
        // Update the current entry to link to this visit
        await tx.queueEntry.update({
          where: { id: currentEntry.id },
          data: { visitId },
        });
      }

      // 4. Update the current entry status to COMPLETED (since they are moving to the next stage)
      if (currentEntry.status === EntryStatus.WAITING || currentEntry.status === EntryStatus.IN_CONSULTATION) {
        await tx.queueEntry.update({
          where: { id: currentEntry.id },
          data: {
            status: EntryStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
        // Log event for the completed queue entry
        await tx.queueEvent.create({
          data: {
            entryId: currentEntry.id,
            doctorId: currentEntry.doctorId,
            type: 'entry_completed',
            payload: { byUserId: caller.id, note: 'Transferred to another professional' },
          },
        });
      }

      // 5. Create a new QueueEntry for the destination doctor under the same Visit
      const orderingInput: OrderingInput = {
        doctorId:         dto.destinationDoctorId,
        priority:         currentEntry.priority,
        walkin:           dto.walkin ?? false,
        slotType:         dto.slotType === 'FOLLOWUP' ? SlotType.FOLLOWUP : SlotType.NEW,
      };

      let settings = await tx.businessSetting.findUnique({
        where: { clinicId },
      });
      if (!settings) {
        settings = await tx.businessSetting.create({
          data: {
            clinicId,
            businessType: 'CLINIC',
            queueMode: 'LIVE_QUEUE',
            appointmentMode: 'HYBRID',
          },
        });
      }

      const sortOrder = await calculateSortOrder(orderingInput, tx, serviceDay, settings);

      const last = await tx.queueEntry.findFirst({
        where: { doctorId: dto.destinationDoctorId, serviceDay },
        orderBy: { tokenNumber: 'desc' },
        select: { tokenNumber: true },
      });
      const tokenNumber = (last?.tokenNumber ?? 0) + 1;

      const newEntry = await tx.queueEntry.create({
        data: {
          doctorId: dto.destinationDoctorId,
          patientId: currentEntry.patientId,
          createdById: caller.id,
          serviceDay,
          tokenNumber,
          priority: currentEntry.priority,
          notes: currentEntry.notes,
          status: EntryStatus.WAITING,
          walkin: dto.walkin ?? false,
          slotType: dto.slotType === 'FOLLOWUP' ? SlotType.FOLLOWUP : SlotType.NEW,
          sortOrder,
          visitId,
        },
        include: { patient: { select: CUSTOMER_PUBLIC_SELECT } },
      });

      // 6. Create TransferLog
      await tx.transferLog.create({
        data: {
          visitId,
          transferredById: caller.id,
          transferredFromId: currentEntry.doctorId,
          transferredToId: dto.destinationDoctorId,
          transferReason: dto.transferReason,
        },
      });

      // Log queue event for the new entry
      await tx.queueEvent.create({
        data: {
          entryId: newEntry.id,
          doctorId: dto.destinationDoctorId,
          type: 'entry_joined',
          payload: { byUserId: caller.id, note: 'Transferred from another professional' },
        },
      });

      return { currentEntry, newEntry };
    });

    // 7. Trigger asynchronous notifications and broadcasts outside the transaction
    void this.broadcast(result.currentEntry.doctorId, 'patient_transferred_out', { entryId: entryId });
    void this.broadcast(dto.destinationDoctorId, 'patient_transferred_in', { entryId: result.newEntry.id });

    this.gateway.emitToDoctorRoom(dto.destinationDoctorId, 'patient_transferred_notification', {
      message: `Patient ${result.currentEntry.patient.name} has been transferred to you`,
      entryId: result.newEntry.id,
    });

    this.gateway.emitToPatientRoom(result.currentEntry.patientId, 'patient:queue:updated', {
      eventType: 'transferred',
      entryId: result.newEntry.id,
      doctorId: dto.destinationDoctorId,
    });

    return result.newEntry;
  }

  async reorder(entryId: string, dto: ReorderEntryDto, caller: AuthUser) {
    await this.verifyCallerCanAccessEntry(caller, entryId);
    const entry = await this.prisma.queueEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.status !== EntryStatus.WAITING) {
      throw new BadRequestException('Can only reorder waiting entries');
    }

    // If marking as emergency, also move to the front of the waiting queue visually.
    let emergencySortOrder: number | undefined;
    if (dto.priority >= 100) {
      const serviceDay = todayKey();
      const allWaiting = await this.prisma.queueEntry.findMany({
        where: {
          doctorId: entry.doctorId,
          serviceDay,
          status: EntryStatus.WAITING,
          NOT: { id: entryId },
        },
        select: { sortOrder: true, tokenNumber: true },
      });
      if (allWaiting.length > 0) {
        const minPos = Math.min(...allWaiting.map((e) => effectivePosition(e)));
        emergencySortOrder = minPos - 1;
      }
    }

    const updated = await this.prisma.queueEntry.update({
      where: { id: entryId },
      data: {
        priority: dto.priority,
        ...(emergencySortOrder !== undefined ? { sortOrder: emergencySortOrder } : {}),
        version: { increment: 1 },
      },
    });

    void this.prisma.queueEvent.create({
      data: {
        doctorId: entry.doctorId,
        entryId,
        type: 'reordered',
        payload: { byUserId: caller.id, newPriority: dto.priority },
      },
    }).catch(() => {});

    void this.broadcast(entry.doctorId, 'queue_updated', { entryId });
    this.gateway.emitToPatientRoom(entry.patientId, 'patient:queue:updated', {
      eventType: 'reordered',
      entryId,
      doctorId: entry.doctorId,
    });
    return updated;
  }

  async moveToPosition(entryId: string, targetPosition: number, caller: AuthUser) {
    await this.verifyCallerCanAccessEntry(caller, entryId);
    const entry = await this.prisma.queueEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.status !== EntryStatus.WAITING) {
      throw new BadRequestException('Can only move waiting entries');
    }
    const serviceDay = todayKey();
    const allActive = await this.prisma.queueEntry.findMany({
      where: {
        doctorId: entry.doctorId,
        serviceDay,
        status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
        NOT: { id: entryId },
      },
      select: { sortOrder: true, tokenNumber: true },
    });
    const sorted = allActive
      .map((e) => effectivePosition(e))
      .sort((a, b) => a - b);

    const pos = targetPosition - 1;
    let newSortOrder: number;
    if (pos <= 0) {
      newSortOrder = sorted.length > 0 ? sorted[0] - 0.5 : 1;
    } else if (pos >= sorted.length) {
      newSortOrder = sorted.length > 0 ? sorted[sorted.length - 1] + 0.5 : 1;
    } else {
      newSortOrder = (sorted[pos - 1] + sorted[pos]) / 2;
    }

    const updated = await this.prisma.queueEntry.update({
      where: { id: entryId },
      data: { sortOrder: newSortOrder, version: { increment: 1 } },
    });
    void this.prisma.queueEvent.create({
      data: { doctorId: entry.doctorId, entryId, type: 'moved', payload: { byUserId: caller.id, targetPosition } },
    }).catch(() => {});
    void this.broadcast(entry.doctorId, 'queue_updated', { entryId });
    this.gateway.emitToPatientRoom(entry.patientId, 'patient:queue:updated', {
      eventType: 'moved', entryId, doctorId: entry.doctorId,
    });
    return updated;
  }

  /** Move a waiting patient one step back, or return an in-consultation patient to the queue front. */
  async moveBackInQueue(entryId: string, caller: AuthUser) {
    await this.verifyCallerCanAccessEntry(caller, entryId);
    const entry = await this.prisma.queueEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Entry not found');

    const serviceDay = todayKey();
    if (entry.serviceDay !== serviceDay) {
      throw new BadRequestException('Can only move back entries for today');
    }

    if (entry.status === EntryStatus.IN_CONSULTATION) {
      const waiting = await this.prisma.queueEntry.findMany({
        where: {
          doctorId: entry.doctorId,
          serviceDay,
          status: EntryStatus.WAITING,
          NOT: { id: entryId },
        },
        select: { sortOrder: true, tokenNumber: true },
      });
      const positions = waiting.map((e) => effectivePosition(e)).sort((a, b) => a - b);
      const newSortOrder = positions.length > 0 ? positions[0] - 0.5 : 1;

      const updated = await this.prisma.queueEntry.update({
        where: { id: entryId },
        data: {
          status: EntryStatus.WAITING,
          calledAt: null,
          startedAt: null,
          sortOrder: newSortOrder,
          version: { increment: 1 },
        },
        include: { patient: { select: CUSTOMER_PUBLIC_SELECT } },
      });

      void this.prisma.queueEvent.create({
        data: {
          doctorId: entry.doctorId,
          entryId,
          type: 'moved_back',
          payload: { byUserId: caller.id, from: EntryStatus.IN_CONSULTATION },
        },
      }).catch(() => {});

      void this.broadcast(entry.doctorId, 'queue_updated', { entryId });
      this.gateway.emitToPatientRoom(entry.patientId, 'patient:queue:updated', {
        eventType: 'moved_back',
        entryId,
        doctorId: entry.doctorId,
      });
      return updated;
    }

    if (entry.status === EntryStatus.WAITING) {
      const allActive = await this.prisma.queueEntry.findMany({
        where: {
          doctorId: entry.doctorId,
          serviceDay,
          status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
        },
        select: { id: true, sortOrder: true, tokenNumber: true, status: true },
      });
      const sorted = [...allActive].sort((a, b) => effectivePosition(a) - effectivePosition(b));
      const idx = sorted.findIndex((e) => e.id === entryId);
      if (idx < 0) throw new NotFoundException('Entry not in queue');
      if (idx >= sorted.length - 1) {
        throw new BadRequestException('Already at the back of the queue');
      }
      return this.moveToPosition(entryId, idx + 2, caller);
    }

    throw new BadRequestException('Can only move back waiting or in-consultation entries');
  }

  // ---------- doctor-level controls ----------

  async pauseDoctor(doctorId: string, caller: AuthUser) {
    await this.clinics.assertCallerCanAccessDoctor(caller, doctorId);
    await this.prisma.doctor.update({
      where: { id: doctorId },
      data: { status: DoctorStatus.PAUSED },
    });
    void this.prisma.queueEvent.create({
      data: { doctorId, type: 'doctor_paused', payload: { byUserId: caller.id } },
    }).catch(() => {});
    void this.broadcast(doctorId, 'doctor_status', { status: DoctorStatus.PAUSED });
  }

  async resumeDoctor(doctorId: string, caller: AuthUser) {
    await this.clinics.assertCallerCanAccessDoctor(caller, doctorId);
    await this.prisma.doctor.update({
      where: { id: doctorId },
      // Also clear break fields when resuming. Feature 4.
      data: { status: DoctorStatus.AVAILABLE, breakUntil: null, breakNote: null },
    });
    void this.prisma.queueEvent.create({
      data: { doctorId, type: 'doctor_resumed', payload: { byUserId: caller.id } },
    }).catch(() => {});
    void this.broadcast(doctorId, 'doctor_status', { status: DoctorStatus.AVAILABLE });
  }

  /**
   * Start a doctor break with an estimated return time. Feature 4.
   * Sets status to PAUSED and records breakUntil / breakNote so ETA
   * calculations can add the remaining break time for all patients.
   */
  async startBreak(doctorId: string, estimatedMinutes: number, note: string | undefined, caller: AuthUser) {
    await this.clinics.assertCallerCanAccessDoctor(caller, doctorId);
    const breakUntil = new Date(Date.now() + estimatedMinutes * 60_000);
    await this.prisma.doctor.update({
      where: { id: doctorId },
      data: { status: DoctorStatus.PAUSED, breakUntil, breakNote: note ?? null },
    });
    void this.prisma.queueEvent.create({
      data: {
        doctorId,
        type: 'doctor_break',
        payload: { byUserId: caller.id, estimatedMinutes, breakUntil: breakUntil.toISOString() },
      },
    }).catch(() => {});
    void this.broadcast(doctorId, 'doctor_break', {
      status: DoctorStatus.PAUSED,
      breakUntil: breakUntil.toISOString(),
      breakNote: note ?? null,
    });
  }

  // ---------- history ----------

  async getHistory(role: Role, userId: string, date?: string, filterDoctorId?: string) {
    const serviceDay = date ?? todayKey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDay)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }

    const TERMINAL: EntryStatus[] = [
      EntryStatus.COMPLETED,
      EntryStatus.SKIPPED,
      EntryStatus.CANCELLED,
      EntryStatus.MISSED,
    ];

    let doctorIds: string[];

    if (role === Role.DOCTOR) {
      const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
      if (!doctor) throw new NotFoundException('Doctor profile not found');
      doctorIds = [doctor.id];
    } else if (role === Role.RECEPTIONIST || role === Role.CLINIC_ADMIN) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user?.clinicId) throw new ForbiddenException('Receptionist has no clinic assigned');

      if (filterDoctorId) {
        await this.clinics.assertCallerCanAccessDoctor(
          { id: userId, role, name: '', clinicId: user.clinicId },
          filterDoctorId,
        );
        doctorIds = [filterDoctorId];
      } else {
        const docs = await this.prisma.doctor.findMany({
          where: { clinicId: user.clinicId },
          select: { id: true },
        });
        doctorIds = docs.map((d) => d.id);
        if (role === Role.RECEPTIONIST) {
          const scope = await this.clinics.getAssignedDoctorIds(userId, user.clinicId);
          if (scope !== null) {
            doctorIds = doctorIds.filter((id) => scope.includes(id));
          }
        }
      }
    } else {
      if (!filterDoctorId) throw new BadRequestException('Admins must supply doctorId');
      doctorIds = [filterDoctorId];
    }

    const raw = await this.prisma.queueEntry.findMany({
      where: {
        doctorId: { in: doctorIds },
        serviceDay,
        status: { in: TERMINAL },
      },
      include: {
        patient: { select: CUSTOMER_PUBLIC_SELECT },
        doctor: {
          include: {
            user: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
          },
        },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ doctorId: 'asc' }, { tokenNumber: 'asc' }],
    });

    return raw.map((e) => {
      const waitMs =
        e.calledAt && e.joinedAt ? e.calledAt.getTime() - e.joinedAt.getTime() : null;
      const serviceStart = e.startedAt ?? e.calledAt;
      const consultMs =
        e.status === EntryStatus.COMPLETED && e.completedAt && serviceStart
          ? e.completedAt.getTime() - serviceStart.getTime()
          : null;

      return {
        id: e.id,
        tokenNumber: e.tokenNumber,
        status: e.status,
        slotType: e.slotType,
        serviceDay: e.serviceDay,
        priority: e.priority,
        notes: e.notes,
        joinedAt: e.joinedAt,
        calledAt: e.calledAt,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        waitMinutes: waitMs !== null ? Math.round(waitMs / 60_000) : null,
        consultMinutes: consultMs !== null ? Math.round(consultMs / 60_000) : null,
        patient: e.patient,
        doctor: {
          id: e.doctor.id,
          name: e.doctor.user.name,
          department: e.doctor.department.name,
        },
        createdBy: e.createdBy ?? null,
      };
    });
  }

  // ---------- bulk operations ----------

  async clearQueue(doctorId: string, options: { includeMissed?: boolean }, caller: AuthUser) {
    await this.clinics.assertCallerCanAccessDoctor(caller, doctorId);
    const serviceDay = todayKey();
    const statuses: EntryStatus[] = [EntryStatus.WAITING];
    if (options.includeMissed) statuses.push(EntryStatus.MISSED);

    const entries = await this.prisma.queueEntry.findMany({
      where: { doctorId, serviceDay, status: { in: statuses } },
      select: { id: true, patientId: true, tokenNumber: true, patient: { select: { phone: true } } },
    });

    if (!entries.length) return { cleared: 0 };

    const ids = entries.map((e) => e.id);
    await Promise.all([
      this.prisma.queueEntry.updateMany({
        where: { id: { in: ids } },
        data: { status: EntryStatus.CANCELLED, completedAt: new Date() },
      }),
      this.prisma.queueEvent.create({
        data: {
          doctorId,
          type: 'queue_cleared',
          payload: { byUserId: caller.id, count: entries.length, includeMissed: options.includeMissed ?? false },
        },
      }),
    ]);

    void this.broadcast(doctorId, 'queue_cleared', { count: entries.length });

    for (const entry of entries) {
      this.gateway.emitToPatientRoom(entry.patientId, 'patient:queue:updated', {
        eventType: 'entry_cancelled',
        entryId: entry.id,
        doctorId,
      });
      // Notify the patient that their appointment was cancelled
      if (entry.patient?.phone) {
        void this.notifications
          .notifyQueueCleared(entry.patient.phone, `#${tokenToCode(entry.tokenNumber)}`)
          .catch(() => {});
      }
    }

    return { cleared: entries.length };
  }

  async cancelMany(entryIds: string[], caller: AuthUser) {
    if (!entryIds.length) return { cancelled: 0 };

    for (const entryId of entryIds) {
      await this.verifyCallerCanAccessEntry(caller, entryId);
    }

    const entries = await this.prisma.queueEntry.findMany({
      where: {
        id: { in: entryIds },
        status: { in: [EntryStatus.WAITING, EntryStatus.MISSED] },
      },
      select: { id: true, doctorId: true, patientId: true },
    });

    if (!entries.length) return { cancelled: 0 };

    await this.prisma.queueEntry.updateMany({
      where: { id: { in: entries.map((e) => e.id) } },
      data: { status: EntryStatus.CANCELLED, completedAt: new Date() },
    });

    const byDoctor = new Map<string, typeof entries>();
    for (const e of entries) {
      if (!byDoctor.has(e.doctorId)) byDoctor.set(e.doctorId, []);
      byDoctor.get(e.doctorId)!.push(e);
    }

    for (const [did, es] of byDoctor.entries()) {
      void this.broadcast(did, 'entries_cancelled', { count: es.length });
    }

    for (const entry of entries) {
      this.gateway.emitToPatientRoom(entry.patientId, 'patient:queue:updated', {
        eventType: 'entry_cancelled',
        entryId: entry.id,
        doctorId: entry.doctorId,
      });
    }

    return { cancelled: entries.length };
  }

  // ---------- internals ----------

  private async transition(
    entryId: string,
    next: EntryStatus,
    byUserId: string | undefined,
    extra: Partial<{ calledAt: Date; startedAt: Date; completedAt: Date }>,
  ) {
    const entry = await this.prisma.queueEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Entry not found');

    const allowed: Record<EntryStatus, EntryStatus[]> = {
      WAITING: [EntryStatus.IN_CONSULTATION, EntryStatus.SKIPPED, EntryStatus.CANCELLED, EntryStatus.MISSED],
      IN_CONSULTATION: [EntryStatus.COMPLETED, EntryStatus.SKIPPED, EntryStatus.MISSED],
      COMPLETED: [],
      SKIPPED: [],
      CANCELLED: [],
      MISSED: [],
    };
    if (!allowed[entry.status].includes(next)) {
      throw new ConflictException(`Cannot transition ${entry.status} -> ${next}`);
    }

    const updateResult = await this.prisma.queueEntry.updateMany({
      where: { id: entryId, version: entry.version },
      data: { status: next, version: { increment: 1 }, ...extra },
    });
    if (updateResult.count === 0) {
      throw new ConflictException('The queue entry was updated by another process. Please retry.');
    }

    const updated = await this.prisma.queueEntry.findUnique({
      where: { id: entryId },
      include: { patient: { select: CUSTOMER_PUBLIC_SELECT } },
    });
    if (!updated) throw new NotFoundException('Entry not found after update');

    if (next === EntryStatus.COMPLETED) {
      void this.eta.invalidateCache(entry.doctorId, entry.serviceDay);
      try {
        await this.advanceWorkflowIfNeeded(updated);
      } catch (err) {
        this.logger.error('workflow advance failed', err as Error);
      }
    }

    void this.prisma.queueEvent.create({
      data: {
        doctorId: entry.doctorId,
        entryId,
        type: `entry_${next.toLowerCase()}`,
        payload: { byUserId, from: entry.status, to: next },
      },
    }).catch(() => {});
    void this.broadcast(entry.doctorId, 'queue_updated', {
      entryId,
      from: entry.status,
      to: next,
    });

    this.gateway.emitToPatientRoom(updated.patientId, 'patient:queue:updated', {
      eventType: `entry_${next.toLowerCase()}`,
      entryId,
      doctorId: entry.doctorId,
      from: entry.status,
      to: next,
    });

    return updated;
  }

  /**
   * When a clinic has a multi-step workflow, completing one step auto-enrolls
   * the patient in the next professional's queue under the same visit.
   */
  private async advanceWorkflowIfNeeded(
    completed: {
      id: string;
      doctorId: string;
      patientId: string;
      visitId: string | null;
      serviceDay: string;
      notes?: string | null;
    },
  ) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: completed.doctorId },
      select: { clinicId: true },
    });
    if (!doctor?.clinicId) return;

    const config = await this.prisma.workflowConfiguration.findUnique({
      where: { clinicId: doctor.clinicId },
    });
    if (!config) {
      if (completed.visitId) {
        await this.prisma.visit.update({
          where: { id: completed.visitId },
          data: { status: VisitStatus.COMPLETED },
        });
      }
      return;
    }

    let steps = config.steps as unknown;
    while (typeof steps === 'string') {
      try { steps = JSON.parse(steps); } catch { return; }
    }
    if (!Array.isArray(steps) || steps.length === 0) {
      if (completed.visitId) {
        await this.prisma.visit.update({
          where: { id: completed.visitId },
          data: { status: VisitStatus.COMPLETED },
        });
      }
      return;
    }

    type WorkflowStep = { doctorId?: string; name?: string };
    const workflowSteps = steps as WorkflowStep[];

    const currentIdx = await this.resolveWorkflowStepIndex(completed, workflowSteps);
    if (currentIdx < 0 || currentIdx >= workflowSteps.length - 1) {
      if (completed.visitId) {
        await this.prisma.visit.update({
          where: { id: completed.visitId },
          data: { status: VisitStatus.COMPLETED },
        });
      }
      return;
    }

    const nextStep = workflowSteps[currentIdx + 1];
    if (!nextStep?.doctorId) return;

    const existing = await this.prisma.queueEntry.findFirst({
      where: {
        patientId: completed.patientId,
        doctorId: nextStep.doctorId,
        serviceDay: completed.serviceDay,
        status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
      },
    });
    if (existing) return;

    let visitId = completed.visitId;
    if (!visitId) {
      const visit = await this.prisma.visit.findFirst({
        where: {
          clinicId: doctor.clinicId,
          patientId: completed.patientId,
          serviceDay: completed.serviceDay,
          status: VisitStatus.ACTIVE,
        },
        select: { id: true },
      });
      visitId = visit?.id ?? null;
    }

    const stepLabel = nextStep.name?.trim() || `Step ${currentIdx + 2}`;
    const newEntry = await this.createEntry({
      doctorId: nextStep.doctorId,
      patientId: completed.patientId,
      priority: 0,
      walkin: false,
      slotType: SlotType.FOLLOWUP,
      visitId: visitId ?? undefined,
      serviceDay: completed.serviceDay,
      fromWorkflow: true,
      notes: `Workflow: ${stepLabel} [workflow-step:${currentIdx + 1}]`,
    });

    await this.broadcast(nextStep.doctorId, 'workflow_advanced', { entryId: newEntry.id });
    this.gateway.emitToPatientRoom(completed.patientId, 'patient:queue:updated', {
      eventType: 'workflow_advanced',
      entryId: newEntry.id,
      doctorId: nextStep.doctorId,
      from: completed.doctorId,
      to: nextStep.doctorId,
    });
  }

  /** Which workflow step was just completed (0-based). Supports duplicate professionals in a route. */
  private async resolveWorkflowStepIndex(
    completed: {
      id: string;
      doctorId: string;
      patientId: string;
      visitId: string | null;
      serviceDay: string;
      notes?: string | null;
    },
    steps: Array<{ doctorId?: string; name?: string }>,
  ): Promise<number> {
    const tagged = completed.notes?.match(/\[workflow-step:(\d+)\]/);
    if (tagged) {
      return parseInt(tagged[1], 10);
    }

    if (completed.visitId) {
      const completedInVisit = await this.prisma.queueEntry.count({
        where: {
          visitId: completed.visitId,
          serviceDay: completed.serviceDay,
          status: EntryStatus.COMPLETED,
        },
      });
      if (completedInVisit > 0) {
        return completedInVisit - 1;
      }
    }

    return steps.findIndex((s) => s?.doctorId === completed.doctorId);
  }

  private async notifyJoinedAsync(phone: string, tokenNumber: number, doctorId: string) {
    try {
      const doctor = await this.prisma.doctor.findUnique({
        where: { id: doctorId },
        select: { user: { select: { name: true } } },
      });
      const doctorName = doctor?.user?.name ?? 'the doctor';
      await this.notifications.notifyJoined(phone, `#${tokenToCode(tokenNumber)}`, doctorName);
    } catch { /* never let notification errors surface to callers */ }
  }

  private async getNextAvailableShift(
    tx: any,
    doctorId: string,
    serviceDay: string,
    now: Date,
  ): Promise<Date | null> {
    const shifts = await tx.professionalSchedule.findMany({
      where: { doctorId, isHoliday: false },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    if (shifts.length === 0) return null;

    const currentDow = istDayOfWeek(now);
    const currentMin = istMinutesOfDay(now);

    // Filter shifts for today
    const todayShifts = shifts.filter((s) => s.dayOfWeek === currentDow);
    const activeOrFutureToday = todayShifts.find((s) => parseHmToMinutes(s.endTime) > currentMin);

    if (activeOrFutureToday) {
      return istAppointmentDate(serviceDay, activeOrFutureToday.startTime);
    }

    // Check subsequent days
    let dayOffset = 1;
    while (dayOffset <= 14) {
      const nextDayKey = addServiceDays(serviceDay, dayOffset);
      const nextDow = istDayOfWeek(istAppointmentDate(nextDayKey, '12:00'));
      const nextShifts = shifts.filter((s) => s.dayOfWeek === nextDow);
      if (nextShifts.length > 0) {
        return istAppointmentDate(nextDayKey, nextShifts[0].startTime);
      }
      dayOffset++;
    }
    return null;
  }

  private async findNextAvailableSlot(
    tx: any,
    doctorId: string,
    settings: any,
    serviceDay: string,
    now: Date,
  ): Promise<{ time: Date; slotStr: string } | null> {
    const shifts: ScheduleShift[] = await tx.professionalSchedule.findMany({
      where: { doctorId, isHoliday: false },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    if (shifts.length === 0) {
      return null;
    }

    const existingBookings = await tx.queueEntry.findMany({
      where: {
        doctorId,
        serviceDay,
        status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
        appointmentTime: { not: null },
      },
      select: { appointmentTime: true },
    });

    const bookingCounts = new Map<string, number>();
    for (const b of existingBookings) {
      if (b.appointmentTime) {
        const slotStr = istTimeSlot(b.appointmentTime);
        const day = istServiceDay(b.appointmentTime);
        const key = `${day}:${slotStr}`;
        bookingCounts.set(key, (bookingCounts.get(key) || 0) + 1);
      }
    }

    const interval = settings.appointmentInterval || 15;
    const maxCap = settings.queueMode === 'CAPACITY_TIME_SLOT' ? (settings.maxCustomersPerSlot || 3) : 1;

    const result = findNextSlot(shifts, serviceDay, now, interval, maxCap, bookingCounts);
    if (!result) return null;

    return { time: result.time, slotStr: result.slotStr };
  }

  /**
   * When a professional ends service for the current shift, move waiting bookings
   * to the next shift (same day) or the next working day's first available slots.
   */
  async endServiceShift(doctorId: string, caller: AuthUser) {
    await this.clinics.assertCallerCanAccessDoctor(caller, doctorId);

    const serviceDayKey = todayKey();
    const now = new Date();

    const [shifts, settingsRow, waiting] = await Promise.all([
      this.prisma.professionalSchedule.findMany({
        where: { doctorId },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.doctor.findUnique({
        where: { id: doctorId },
        select: { clinicId: true },
      }),
      this.prisma.queueEntry.findMany({
        where: {
          doctorId,
          serviceDay: serviceDayKey,
          status: EntryStatus.WAITING,
        },
        orderBy: [{ appointmentTime: 'asc' }, { tokenNumber: 'asc' }],
      }),
    ]);

    if (!waiting.length) return { rolled: 0, message: 'No waiting patients to roll over' };

    let settings = settingsRow?.clinicId
      ? await this.prisma.businessSetting.findUnique({ where: { clinicId: settingsRow.clinicId } })
      : null;

    const interval = settings?.appointmentInterval || 15;
    const maxCap =
      settings?.queueMode === 'CAPACITY_TIME_SLOT' ? (settings.maxCustomersPerSlot || 3) : 1;

    const activeBookings = await this.prisma.queueEntry.findMany({
      where: {
        doctorId,
        status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
        appointmentTime: { not: null },
      },
      select: { appointmentTime: true },
    });

    const bookingCounts = new Map<string, number>();
    for (const b of activeBookings) {
      if (b.appointmentTime) {
        const slotStr = istTimeSlot(b.appointmentTime);
        const day = istServiceDay(b.appointmentTime);
        const key = `${day}:${slotStr}`;
        bookingCounts.set(key, (bookingCounts.get(key) || 0) + 1);
      }
    }

    let cursor = now;
    let rolled = 0;

    for (const entry of waiting) {
      const slot = findNextSlot(shifts, serviceDayKey, cursor, interval, maxCap, bookingCounts, 14);
      if (!slot) break;

      const key = `${slot.serviceDay}:${slot.slotStr}`;
      bookingCounts.set(key, (bookingCounts.get(key) || 0) + 1);

      await this.prisma.queueEntry.update({
        where: { id: entry.id },
        data: {
          serviceDay: slot.serviceDay,
          appointmentTime: slot.time,
          appointmentSlot: slot.slotStr,
          notes: entry.notes
            ? `${entry.notes}\n[shift-rollover]`
            : '[shift-rollover]',
        },
      });

      cursor = new Date(slot.time.getTime() + interval * 60_000);
      rolled += 1;
    }

    await this.prisma.doctor.update({
      where: { id: doctorId },
      data: { status: DoctorStatus.PAUSED },
    });

    void this.broadcast(doctorId, 'shift_ended', { rolled, nextFrom: istMinutesOfDay(cursor) });

    return {
      rolled,
      remaining: waiting.length - rolled,
      message:
        rolled > 0
          ? `${rolled} booking(s) moved to the next available shift`
          : 'No upcoming shifts available for rollover',
    };
  }

  private async verifyCallerCanAccessEntry(caller: AuthUser, entryId: string): Promise<void> {
    if (caller.role !== Role.RECEPTIONIST) return;
    const entry = await this.prisma.queueEntry.findUnique({
      where: { id: entryId },
      select: { doctorId: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    await this.clinics.assertCallerCanAccessDoctor(caller, entry.doctorId);
  }

  private async broadcast(doctorId: string, eventType: string, payload: unknown) {
    try {
      const snap = await this.snapshot(doctorId);
      this.gateway.emitToDoctorRoom(doctorId, 'queue:updated', {
        doctorId,
        eventType,
        payload,
        snapshot: snap,
      });
    } catch (err) {
      this.logger.error(`broadcast failed for doctor ${doctorId}`, err as Error);
    }
  }
}
