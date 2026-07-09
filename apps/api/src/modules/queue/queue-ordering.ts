/**
 * Queue ordering strategies.
 *
 * Two strategies are available, controlled by FEATURES.FIFO_QUEUE_ORDERING:
 *
 *   LEGACY (default, flag = false)
 *     Walk-ins slot in gap positions after the current patient.
 *     Follow-ups interleave every N patients.
 *     Missed patients rejoin near current position + missedGap.
 *
 *   FIFO (flag = true)
 *     All patients join at the end in strict arrival order.
 *     Emergency patients are the only exception — they jump to the front.
 *     Missed patients rejoin at the END (not near current position).
 *     Walk-in and follow-up gap logic is not applied.
 *     insertAtPosition and reorder/move are unchanged in both modes.
 *
 * To switch to FIFO on Fly.io:
 *   fly secrets set FIFO_QUEUE_ORDERING=true -a queue-hq-api
 */

import { EntryStatus, PrismaClient, SlotType } from '@prisma/client';
import { clinicDefaults } from '../../config/clinic.config';

// Mirrors the type Prisma passes as `tx` inside a $transaction callback.
type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

// ─── Shared helper ────────────────────────────────────────────────────────────

export function effectivePosition(e: { sortOrder: number | null; tokenNumber: number }): number {
  return e.sortOrder ?? e.tokenNumber;
}

// ─── Input shape for sort-order computation ───────────────────────────────────

export interface OrderingInput {
  doctorId:         string;
  priority:         number;
  walkin:           boolean;
  slotType:         SlotType;
  insertAtPosition?: number;
  /** Explicit override — used when the caller already knows the target position (e.g. rejoin). */
  sortOrder?:       number;
}

// ─── FIFO strategy ────────────────────────────────────────────────────────────

export async function fifoSortOrder(
  input:      OrderingInput,
  tx:         TxClient,
  serviceDay: string,
): Promise<number | null> {
  // Explicit override always wins (caller-provided position).
  if (input.sortOrder !== undefined) return input.sortOrder;

  // Emergency: jump to the front of the waiting queue.
  if (input.priority >= 100) {
    return emergencyFront(input.doctorId, tx, serviceDay);
  }

  // Explicit position requested by receptionist.
  if (input.insertAtPosition !== undefined) {
    return insertAtPositionOrder(input.doctorId, input.insertAtPosition, tx, serviceDay);
  }

  // Everyone else (including walk-ins, follow-ups) → end of queue.
  // sortOrder = null means fallback to tokenNumber, which is always increasing → FIFO.
  return null;
}

/** Missed patients rejoin at the absolute end of the queue. */
export function fifoRejoinSortOrder(activePositions: number[]): number {
  return activePositions.length > 0
    ? activePositions[activePositions.length - 1] + 1
    : 1;
}

// ─── Legacy strategy ──────────────────────────────────────────────────────────

export async function legacySortOrder(
  input:      OrderingInput,
  tx:         TxClient,
  serviceDay: string,
): Promise<number | null> {
  if (input.sortOrder !== undefined) return input.sortOrder;

  if (input.priority >= 100) {
    return emergencyFront(input.doctorId, tx, serviceDay);
  }

  if (input.insertAtPosition !== undefined) {
    return insertAtPositionOrder(input.doctorId, input.insertAtPosition, tx, serviceDay);
  }

  if (input.walkin || input.slotType === SlotType.FOLLOWUP) {
    return walkinFollowupOrder(input, tx, serviceDay);
  }

  // Regular patient: natural token order.
  return null;
}

/**
 * Missed patients rejoin near current position + gap.
 * The gap is the doctor's configured missedGap (defaults to clinicDefaults).
 */
export function legacyRejoinSortOrder(
  lastMissedInQueue: { sortOrder: number } | null,
  activePositions:   number[],
  gap:               number,
): number {
  let basePos: number;
  if (lastMissedInQueue) {
    basePos = lastMissedInQueue.sortOrder + (gap - 1);
  } else if (activePositions.length >= gap) {
    basePos = activePositions[gap - 1];
  } else {
    basePos = activePositions.length > 0
      ? activePositions[activePositions.length - 1] + 1
      : gap;
  }

  const before = activePositions.filter((p) => p < basePos).pop();
  const after  = activePositions.find((p)   => p >= basePos);
  return before !== undefined && after !== undefined
    ? (before + after) / 2
    : basePos;
}

// ─── Shared sub-routines ──────────────────────────────────────────────────────

async function emergencyFront(
  doctorId:   string,
  tx:         TxClient,
  serviceDay: string,
): Promise<number | null> {
  const allWaiting = await tx.queueEntry.findMany({
    where:  { doctorId, serviceDay, status: EntryStatus.WAITING },
    select: { sortOrder: true, tokenNumber: true },
  });
  if (allWaiting.length === 0) return null;
  const minPos = Math.min(...allWaiting.map(effectivePosition));
  return minPos - 1;
}

