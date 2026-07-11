import { Injectable, Optional, Logger } from '@nestjs/common';
import { EntryStatus, QueueEntry } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

type DoctorForEta = {
  avgConsultMinutes: number;
  delayMinutes: number;
  breakUntil?: Date | null;
  breakNote?: string | null;
};

export interface EnrichedEntry extends QueueEntry {
  peopleAhead: number;
  etaMinutes: number;
  etaAbsolute: string;
  movingAvgMinutes: number;
}

export interface EtaOptions {
  movingAvgMinutes?: number | null;
  breakRemainingMinutes?: number;
}

// ─── Algorithm constants ──────────────────────────────────────────────────────

/**
 * EMA smoothing factor. α=0.3 weights recent consultations meaningfully
 * without overreacting to a single fast or slow session.
 *
 * Weight breakdown with α=0.3:
 *   Most recent:  30%
 *   2nd recent:   21%
 *   3rd recent:   14.7%
 *   4th recent:   10.3%
 *   …tailing off naturally — no hard cutoff.
 */
const EMA_ALPHA = 0.3;

/**
 * Window of past consultations to pull from DB.
 * 20 gives enough data for stable IQR bounds without going too far back in time.
 */
const WINDOW = 20;

/**
 * IQR fence multiplier. 1.5 is the standard Tukey fence — catches "doctor
 * went to lunch" (90 min) and "patient walked in, left, came back" outliers
 * without being too aggressive on naturally long consultations.
 */
const IQR_FENCE = 1.5;

/**
 * Minimum service duration (seconds) to count toward the moving average.
 * Filters accidental double-click completions, not real fast sessions.
 */
const MIN_DURATION_SEC = 1;

