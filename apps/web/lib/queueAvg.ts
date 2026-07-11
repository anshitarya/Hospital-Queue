import type { Snapshot } from './api';

export interface AvgDisplay {
  value: number;
  /** Pre-formatted for UI, e.g. "13", "<1" */
  label: string;
  live: boolean;
}

const MIN_ELAPSED_SEC = 1;

export function formatAvgMinutes(minutes: number): string {
  if (minutes < 1) return '<1';
  return String(Math.round(minutes));
}

/**
 * Resolves the average minutes/customer to show in the UI.
 * Prefers the server moving average; falls back to elapsed in-service time,
 * then the provider's configured default.
 */
export function resolveAvgMinutes(snapshot: Snapshot | null, now = Date.now()): AvgDisplay | null {
  if (!snapshot?.doctor) return null;

  if (snapshot.movingAvgMinutes != null) {
    const value = snapshot.movingAvgMinutes;
    return { value, label: formatAvgMinutes(value), live: true };
  }

  const inProg = snapshot.entries.find((e) => e.status === 'IN_CONSULTATION');
  const startIso = inProg?.startedAt ?? inProg?.calledAt;
  if (startIso) {
    const elapsedSec = (now - new Date(startIso).getTime()) / 1000;
    if (elapsedSec >= MIN_ELAPSED_SEC) {
      const value = elapsedSec / 60;
      return { value, label: formatAvgMinutes(value), live: true };
    }
  }

  const value = snapshot.doctor.avgConsultMinutes;
  return { value, label: formatAvgMinutes(value), live: false };
}
