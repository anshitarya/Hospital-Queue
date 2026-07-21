/**
 * Dynamic configuration-driven queue ordering engine.
 */

import { EntryStatus, PrismaClient, SlotType } from '@prisma/client';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export function effectivePosition(e: { sortOrder: number | null; tokenNumber: number }): number {
  return e.sortOrder ?? e.tokenNumber;
}

/** Same order as the live queue UI: day → appointment time → token/sortOrder. */
export function compareActiveEntries(
  a: {
    serviceDay: string;
    appointmentTime?: Date | null;
    sortOrder: number | null;
    tokenNumber: number;
  },
  b: {
    serviceDay: string;
    appointmentTime?: Date | null;
    sortOrder: number | null;
    tokenNumber: number;
  },
): number {
  if (a.serviceDay !== b.serviceDay) return a.serviceDay.localeCompare(b.serviceDay);
  const timeA = a.appointmentTime ? new Date(a.appointmentTime).getTime() : Infinity;
  const timeB = b.appointmentTime ? new Date(b.appointmentTime).getTime() : Infinity;
  if (timeA !== timeB) return timeA - timeB;
  return effectivePosition(a) - effectivePosition(b);
}

type MovableEntry = {
  id: string;
  sortOrder: number | null;
  tokenNumber: number;
  status: EntryStatus;
  serviceDay: string;
  appointmentTime: Date | null;
  appointmentSlot: string | null;
};

/** Manual drag/move: pick sortOrder + adopt neighbor schedule so order persists across days/slots. */
export function computeManualMoveData(
  entry: MovableEntry,
  peers: MovableEntry[],
  targetPosition: number,
): { sortOrder: number; serviceDay: string; appointmentTime: Date | null; appointmentSlot: string | null } {
  // Restrict move scope to the entry's serviceDay so order moves stay within that day's schedule
  const dayPeers = peers.filter((e) => e.serviceDay === entry.serviceDay);
  const waitingSorted = [...dayPeers.filter((e) => e.status === EntryStatus.WAITING), entry].sort(
    compareActiveEntries,
  );
  const without = waitingSorted.filter((e) => e.id !== entry.id);
  const pos = Math.max(0, Math.min(targetPosition - 1, without.length));
  const before = without[pos - 1] ?? null;
  const after = without[pos] ?? null;
  const slotSource = after ?? before ?? entry;

  let sortOrder: number;
  if (!before && !after) {
    sortOrder = 1;
  } else if (!before) {
    sortOrder = effectivePosition(after!) - 0.5;
  } else if (!after) {
    sortOrder = effectivePosition(before) + 0.5;
  } else {
    sortOrder = (effectivePosition(before) + effectivePosition(after)) / 2;
  }

  return {
    sortOrder,
    serviceDay: entry.serviceDay,
    appointmentTime: slotSource.serviceDay === entry.serviceDay ? slotSource.appointmentTime : entry.appointmentTime,
    appointmentSlot: slotSource.serviceDay === entry.serviceDay ? slotSource.appointmentSlot : entry.appointmentSlot,
  };
}

export interface OrderingInput {
  doctorId:         string;
  priority:         number;
  walkin:           boolean;
  slotType:         SlotType;
  insertAtPosition?: number;
  sortOrder?:       number | null;
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

  // Walk-in and Follow-up rules are bypassed to always add patients to the end of the queue
  // (unless an explicit position or emergency priority is specified)
  return null;
}

export function calculateRejoinSortOrder(
  activePositions: number[],
  settings: any,
  lastMissedInQueue: { sortOrder: number } | null,
): number | null {
  // Always return null to rejoin at the end of the queue (FIFO ordering)
  return null;
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
      status: EntryStatus.WAITING, // Only count waiting patients to align with UI positions
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