/** Redis TTL for cached moving average. Invalidated on every completion. */
const CACHE_TTL_SEC = 600; // 10 minutes

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class EtaService {
  private readonly logger = new Logger(EtaService.name);

  // Both are optional so unit tests can instantiate EtaService() with no args.
  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  // ── Cache management ────────────────────────────────────────────────────────

  private cacheKey(doctorId: string, serviceDay?: string) {
    return serviceDay ? `eta:avg:${doctorId}:${serviceDay}` : `eta:avg:${doctorId}`;
  }

  /**
   * Call this whenever a consultation completes for a doctor.
   * Removes the cached average so the next snapshot recomputes from fresh data.
   */
  async invalidateCache(doctorId: string, serviceDay?: string): Promise<void> {
    try {
      await this.redis?.client.del(this.cacheKey(doctorId, serviceDay));
      // Legacy key (pre serviceDay scoping)
      await this.redis?.client.del(this.cacheKey(doctorId));
    } catch {
      // Cache invalidation failure is non-fatal — worst case we serve a slightly
      // stale average until the TTL expires.
    }
  }

  /**
   * Elapsed minutes for the patient currently in service. Used as a live estimate
   * when no completed consultations exist yet (e.g. first customer of the day).
   */
  inProgressAvg(entry: { startedAt?: Date | null; calledAt?: Date | null } | undefined): number | null {
    if (!entry) return null;
    const start = entry.startedAt ?? entry.calledAt;
    if (!start) return null;
    const elapsed = (Date.now() - start.getTime()) / 60_000;
    return elapsed >= MIN_DURATION_SEC / 60 ? elapsed : null;
  }

  // ── Moving average ──────────────────────────────────────────────────────────

  /**
   * Returns an EMA of recent consultation durations for the given doctor.
   *
   * Algorithm:
   *   1. Fetch last WINDOW completed consultations from DB (or Redis cache).
   *   2. Strip durations below MIN_DURATION_MIN (accidental completions).
   *   3. Apply IQR fencing (Tukey 1.5×IQR) to remove outliers.
   *   4. Compute EMA (α=0.3, oldest→newest) on the cleaned set.
   *   5. Cache in Redis with TTL=10min; invalidated on each completion.
   *
   * Returns null if there are no valid completions yet (caller falls back to
   * doctor.avgConsultMinutes which is set at onboarding time).
   */
  async getMovingAvg(
    doctorId: string,
    options: { skipCache?: boolean; serviceDay?: string } = {},
  ): Promise<number | null> {
    if (!this.prisma) return null;

    const { skipCache = false, serviceDay } = options;

    // ── 1. Cache read ─────────────────────────────────────────────────────────
    const key = this.cacheKey(doctorId, serviceDay);
    if (!skipCache) {
      try {
        const cached = await this.redis?.client.get(key);
        if (cached !== null && cached !== undefined) {
          const parsed = parseFloat(cached);
          if (!isNaN(parsed)) return parsed;
        }
      } catch {
        // Redis unavailable — compute fresh from DB.
      }
    }

    // ── 2. DB read ────────────────────────────────────────────────────────────
    const rows = await this.prisma.queueEntry.findMany({
      where: {
        doctorId,
        status: EntryStatus.COMPLETED,
        completedAt: { not: null },
        OR: [{ startedAt: { not: null } }, { calledAt: { not: null } }],
        ...(serviceDay ? { serviceDay } : {}),
      },
      orderBy: { completedAt: 'desc' },
      take: WINDOW,
      select: { startedAt: true, calledAt: true, completedAt: true },
    });

    // ── 3. Duration extraction ────────────────────────────────────────────────
    const raw = rows
      .map((r) => {
        const start = r.startedAt ?? r.calledAt;
        if (!start || !r.completedAt) return null;
        return (r.completedAt.getTime() - start.getTime()) / 60_000;
      })
      .filter((d): d is number => d !== null && d >= MIN_DURATION_SEC / 60);

    if (raw.length === 0) return null;

    // ── 4. IQR outlier removal ────────────────────────────────────────────────
    const cleaned = removeOutliers(raw);
    if (cleaned.length === 0) return null;

    // ── 5. EMA (oldest → newest) ──────────────────────────────────────────────
    // DB returns newest-first; reverse so EMA runs oldest→newest.
    const ordered = [...cleaned].reverse();
    const avg = ema(ordered, EMA_ALPHA);

    // ── 6. Cache write ────────────────────────────────────────────────────────
    try {
      await this.redis?.client.set(key, avg.toFixed(4), 'EX', CACHE_TTL_SEC);
    } catch {
      // Non-fatal.
    }

    this.logger.debug(
      `ETA avg for ${doctorId}: ${avg.toFixed(1)} min (${cleaned.length}/${raw.length} samples after outlier removal)`,
    );

    return avg;
  }

  // ── Enrichment ──────────────────────────────────────────────────────────────

  /**
   * Attaches ETA fields to each entry in the active queue for a single doctor.
   *
   * Inputs must be:
   *   - Filtered to one (doctorId, serviceDay) pair
   *   - Containing ALL WAITING + IN_CONSULTATION entries
   *   - Already sorted by effective position (sortOrder ?? tokenNumber)
   *
   * ETA formula per patient:
   *   eta = remainingForCurrentPatient + breakRemaining + (peopleAhead × avgMin)
   *
   * Where:
   *   remainingForCurrentPatient = max(0, avgMin - elapsed)
   *   elapsed = now - consultation.startedAt
   */
  enrich(doctor: DoctorForEta, entries: QueueEntry[], options: EtaOptions = {}): EnrichedEntry[] {
    const avgMin =
      options.movingAvgMinutes != null
        ? options.movingAvgMinutes
        : doctor.avgConsultMinutes;

    const breakRemainingMinutes =
      options.breakRemainingMinutes !== undefined
        ? options.breakRemainingMinutes
        : doctor.breakUntil
          ? Math.max(0, (doctor.breakUntil.getTime() - Date.now()) / 60_000)
          : 0;

    const inProgress = entries.find((e) => e.status === EntryStatus.IN_CONSULTATION);
    const waiting    = entries.filter((e) => e.status === EntryStatus.WAITING);

    // How many minutes remain for the patient currently in consultation.
    // Clamps to 0 if the consultation has already overrun the average — we
    // never add negative time to downstream patients' ETAs.
    const remainingForCurrent = (() => {
      if (!inProgress) return 0;
      const start = inProgress.startedAt ?? inProgress.calledAt;
      if (!start) return 0;
      const elapsedMin = (Date.now() - start.getTime()) / 60_000;
      return Math.max(0, avgMin - elapsedMin);
    })();

    const baseDelay = (doctor.delayMinutes ?? 0) + breakRemainingMinutes;

    return entries.map<EnrichedEntry>((entry) => {
      if (entry.status !== EntryStatus.WAITING) {
        return {
          ...entry,
          peopleAhead:      0,
          etaMinutes:       0,
          etaAbsolute:      new Date().toISOString(),
          movingAvgMinutes: Math.round(avgMin),
        };
      }

      const idx        = waiting.findIndex((w) => w.id === entry.id);
      const peopleAhead = idx; // 0 = next in line
      const etaMin     = remainingForCurrent + baseDelay + peopleAhead * avgMin;

      return {
        ...entry,
        peopleAhead,
        etaMinutes:       Math.round(etaMin),
        etaAbsolute:      new Date(Date.now() + etaMin * 60_000).toISOString(),
        movingAvgMinutes: Math.round(avgMin),
      };
    });
  }
}

// ─── Pure algorithm helpers (exported for unit tests) ────────────────────────

/**
 * Removes outliers from a list of durations using Tukey's IQR fence.
 *
 * Works on any sample size ≥ 2. Returns the original array unchanged when
 * there are fewer than 4 points (not enough for meaningful quartiles).
 */
export function removeOutliers(durations: number[]): number[] {
  if (durations.length < 4) return durations;

  const sorted = [...durations].sort((a, b) => a - b);
  const q1  = percentile(sorted, 25);
  const q3  = percentile(sorted, 75);
  const iqr = q3 - q1;

  const lo = q1 - IQR_FENCE * iqr;
  const hi = q3 + IQR_FENCE * iqr;

  const cleaned = durations.filter((d) => d >= lo && d <= hi);

  // Safety net: if filtering removed everything (very uniform data where IQR≈0),
  // return the original set rather than producing no data at all.
  return cleaned.length > 0 ? cleaned : durations;
}

/**
 * Exponential Moving Average over an ordered series (oldest index 0 → newest last).
 *
 * ema[0] = series[0]
 * ema[i] = α × series[i] + (1 − α) × ema[i−1]
 *
 * Returns the final EMA value (the most alpha-weighted estimate).
 */
export function ema(series: number[], alpha: number): number {
  if (series.length === 0) return 0;
  return series.reduce((prev, cur) => alpha * cur + (1 - alpha) * prev);
}

/** Linear interpolation percentile on a pre-sorted array. */
function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
