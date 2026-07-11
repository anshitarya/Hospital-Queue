import { timingSafeEqual } from 'crypto';

/**
 * Constant-time comparison for 4-digit Customer PINs.
 * Returns false when lengths differ (no timing leak on length alone).
 */
export function pinsEqual(stored: string, provided: string): boolean {
  if (stored.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(stored), Buffer.from(provided));
}