async function insertAtPositionOrder(
  doctorId:         string,
  insertAtPosition: number,
  tx:               TxClient,
  serviceDay:       string,
): Promise<number> {
  const allActive = await tx.queueEntry.findMany({
    where: {
      doctorId,
      serviceDay,
      status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
    },
    select: { sortOrder: true, tokenNumber: true },
  });
  const sorted = allActive
    .map(effectivePosition)
    .sort((a, b) => a - b);

  const pos = insertAtPosition - 1; // 0-indexed
  if (pos <= 0)            return sorted.length > 0 ? sorted[0] - 0.5 : 1;
  if (pos >= sorted.length) return sorted.length > 0 ? sorted[sorted.length - 1] + 0.5 : 1;
  return (sorted[pos - 1] + sorted[pos]) / 2;
}

async function walkinFollowupOrder(
  input:      OrderingInput,
  tx:         TxClient,
  serviceDay: string,
): Promise<number> {
  const isWalkin   = input.walkin;
  const isFU       = input.slotType === SlotType.FOLLOWUP;
  const isCombined = isWalkin && isFU;
  const isFUOnly   = isFU && !isWalkin;
  const isWOOnly   = isWalkin && !isFU;

  const doctor = await tx.doctor.findUnique({
    where:  { id: input.doctorId },
    select: { walkinGap: true, followUpEvery: true },
  });
  const walkinGap   = doctor?.walkinGap ?? clinicDefaults.queue.walkinGap;
  const followUpGap = doctor?.followUpEvery && doctor.followUpEvery > 0
    ? doctor.followUpEvery : 1;
  const chainGap    = isCombined ? 3 : isFUOnly ? followUpGap : walkinGap;

  const allActive = await tx.queueEntry.findMany({
    where: {
      doctorId:  input.doctorId,
      serviceDay,
      status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
    },
    select: { id: true, sortOrder: true, tokenNumber: true },
  });
  const sorted = [...allActive].sort(
    (a, b) => effectivePosition(a) - effectivePosition(b),
  );

  // Locate the type-specific anchor entry.
  let anchorId: string | null = null;

  if (isCombined) {
    const last = await tx.queueEntry.findFirst({
      where: {
        doctorId: input.doctorId, serviceDay,
        status:   { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
        sortOrder: { not: null }, priority: { lt: 100 },
        OR: [{ walkin: true }, { slotType: SlotType.FOLLOWUP }],
      },
      orderBy: { sortOrder: 'desc' },
      select:  { id: true },
    });
    anchorId = last?.id ?? null;

  } else if (isWOOnly) {
    const lastWalkin = await tx.queueEntry.findFirst({
      where: {
        doctorId: input.doctorId, serviceDay,
        status:   { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
        sortOrder: { not: null }, priority: { lt: 100 },
        walkin: true, slotType: { not: SlotType.FOLLOWUP },
      },
      orderBy: { sortOrder: 'desc' },
      select:  { id: true },
    });
    if (lastWalkin) {
      anchorId = lastWalkin.id;
    } else {
      // No prior walk-in: anchor from the currently-serving patient.
      const serving = await tx.queueEntry.findFirst({
        where:  { doctorId: input.doctorId, serviceDay, status: EntryStatus.IN_CONSULTATION },
        select: { id: true },
      });
      anchorId = serving?.id ?? null;
    }

  } else if (isFUOnly) {
    const lastFU = await tx.queueEntry.findFirst({
      where: {
        doctorId: input.doctorId, serviceDay,
        status:   { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
        sortOrder: { not: null }, priority: { lt: 100 },
        slotType: SlotType.FOLLOWUP,
      },
      orderBy: { sortOrder: 'desc' },
      select:  { id: true },
    });
    anchorId = lastFU?.id ?? null;
  }

  const anchorIndex    = anchorId ? sorted.findIndex((e) => e.id === anchorId) : -1;
  const insertAfterIdx = anchorIndex + chainGap;

  if (sorted.length === 0 || insertAfterIdx >= sorted.length) {
    const last = sorted[sorted.length - 1];
    return last ? effectivePosition(last) + 0.5 : 1;
  }
  if (insertAfterIdx < 0) {
    return effectivePosition(sorted[0]) - 0.5;
  }
  const beforePos  = effectivePosition(sorted[insertAfterIdx]);
  const nextEntry  = sorted[insertAfterIdx + 1];
  return nextEntry
    ? (beforePos + effectivePosition(nextEntry)) / 2
    : beforePos + 0.5;
}
