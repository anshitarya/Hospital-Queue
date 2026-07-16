/**
 * Dynamic configuration-driven queue ordering engine.
 */

import { EntryStatus, PrismaClient, SlotType } from '@prisma/client';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export function effectivePosition(e: { sortOrder: number | null; tokenNumber: number }): number {
  return e.sortOrder ?? e.tokenNumber;
}

export interface OrderingInput {
  doctorId:         string;
  priority:         number;
  walkin:           boolean;
  slotType:         SlotType;
  insertAtPosition?: number;
  sortOrder?:       number;
}

export async function calculateSortOrder(
  input:      OrderingInput,
  tx:         TxClient,
  serviceDay: string,
  settings:   any,
): Promise<number | null> {
  if (input.sortOrder !== undefined) return input.sortOrder;

  // Emergency rule
  if (input.priority >= 100) {
    if (settings.emergencyJoinRule === 'TOP_PRIORITY') {
      return emergencyFront(input.doctorId, tx, serviceDay);
    }
  }

  // Explicit insert position
  if (input.insertAtPosition !== undefined) {
    return insertAtPositionOrder(input.doctorId, input.insertAtPosition, tx, serviceDay);
  }

  // For time-slot based systems, sort order is driven by appointmentTime first, so return null for queue order fallback
  if (settings.queueMode === 'TIME_SLOT' || settings.queueMode === 'CAPACITY_TIME_SLOT') {
    return null;
  }

  // Walk-in rule
  if (input.walkin) {
    if (settings.walkinJoinRule === 'END_OF_QUEUE') {
      return null;
    }
    if (settings.walkinJoinRule === 'AFTER_N_CUSTOMERS') {
      return insertAfterNCustomers(input.doctorId, settings.walkinJoinRuleParam ?? 4, tx, serviceDay);
    }
    if (settings.walkinJoinRule === 'PRIORITY_QUEUE') {
      return emergencyFront(input.doctorId, tx, serviceDay);
    }
  }

  // Follow-up rule
  if (input.slotType === SlotType.FOLLOWUP) {
    if (settings.followupJoinRule === 'IMMEDIATE') {
      return insertAfterNCustomers(input.doctorId, 0, tx, serviceDay);
    }
    if (settings.followupJoinRule === 'AFTER_N_CUSTOMERS') {
      return insertAfterNCustomers(input.doctorId, settings.followupJoinRuleParam ?? 4, tx, serviceDay);
    }
    if (settings.followupJoinRule === 'END_OF_QUEUE') {
      return null;
    }
  }

  return null;
}

export function calculateRejoinSortOrder(
  activePositions: number[],
  settings: any,
  lastMissedInQueue: { sortOrder: number } | null,
): number {
  const gap = settings.gracePeriod || settings.noShowTimeout || 4; // Use grace/timeout or default 4
  
  // Rejoin joins end of queue if FIFO is set, else slots in near current + gap
  if (settings.queueMode === 'TIME_SLOT' || settings.queueMode === 'CAPACITY_TIME_SLOT') {
    return activePositions.length > 0 ? activePositions[activePositions.length - 1] + 1 : 1;
  }

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

// ─── Sub-routines ──────────────────────────────────────────────────────

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

  const pos = insertAtPosition - 1; 
  if (pos <= 0)            return sorted.length > 0 ? sorted[0] - 0.5 : 1;
  if (pos >= sorted.length) return sorted.length > 0 ? sorted[sorted.length - 1] + 0.5 : 1;
  return (sorted[pos - 1] + sorted[pos]) / 2;
}

async function insertAfterNCustomers(
  doctorId:   string,
  n:          number,
  tx:         TxClient,
  serviceDay: string,
): Promise<number> {
  const allActive = await tx.queueEntry.findMany({
    where: {
      doctorId,
      serviceDay,
      status: { in: [EntryStatus.WAITING, EntryStatus.IN_CONSULTATION] },
    },
    select: { sortOrder: true, tokenNumber: true, status: true },
  });

  const sorted = [...allActive].sort(
    (a, b) => effectivePosition(a) - effectivePosition(b),
  );

  if (sorted.length === 0) return 1;

  const currentIdx = sorted.findIndex((e) => e.status === EntryStatus.IN_CONSULTATION);
  const baseIdx = currentIdx >= 0 ? currentIdx : 0;
  const targetIdx = baseIdx + n;

  if (targetIdx >= sorted.length - 1) {
    const last = sorted[sorted.length - 1];
    return last ? effectivePosition(last) + 0.5 : 1;
  }

  const beforePos = effectivePosition(sorted[targetIdx]);
  const nextEntry = sorted[targetIdx + 1];
  return nextEntry ? (beforePos + effectivePosition(nextEntry)) / 2 : beforePos + 0.5;
}
