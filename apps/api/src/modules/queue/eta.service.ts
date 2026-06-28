import { Injectable, Optional } from '@nestjs/common';
import { EntryStatus, QueueEntry } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

// Extend to include the new Doctor fields we need for ETA. Using a minimal
// shape so we don't break if the full Doctor type isn't always available.
type DoctorForEta = {
  avgConsultMinutes: number;
  delayMinutes: number;
  breakUntil?: Date | null;
  breakNote?: string | null;
};

export interface EnrichedEntry extends QueueEntry {
  // Number of waiting patients ahead in service order.
  peopleAhead: number;
  // Minutes from now until estimated start of this patient's consultation.
  etaMinutes: number;
  // ISO timestamp of estimated consultation start (Feature 5).
  etaAbsolute: string;
  // The moving average (minutes/patient) used for this estimate.
  movingAvgMinutes: number;
}

export interface EtaOptions {
  /** Pre-computed moving average from last 20 completed consultations. Falls back to doctor.avgConsultMinutes. */
  movingAvgMinutes?: number | null;
  /** Remaining break time in minutes (Feature 4). */
  breakRemainingMinutes?: number;
}

@Injectable()
export class EtaService {
  // PrismaService is optional so unit tests can instantiate EtaService(). In production
  // it is always injected by NestJS. getMovingAvg() returns null when not available.
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  /**
   * Computes a moving average of consultation duration (minutes) from the
   * last `limit` completed entries for the given doctor.
   * Returns null if there are no completed entries yet.
   */
  async getMovingAvg(doctorId: string, limit = 20): Promise<number | null> {
    if (!this.prisma) return null;
    const entries = await this.prisma.queueEntry.findMany({
      where: {
        doctorId,
        status: EntryStatus.COMPLETED,
        completedAt: { not: null },
        startedAt: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      take: limit,
      select: { startedAt: true, completedAt: true },
    });

    const durations = entries
      .filter((e) => e.startedAt && e.completedAt)
      .map((e) => (e.completedAt!.getTime() - e.startedAt!.getTime()) / 60_000);

    if (!durations.length) return null;
    return durations.reduce((sum, d) => sum + d, 0) / durations.length;
  }

  /**
   * Enriches a list of queue entries for a single doctor on a single service day.
   * `entries` MUST already be filtered to (doctorId, serviceDay) and contain all
   * WAITING + IN_CONSULTATION entries in their final sorted order — ETA math depends
   * on a complete, ordered view.
   *
   * The `options.movingAvgMinutes` should come from `getMovingAvg()` called by the
   * caller once per snapshot so we avoid redundant DB round-trips.
   */
  enrich(doctor: DoctorForEta, entries: QueueEntry[], options: EtaOptions = {}): EnrichedEntry[] {
    const avgMin = options.movingAvgMinutes ?? doctor.avgConsultMinutes;

    // Break remaining: how many minutes before doctor resumes (Feature 4).
    const breakRemainingMinutes =
      options.breakRemainingMinutes !== undefined
        ? options.breakRemainingMinutes
        : doctor.breakUntil
          ? Math.max(0, (doctor.breakUntil.getTime() - Date.now()) / 60_000)
          : 0;

    const inProgress = entries.find((e) => e.status === EntryStatus.IN_CONSULTATION);
    // Waiting list is already sorted by the caller (queue.service snapshot sorts
    // by effective position: sortOrder ?? tokenNumber). We preserve that order here.
    const waiting = entries.filter((e) => e.status === EntryStatus.WAITING);

    const remainingForCurrent = (() => {
      if (!inProgress || !inProgress.startedAt) return 0;
      const elapsedMin = Math.max(0, (Date.now() - inProgress.startedAt.getTime()) / 60_000);
      return Math.max(0, avgMin - elapsedMin);
    })();

    const baseDelay = (doctor.delayMinutes ?? 0) + breakRemainingMinutes;

    return entries.map<EnrichedEntry>((entry) => {
      if (entry.status !== EntryStatus.WAITING) {
        return {
          ...entry,
          peopleAhead: 0,
          etaMinutes: 0,
          etaAbsolute: new Date().toISOString(),
          movingAvgMinutes: Math.round(avgMin),
        };
      }
      const idx = waiting.findIndex((w) => w.id === entry.id);
      const peopleAhead = idx;
      const etaMin = remainingForCurrent + baseDelay + peopleAhead * avgMin;
      return {
        ...entry,
        peopleAhead,
        etaMinutes: Math.round(etaMin),
        etaAbsolute: new Date(Date.now() + etaMin * 60_000).toISOString(),
        movingAvgMinutes: Math.round(avgMin),
      };
    });
  }
}
