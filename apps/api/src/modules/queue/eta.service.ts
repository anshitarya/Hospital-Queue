import { Injectable } from '@nestjs/common';
import { Doctor, EntryStatus, QueueEntry } from '@prisma/client';

export interface EnrichedEntry extends QueueEntry {
  // Number of waiting patients ahead in service order (ignoring the current in-consultation one).
  peopleAhead: number;
  // Minutes from now until estimated start of this patient's consultation.
  etaMinutes: number;
}

/**
 * ETA model (intentionally simple for V1):
 *
 *   etaMinutes(entry) =
 *       remainingForCurrentInConsultation
 *     + peopleAhead * doctor.avgConsultMinutes
 *     + doctor.delayMinutes
 *
 * "Ahead" ordering = (priority DESC, joinedAt ASC). Emergency entries (priority 100)
 * jump ahead of normal ones automatically.
 *
 * Future improvements (not in V1):
 *   - learn avgConsultMinutes from completed history (rolling average per doctor)
 *   - per-time-of-day adjustment
 *   - confidence interval (best/worst case)
 */
@Injectable()
export class EtaService {
  /**
   * Enriches a list of queue entries for a single doctor on a single service day.
   * `entries` MUST already be filtered to (doctorId, serviceDay) and contain
   * all WAITING + IN_CONSULTATION entries — the math depends on a complete view.
   */
  enrich(doctor: Doctor, entries: QueueEntry[]): EnrichedEntry[] {
    const inProgress = entries.find((e) => e.status === EntryStatus.IN_CONSULTATION);
    const waiting = entries
      .filter((e) => e.status === EntryStatus.WAITING)
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.joinedAt.getTime() - b.joinedAt.getTime();
      });

    const remainingForCurrent = (() => {
      if (!inProgress || !inProgress.startedAt) return 0;
      const elapsedMs = Date.now() - inProgress.startedAt.getTime();
      const elapsedMin = Math.max(0, elapsedMs / 60_000);
      return Math.max(0, doctor.avgConsultMinutes - elapsedMin);
    })();

    return entries.map<EnrichedEntry>((entry) => {
      if (entry.status !== EntryStatus.WAITING) {
        return { ...entry, peopleAhead: 0, etaMinutes: 0 };
      }
      const idx = waiting.findIndex((w) => w.id === entry.id);
      const peopleAhead = idx; // 0-based index in the waiting list
      const eta =
        remainingForCurrent +
        peopleAhead * doctor.avgConsultMinutes +
        (doctor.delayMinutes ?? 0);
      return { ...entry, peopleAhead, etaMinutes: Math.round(eta) };
    });
  }
}
