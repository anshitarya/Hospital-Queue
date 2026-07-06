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
import { DoctorStatus, EntryStatus, Prisma, Role, SlotType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { EtaService, EnrichedEntry } from './eta.service';
import { JoinQueueDto, ReorderEntryDto } from './dto/queue.dto';
import { QueueGateway } from './gateway/queue.gateway';
import { clinicDefaults } from '../../config/clinic.config';
import { NotificationsService } from '../notifications/notifications.service';

function tokenToCode(n: number): string {
  if (n <= 0) return '---';
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const M = 17576; // 26^3
  const A = 6949;
  const ADD = 3749;
  const x = (((n - 1) * A) + ADD) % M;
  return CHARS[Math.floor(x / 676)] + CHARS[Math.floor((x % 676) / 26)] + CHARS[x % 26];
}

function todayKey(): string {
  const d = new Date();
  // Use local timezone so the day resets at local midnight, not UTC midnight.
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Sort key for a queue entry: explicit sortOrder takes priority, then tokenNumber. */
function effectivePosition(e: { sortOrder: number | null; tokenNumber: number }): number {
  return e.sortOrder ?? e.tokenNumber;
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
    private readonly notifications: NotificationsService,
  ) {}

  // ---------- read paths ----------

  async snapshot(doctorId: string): Promise<{
    doctor: Awaited<ReturnType<PrismaService['doctor']['findUnique']>>;
    entries: EnrichedEntry[];
    currentToken: number | null;
    missedEntries: Array<{ id: string; tokenNumber: number; patient: { id: string; name: string; phone?: string | null } | null; completedAt: string | null; missedCount: number }>;
    movingAvgMinutes: number | null;
  }> {
    const serviceDay = todayKey();

    // Run all four independent reads in parallel to cut snapshot latency ~4×.
    const [doctor, rawEntries, missedRaw, movingAvgMinutes] = await Promise.all([
      this.prisma.doctor.findUnique({
        where: { id: doctorId },
        include: { user: true, department: true, clinic: true },
      }),
      this.prisma.queueEntry.findMany({
        where: {
          doctorId,
          serviceDay,
          status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
        },
        include: { patient: true },
        orderBy: { tokenNumber: 'asc' },
      }),
      this.prisma.queueEntry.findMany({
        where: { doctorId, serviceDay, status: EntryStatus.MISSED },
        include: { patient: { select: { id: true, name: true, phone: true } } },
        orderBy: { completedAt: 'desc' },
      }),
      this.eta.getMovingAvg(doctorId),
    ]);

    if (!doctor) throw new NotFoundException(`Doctor ${doctorId} not found`);

    // Sort in-memory by effective position so walk-ins slot in correctly.
    const entries = [...rawEntries].sort(
      (a, b) => effectivePosition(a) - effectivePosition(b),
    );

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

    const enriched = this.eta.enrich(doctor, entries, {
      movingAvgMinutes,
      breakRemainingMinutes,
    });

    const current =
      entries.find((e) => e.status === EntryStatus.IN_CONSULTATION)?.tokenNumber ?? null;

    return { doctor, entries: enriched, currentToken: current, missedEntries, movingAvgMinutes };
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

  async getPatientView(entryId: string) {
    const entry = await this.getEntry(entryId);
    const snap = await this.snapshot(entry.doctorId);
    const enrichedSelf = snap.entries.find((e) => e.id === entryId);
    return {
      entry: enrichedSelf ?? entry,
      currentToken: snap.currentToken,
      doctor: snap.doctor,
      movingAvgMinutes: snap.movingAvgMinutes,
    };
  }

  // ---------- write paths ----------

  async joinByReception(dto: JoinQueueDto, createdById?: string) {
    if (dto.idempotencyKey) {
      const cached = await this.redis.client.get(`idem:${dto.idempotencyKey}`);
      if (cached) return this.getEntry(cached);
    }

    const patient = await this.prisma.user.upsert({
      where: { phone: dto.patientPhone },
      update: { name: dto.patientName },
      create: { role: Role.PATIENT, name: dto.patientName, phone: dto.patientPhone },
    });

    const serviceDay = todayKey();

    // If the patient is in the MISSED panel, auto-rejoin instead of creating a duplicate.
    const missedEntry = await this.prisma.queueEntry.findFirst({
      where: { patientId: patient.id, doctorId: dto.doctorId, serviceDay, status: EntryStatus.MISSED },
    });
    if (missedEntry) {
      const rejoined = await this.rejoinQueue(missedEntry.id, createdById);
      if (dto.idempotencyKey) {
        await this.redis.client.set(`idem:${dto.idempotencyKey}`, rejoined.id, 'EX', 600);
      }
      await this.broadcast(dto.doctorId, 'patient_joined', { entryId: rejoined.id });
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
      createdById,
      priority: dto.priority ?? 0,
      notes: dto.notes,
      walkin: dto.walkin ?? false,
      slotType: dto.slotType === 'FOLLOWUP' ? SlotType.FOLLOWUP : SlotType.NEW,
      insertAtPosition: dto.insertAtPosition,
    });

    if (dto.idempotencyKey) {
      await this.redis.client.set(`idem:${dto.idempotencyKey}`, entry.id, 'EX', 600);
    }

    await this.broadcast(dto.doctorId, 'patient_joined', { entryId: entry.id });
    this.gateway.emitToPatientRoom(patient.id, 'patient:queue:updated', {
      eventType: 'joined',
      entryId: entry.id,
      doctorId: dto.doctorId,
    });

    // Fire-and-forget: notify patient of their queue spot (doesn't block the response)
    if (patient.phone) void this.notifyJoinedAsync(patient.phone, entry.tokenNumber, dto.doctorId);

    return entry;
  }

  async joinByPatient(patientId: string, doctorId: string, notes?: string) {
    const entry = await this.createEntry({
      doctorId,
      patientId,
      priority: 0,
      notes,
      walkin: false,
      slotType: SlotType.NEW,
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
    // Pass an explicit sortOrder when rejoining a missed patient. Feature 2.
    sortOrder?: number;
    missedCount?: number;
    insertAtPosition?: number;
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

        let sortOrder: number | null = null;

        if (input.sortOrder !== undefined) {
          // Explicit sortOrder provided (e.g. rejoin). Use it.
          sortOrder = input.sortOrder;
        } else if (input.priority >= 100) {
          // Emergency: jump to the very front of the waiting queue.
          const allWaiting = await tx.queueEntry.findMany({
            where: { doctorId: input.doctorId, serviceDay, status: EntryStatus.WAITING },
            select: { sortOrder: true, tokenNumber: true },
          });
          if (allWaiting.length > 0) {
            const minPos = Math.min(...allWaiting.map((e) => effectivePosition(e)));
            sortOrder = minPos - 1;
          }
        } else if (input.insertAtPosition !== undefined) {
          // Receptionist-specified position (1-based). Beats walk-in heuristics.
          const allActive = await tx.queueEntry.findMany({
            where: { doctorId: input.doctorId, serviceDay, status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] } },
            select: { sortOrder: true, tokenNumber: true },
          });
          const sorted = allActive
            .map((e) => effectivePosition(e))
            .sort((a, b) => a - b);
          const pos = input.insertAtPosition - 1; // 0-indexed: "insert after sorted[pos-1]"
          if (pos <= 0) {
            sortOrder = sorted.length > 0 ? sorted[0] - 0.5 : 1;
          } else if (pos >= sorted.length) {
            sortOrder = sorted.length > 0 ? sorted[sorted.length - 1] + 0.5 : 1;
          } else {
            sortOrder = (sorted[pos - 1] + sorted[pos]) / 2;
          }
        } else if (input.walkin || input.slotType === SlotType.FOLLOWUP) {
          // Gap is measured in actual queue positions (all entry types count — walk-ins,
          // follow-ups, and regular patients are all peers in the sorted list).
          // Walk-ins and follow-ups maintain independent chains so they don't interfere:
          //   • Walk-in  → anchors from the last walk-in entry
          //   • Follow-up → anchors from the last follow-up entry (starts at top of queue)
          //   • Combined  → anchors from the last special of either type, gap = 3
          const isWalkin   = input.walkin === true;
          const isFU       = input.slotType === SlotType.FOLLOWUP;
          const isCombined = isWalkin && isFU;
          const isFUOnly   = isFU && !isWalkin;
          const isWOOnly   = isWalkin && !isFU;

          const doctor = await tx.doctor.findUnique({
            where: { id: input.doctorId },
            select: { walkinGap: true, followUpEvery: true },
          });
          const walkinGap   = doctor?.walkinGap ?? clinicDefaults.queue.walkinGap;
          // followUpEvery = 1 means insert after every 1 patient (quick consultations)
          const followUpGap = (doctor?.followUpEvery && doctor.followUpEvery > 0)
            ? doctor.followUpEvery
            : 1;

          const chainGap = isCombined ? 3 : isFUOnly ? followUpGap : walkinGap;

          // Sorted snapshot of ALL active entries (emergencies included so they count
          // toward the gap, but are never used as anchors).
          const allActive = await tx.queueEntry.findMany({
            where: {
              doctorId: input.doctorId,
              serviceDay,
              status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
            },
            select: { id: true, sortOrder: true, tokenNumber: true },
          });
          const sorted = allActive.sort((a, b) => effectivePosition(a) - effectivePosition(b));

          // ── Locate the type-specific anchor ──────────────────────────────────
          let anchorId: string | null = null;

          if (isCombined) {
            // Combined: use whichever special (walk-in or follow-up) is furthest in the queue.
            const lastSpecial = await tx.queueEntry.findFirst({
              where: {
                doctorId: input.doctorId,
                serviceDay,
                status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
                sortOrder: { not: null },
                priority: { lt: 100 },
                OR: [{ walkin: true }, { slotType: SlotType.FOLLOWUP }],
              },
              orderBy: { sortOrder: 'desc' },
              select: { id: true },
            });
            anchorId = lastSpecial?.id ?? null;
          } else if (isWOOnly) {
            // Walk-in chain: anchor from the last pure walk-in.
            const lastWalkin = await tx.queueEntry.findFirst({
              where: {
                doctorId: input.doctorId,
                serviceDay,
                status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
                sortOrder: { not: null },
                priority: { lt: 100 },
                walkin: true,
                slotType: { not: SlotType.FOLLOWUP },
              },
              orderBy: { sortOrder: 'desc' },
              select: { id: true },
            });
            if (lastWalkin) {
              anchorId = lastWalkin.id;
            } else {
              // No prior walk-in: anchor from the currently-serving patient (if any).
              const serving = await tx.queueEntry.findFirst({
                where: { doctorId: input.doctorId, serviceDay, status: EntryStatus.IN_CONSULTATION },
                select: { id: true },
              });
              anchorId = serving?.id ?? null;
            }
          } else if (isFUOnly) {
            // Follow-up chain: anchor from the last follow-up.
            // If no prior follow-up exists, anchorId stays null → chainGap counts from
            // the very start of the waiting list (index -1 + followUpGap).
            const lastFU = await tx.queueEntry.findFirst({
              where: {
                doctorId: input.doctorId,
                serviceDay,
                status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
                sortOrder: { not: null },
                priority: { lt: 100 },
                slotType: SlotType.FOLLOWUP,
              },
              orderBy: { sortOrder: 'desc' },
              select: { id: true },
            });
            anchorId = lastFU?.id ?? null;
          }

          // ── Index-based insertion ─────────────────────────────────────────────
          // anchorIndex = -1 means "before the first entry" (no anchor found).
          // insertAfterIdx = anchorIndex + chainGap means "the new entry goes right
          // after the entry at insertAfterIdx in the sorted list."
          const anchorIndex = anchorId ? sorted.findIndex((e) => e.id === anchorId) : -1;
          const insertAfterIdx = anchorIndex + chainGap;

          if (sorted.length === 0 || insertAfterIdx >= sorted.length) {
            // Append after everything currently in the queue.
            const last = sorted[sorted.length - 1];
            sortOrder = last ? effectivePosition(last) + 0.5 : 1;
          } else if (insertAfterIdx < 0) {
            // Land before the very first entry.
            sortOrder = effectivePosition(sorted[0]) - 0.5;
          } else {
            // Insert between sorted[insertAfterIdx] and sorted[insertAfterIdx + 1].
            const beforePos = effectivePosition(sorted[insertAfterIdx]);
            const nextEntry  = sorted[insertAfterIdx + 1];
            sortOrder = nextEntry
              ? (beforePos + effectivePosition(nextEntry)) / 2
              : beforePos + 0.5;
          }
        }

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
          },
          include: { patient: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // ---------- transitions ----------

  async callNext(doctorId: string, byUserId?: string) {
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
        include: { patient: true },
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

    const result = await this.transition(next.id, EntryStatus.IN_CONSULTATION, byUserId, {
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

  /** Mark a patient as missed (called but didn't appear). Feature 2. */
  async markMissed(entryId: string, byUserId?: string) {
    // Increment missedCount before transitioning so the MISSED record carries the count.
    await this.prisma.queueEntry.update({
      where: { id: entryId },
      data: { missedCount: { increment: 1 } },
    });
    return this.transition(entryId, EntryStatus.MISSED, byUserId, { completedAt: new Date() });
  }

  /**
   * Re-insert a previously-missed patient near the current position + missedGap.
   * Creates a brand-new entry so the original MISSED record stays for audit. Feature 2.
   */
  async rejoinQueue(missedEntryId: string, byUserId?: string) {
    const missed = await this.prisma.queueEntry.findUnique({
      where: { id: missedEntryId },
      include: { doctor: { select: { id: true, missedGap: true } } },
    });
    if (!missed) throw new NotFoundException('Entry not found');
    if (missed.status !== EntryStatus.MISSED) {
      throw new BadRequestException('Only MISSED entries can rejoin');
    }

    const serviceDay = todayKey();
    const gap = missed.doctor.missedGap ?? clinicDefaults.queue.missedGap;

    const allActive = await this.prisma.queueEntry.findMany({
      where: {
        doctorId: missed.doctorId,
        serviceDay,
        status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
      },
      select: { sortOrder: true, tokenNumber: true },
    });
    // All active positions sorted — includes IN_CONSULTATION so the count is from the
    // very top of the queue (not just from the top of WAITING).
    const positions = allActive.map((e) => effectivePosition(e)).sort((a, b) => a - b);

    // Chain only off other missed-rejoin entries (missedCount > 0).
    // Walk-ins have sortOrder set too but can be very high — using them as an anchor
    // pushes the rejoin to the end of the queue.
    const lastMissedInQueue = await this.prisma.queueEntry.findFirst({
      where: {
        doctorId: missed.doctorId,
        serviceDay,
        status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
        sortOrder: { not: null },
        missedCount: { gt: 0 },
      },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    // First rejoin: positions[gap-1] is the gap-th patient counting from the absolute
    // top of the queue (IN_CONSULTATION + WAITING). Inserting before it places the
    // rejoin at exactly position gap overall.
    // Subsequent rejoins: chain off the last rejoin anchor + gap-1.
    let basePos: number;
    if (lastMissedInQueue) {
      basePos = lastMissedInQueue.sortOrder! + (gap - 1);
    } else if (positions.length >= gap) {
      basePos = positions[gap - 1];
    } else {
      basePos = positions.length > 0 ? positions[positions.length - 1] + 1 : gap;
    }

    const before = positions.filter((p) => p < basePos).pop();
    const after = positions.find((p) => p >= basePos);
    const sortOrder = before !== undefined && after !== undefined
      ? (before + after) / 2
      : basePos;

    const entry = await this.createEntry({
      doctorId: missed.doctorId,
      patientId: missed.patientId,
      createdById: byUserId,
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

    await this.broadcast(missed.doctorId, 'patient_rejoined', { entryId: entry.id, missedEntryId });
    this.gateway.emitToPatientRoom(missed.patientId, 'patient:queue:updated', {
      eventType: 'rejoined',
      entryId: entry.id,
      doctorId: missed.doctorId,
    });
    return entry;
  }

  async reorder(entryId: string, dto: ReorderEntryDto, byUserId?: string) {
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

  async moveToPosition(entryId: string, targetPosition: number, byUserId?: string) {
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
    await this.prisma.queueEvent.create({
      data: { doctorId: entry.doctorId, entryId, type: 'moved', payload: { byUserId, targetPosition } },
    });
    await this.broadcast(entry.doctorId, 'queue_updated', { entryId });
    this.gateway.emitToPatientRoom(entry.patientId, 'patient:queue:updated', {
      eventType: 'moved', entryId, doctorId: entry.doctorId,
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
      // Also clear break fields when resuming. Feature 4.
      data: { status: DoctorStatus.AVAILABLE, breakUntil: null, breakNote: null },
    });
    await this.prisma.queueEvent.create({
      data: { doctorId, type: 'doctor_resumed', payload: { byUserId } },
    });
    await this.broadcast(doctorId, 'doctor_status', { status: DoctorStatus.AVAILABLE });
  }

  /**
   * Start a doctor break with an estimated return time. Feature 4.
   * Sets status to PAUSED and records breakUntil / breakNote so ETA
   * calculations can add the remaining break time for all patients.
   */
  async startBreak(doctorId: string, estimatedMinutes: number, note?: string, byUserId?: string) {
    const breakUntil = new Date(Date.now() + estimatedMinutes * 60_000);
    await this.prisma.doctor.update({
      where: { id: doctorId },
      data: { status: DoctorStatus.PAUSED, breakUntil, breakNote: note ?? null },
    });
    await this.prisma.queueEvent.create({
      data: {
        doctorId,
        type: 'doctor_break',
        payload: { byUserId, estimatedMinutes, breakUntil: breakUntil.toISOString() },
      },
    });
    await this.broadcast(doctorId, 'doctor_break', {
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
    } else if (role === Role.RECEPTIONIST) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user?.clinicId) throw new ForbiddenException('Receptionist has no clinic assigned');

      if (filterDoctorId) {
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

    return raw.map((e) => {
      const waitMs =
        e.calledAt && e.joinedAt ? e.calledAt.getTime() - e.joinedAt.getTime() : null;
      const consultMs =
        e.completedAt && e.calledAt ? e.completedAt.getTime() - e.calledAt.getTime() : null;

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

  async clearQueue(doctorId: string, options: { includeMissed?: boolean }, byUserId?: string) {
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
          payload: { byUserId, count: entries.length, includeMissed: options.includeMissed ?? false },
        },
      }),
    ]);

    await this.broadcast(doctorId, 'queue_cleared', { count: entries.length });

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

  async cancelMany(entryIds: string[], byUserId?: string) {
    if (!entryIds.length) return { cancelled: 0 };

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

    await Promise.all(
      Array.from(byDoctor.entries()).map(([did, es]) =>
        this.broadcast(did, 'entries_cancelled', { count: es.length }),
      ),
    );

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

    const updated = await this.prisma.queueEntry.update({
      where: { id: entryId },
      data: { status: next, version: { increment: 1 }, ...extra },
      include: { patient: true },
    });

    // Audit log and snapshot broadcast are independent — run in parallel.
    await Promise.all([
      this.prisma.queueEvent.create({
        data: {
          doctorId: entry.doctorId,
          entryId,
          type: `entry_${next.toLowerCase()}`,
          payload: { byUserId, from: entry.status, to: next },
        },
      }),
      this.broadcast(entry.doctorId, 'queue_updated', {
        entryId,
        from: entry.status,
        to: next,
      }),
    ]);

    this.gateway.emitToPatientRoom(updated.patientId, 'patient:queue:updated', {
      eventType: `entry_${next.toLowerCase()}`,
      entryId,
      doctorId: entry.doctorId,
      from: entry.status,
      to: next,
    });

    return updated;
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
