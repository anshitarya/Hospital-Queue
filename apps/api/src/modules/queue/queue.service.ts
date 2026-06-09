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
import { DoctorStatus, EntryStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { EtaService, EnrichedEntry } from './eta.service';
import { JoinQueueDto, ReorderEntryDto } from './dto/queue.dto';
import { QueueGateway } from './gateway/queue.gateway';

function todayKey(): string {
  // YYYY-MM-DD in UTC. Replace with clinic timezone if multi-region later.
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eta: EtaService,
    @Inject(forwardRef(() => QueueGateway))
    private readonly gateway: QueueGateway,
  ) {}

  // ---------- read paths ----------

  async snapshot(doctorId: string): Promise<{
    doctor: Awaited<ReturnType<PrismaService['doctor']['findUnique']>>;
    entries: EnrichedEntry[];
    currentToken: number | null;
  }> {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      // Include clinic so patient & doctor dashboards can show
      // "{Clinic name} → {Doctor name}" without an extra fetch.
      include: { user: true, department: true, clinic: true },
    });
    if (!doctor) throw new NotFoundException(`Doctor ${doctorId} not found`);

    const serviceDay = todayKey();
    const entries = await this.prisma.queueEntry.findMany({
      where: {
        doctorId,
        serviceDay,
        status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
      },
      include: { patient: true },
      orderBy: { tokenNumber: 'asc' },
    });

    const enriched = this.eta.enrich(doctor, entries);
    const current =
      entries.find((e) => e.status === EntryStatus.IN_CONSULTATION)?.tokenNumber ?? null;

    return { doctor, entries: enriched, currentToken: current };
  }

  async getEntry(entryId: string) {
    const entry = await this.prisma.queueEntry.findUnique({
      where: { id: entryId },
      include: {
        patient: true,
        doctor: { include: { user: true, department: true, clinic: true } },
      },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    return entry;
  }

  /**
   * Returns the same payload the patient screen renders — denormalized + ETA.
   * Used by the patient app on initial load.
   */
  async getPatientView(entryId: string) {
    const entry = await this.getEntry(entryId);
    const snap = await this.snapshot(entry.doctorId);
    const enrichedSelf = snap.entries.find((e) => e.id === entryId);
    return {
      entry: enrichedSelf ?? entry,
      currentToken: snap.currentToken,
      doctor: snap.doctor,
    };
  }

  // ---------- write paths ----------

  async joinByReception(dto: JoinQueueDto, createdById?: string) {
    // Idempotency: replay-safe via Redis-cached entry id for the key.
    if (dto.idempotencyKey) {
      const cached = await this.redis.client.get(`idem:${dto.idempotencyKey}`);
      if (cached) return this.getEntry(cached);
    }

    // Upsert patient by phone. Reception's most common case is a returning patient.
    const patient = await this.prisma.user.upsert({
      where: { phone: dto.patientPhone },
      update: { name: dto.patientName },
      create: { role: Role.PATIENT, name: dto.patientName, phone: dto.patientPhone },
    });

    const entry = await this.createEntry({
      doctorId: dto.doctorId,
      patientId: patient.id,
      createdById,
      priority: dto.priority ?? 0,
      notes: dto.notes,
    });

    if (dto.idempotencyKey) {
      await this.redis.client.set(`idem:${dto.idempotencyKey}`, entry.id, 'EX', 600);
    }

    await this.broadcast(dto.doctorId, 'patient_joined', { entryId: entry.id });
    // Patient's own private room — wakes their dashboard up the instant they
    // are checked in, no matter which doctor it was. They might not have any
    // doctor's room joined yet.
    this.gateway.emitToPatientRoom(patient.id, 'patient:queue:updated', {
      eventType: 'joined',
      entryId: entry.id,
      doctorId: dto.doctorId,
    });
    return entry;
  }

  async joinByPatient(patientId: string, doctorId: string, notes?: string) {
    const entry = await this.createEntry({
      doctorId,
      patientId,
      priority: 0,
      notes,
    });
    await this.broadcast(doctorId, 'patient_joined', { entryId: entry.id });
    this.gateway.emitToPatientRoom(patientId, 'patient:queue:updated', {
      eventType: 'joined',
      entryId: entry.id,
      doctorId,
    });
    return entry;
  }

  /**
   * Allocates the next token number atomically.
   * Uses a SERIALIZABLE transaction so two concurrent joins can't claim the same number.
   */
  private async createEntry(input: {
    doctorId: string;
    patientId: string;
    createdById?: string;
    priority: number;
    notes?: string;
  }) {
    const serviceDay = todayKey();
    return this.prisma.$transaction(
      async (tx) => {
        const last = await tx.queueEntry.findFirst({
          where: { doctorId: input.doctorId, serviceDay },
          orderBy: { tokenNumber: 'desc' },
          select: { tokenNumber: true },
        });
        const tokenNumber = (last?.tokenNumber ?? 0) + 1;

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
          },
          include: { patient: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // ---------- transitions ----------
  //
  // All transitions go through `transition()` which:
  //   - checks the current status (state machine guard)
  //   - bumps `version` (optimistic lock for clients that pass expectedVersion)
  //   - writes an audit row to QueueEvent
  //   - broadcasts the new snapshot to subscribers

  async callNext(doctorId: string, byUserId?: string) {
    const { entries } = await this.snapshot(doctorId);

    const alreadyInProgress = entries.find((e) => e.status === EntryStatus.IN_CONSULTATION);
    if (alreadyInProgress) {
      throw new ConflictException(
        `Doctor already has token #${alreadyInProgress.tokenNumber} in consultation`,
      );
    }

    const waiting = entries
      .filter((e) => e.status === EntryStatus.WAITING)
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.joinedAt.getTime() - b.joinedAt.getTime();
      });
    const next = waiting[0];
    if (!next) throw new NotFoundException('No patients waiting');

    return this.transition(next.id, EntryStatus.IN_CONSULTATION, byUserId, {
      calledAt: new Date(),
      startedAt: new Date(),
    });
  }

  async complete(entryId: string, byUserId?: string) {
    return this.transition(entryId, EntryStatus.COMPLETED, byUserId, {
      completedAt: new Date(),
    });
  }

  async skip(entryId: string, byUserId?: string) {
    return this.transition(entryId, EntryStatus.SKIPPED, byUserId, { completedAt: new Date() });
  }

  async cancel(entryId: string, byUserId?: string) {
    return this.transition(entryId, EntryStatus.CANCELLED, byUserId, { completedAt: new Date() });
  }

  async reorder(entryId: string, dto: ReorderEntryDto, byUserId?: string) {
    const entry = await this.prisma.queueEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.status !== EntryStatus.WAITING) {
      throw new BadRequestException('Can only reorder waiting entries');
    }

    const updated = await this.prisma.queueEntry.update({
      where: { id: entryId },
      data: { priority: dto.priority, version: { increment: 1 } },
    });

    await this.prisma.queueEvent.create({
      data: {
        doctorId: entry.doctorId,
        entryId,
        type: 'reordered',
        payload: { byUserId, newPriority: dto.priority },
      },
    });

    await this.broadcast(entry.doctorId, 'queue_updated', { entryId });
    this.gateway.emitToPatientRoom(entry.patientId, 'patient:queue:updated', {
      eventType: 'reordered',
      entryId,
      doctorId: entry.doctorId,
    });
    return updated;
  }

  // ---------- doctor-level controls ----------

  async pauseDoctor(doctorId: string, byUserId?: string) {
    await this.prisma.doctor.update({
      where: { id: doctorId },
      data: { status: DoctorStatus.PAUSED },
    });
    await this.prisma.queueEvent.create({
      data: { doctorId, type: 'doctor_paused', payload: { byUserId } },
    });
    await this.broadcast(doctorId, 'doctor_status', { status: DoctorStatus.PAUSED });
  }

  async resumeDoctor(doctorId: string, byUserId?: string) {
    await this.prisma.doctor.update({
      where: { id: doctorId },
      data: { status: DoctorStatus.AVAILABLE },
    });
    await this.prisma.queueEvent.create({
      data: { doctorId, type: 'doctor_resumed', payload: { byUserId } },
    });
    await this.broadcast(doctorId, 'doctor_status', { status: DoctorStatus.AVAILABLE });
  }

  // ---------- history ----------

  /**
   * Returns completed/skipped/cancelled queue entries for a given service day.
   *
   * Access rules:
   *   DOCTOR      → always sees only their own queue (doctorId param ignored).
   *   RECEPTIONIST → sees all doctors in their clinic; may filter by doctorId.
   *   ADMIN        → may pass any doctorId explicitly.
   *
   * @param role      - caller's role
   * @param userId    - caller's user-table id
   * @param date      - service day in YYYY-MM-DD format (defaults to today)
   * @param doctorId  - optional filter (RECEPTIONIST / ADMIN only)
   */
  async getHistory(
    role: Role,
    userId: string,
    date?: string,
    filterDoctorId?: string,
  ) {
    // Validate / default the date
    const serviceDay = date ?? todayKey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDay)) {
      throw new BadRequestException('date must be YYYY-MM-DD');
    }

    const TERMINAL: EntryStatus[] = [
      EntryStatus.COMPLETED,
      EntryStatus.SKIPPED,
      EntryStatus.CANCELLED,
    ];

    // Build the list of doctor IDs we're allowed to query
    let doctorIds: string[];

    if (role === Role.DOCTOR) {
      // Doctors can only see their own queue history
      const doctor = await this.prisma.doctor.findUnique({ where: { userId } });
      if (!doctor) throw new NotFoundException('Doctor profile not found');
      doctorIds = [doctor.id];
    } else if (role === Role.RECEPTIONIST) {
      // Receptionist sees all doctors in their clinic
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user?.clinicId) throw new ForbiddenException('Receptionist has no clinic assigned');

      if (filterDoctorId) {
        // Validate the requested doctor belongs to this clinic
        const doc = await this.prisma.doctor.findFirst({
          where: { id: filterDoctorId, clinicId: user.clinicId },
        });
        if (!doc) throw new ForbiddenException('Doctor does not belong to your clinic');
        doctorIds = [filterDoctorId];
      } else {
        const docs = await this.prisma.doctor.findMany({
          where: { clinicId: user.clinicId },
          select: { id: true },
        });
        doctorIds = docs.map((d) => d.id);
      }
    } else {
      // ADMIN — must supply a doctorId explicitly
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
        patient: { select: { id: true, name: true, phone: true } },
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

    // Compute derived durations on the server so the frontend is dumb-simple
    return raw.map((e) => {
      const waitMs =
        e.calledAt && e.joinedAt
          ? e.calledAt.getTime() - e.joinedAt.getTime()
          : null;
      const consultMs =
        e.completedAt && e.calledAt
          ? e.completedAt.getTime() - e.calledAt.getTime()
          : null;

      return {
        id: e.id,
        tokenNumber: e.tokenNumber,
        status: e.status,
        serviceDay: e.serviceDay,
        priority: e.priority,
        notes: e.notes,
        joinedAt: e.joinedAt,
        calledAt: e.calledAt,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        // Minutes rounded to nearest integer; null when timestamps are missing
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
      WAITING: [EntryStatus.IN_CONSULTATION, EntryStatus.SKIPPED, EntryStatus.CANCELLED],
      IN_CONSULTATION: [EntryStatus.COMPLETED, EntryStatus.SKIPPED],
      COMPLETED: [],
      SKIPPED: [],
      CANCELLED: [],
    };
    if (!allowed[entry.status].includes(next)) {
      throw new ConflictException(`Cannot transition ${entry.status} -> ${next}`);
    }

    const updated = await this.prisma.queueEntry.update({
      where: { id: entryId },
      data: { status: next, version: { increment: 1 }, ...extra },
      include: { patient: true },
    });

    await this.prisma.queueEvent.create({
      data: {
        doctorId: entry.doctorId,
        entryId,
        type: `entry_${next.toLowerCase()}`,
        payload: { byUserId, from: entry.status, to: next },
      },
    });

    await this.broadcast(entry.doctorId, 'queue_updated', {
      entryId,
      from: entry.status,
      to: next,
    });

    // Always notify the affected patient too — they might be on /patient
    // without subscribing to this doctor (e.g., before their entry was visible
    // to them, or if they only watch their own private stream).
    this.gateway.emitToPatientRoom(updated.patientId, 'patient:queue:updated', {
      eventType: `entry_${next.toLowerCase()}`,
      entryId,
      doctorId: entry.doctorId,
      from: entry.status,
      to: next,
    });

    return updated;
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
