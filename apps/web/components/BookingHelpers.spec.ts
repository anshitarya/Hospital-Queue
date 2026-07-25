import { describe, expect, it } from 'vitest';
import { hasActiveBooking, isLiveQueueMode } from '@/lib/bookingHelpers';

// ─── hasActiveBooking ─────────────────────────────────────────────────────────

const TODAY = '2026-07-24';

describe('hasActiveBooking', () => {
  const booking = (doctorId: string, locationId: string | null | undefined = undefined) => ({
    doctorId,
    locationId,
    serviceDay: TODAY,
  });

  it('returns false when there are no active bookings', () => {
    expect(hasActiveBooking([], 'doc-1', 'loc-delhi')).toBe(false);
  });

  it('returns false for a different doctor', () => {
    const bookings = [booking('doc-2', 'loc-delhi')];
    expect(hasActiveBooking(bookings, 'doc-1', 'loc-delhi')).toBe(false);
  });

  // ── Same doctor / different branch ───────────────────────────────────────
  it('ALLOWS booking same doctor at a different branch when both locationIds are known', () => {
    const bookings = [booking('doc-1', 'loc-delhi')];
    // Patient already in queue for doc-1@delhi, now trying to book doc-1@kota
    expect(hasActiveBooking(bookings, 'doc-1', 'loc-kota')).toBe(false);
  });

  it('BLOCKS booking same doctor at the same branch when both locationIds are known', () => {
    const bookings = [booking('doc-1', 'loc-delhi')];
    expect(hasActiveBooking(bookings, 'doc-1', 'loc-delhi')).toBe(true);
  });

  // ── Missing locationId on stored entry ───────────────────────────────────
  it('ALLOWS booking when stored entry has no locationId but target branch is known', () => {
    // Entry was created before locationId tracking — we can't confirm it's the
    // same branch, so we should allow (not block) the new booking.
    const bookings = [booking('doc-1', null)];
    expect(hasActiveBooking(bookings, 'doc-1', 'loc-delhi')).toBe(false);
  });

  it('ALLOWS when stored entry locationId is undefined and target is known', () => {
    const bookings = [booking('doc-1', undefined)];
    expect(hasActiveBooking(bookings, 'doc-1', 'loc-kota')).toBe(false);
  });

  // ── Legacy: no locationId on either side ─────────────────────────────────
  it('BLOCKS when no locationId on either side (legacy safe fallback)', () => {
    const bookings = [booking('doc-1', null)];
    // No target locationId provided → old behaviour
    expect(hasActiveBooking(bookings, 'doc-1', undefined)).toBe(true);
  });

  it('BLOCKS when no locationId on either side (undefined target)', () => {
    const bookings = [booking('doc-1')];
    expect(hasActiveBooking(bookings, 'doc-1')).toBe(true);
  });

  // ── Multi-booking scenarios ───────────────────────────────────────────────
  it('BLOCKS when one of many bookings matches the same doctor+branch', () => {
    const bookings = [
      booking('doc-1', 'loc-delhi'),
      booking('doc-2', 'loc-delhi'),
      booking('doc-1', 'loc-kota'),
    ];
    // doc-1 is in queue at both delhi and kota; trying to book delhi again → block
    expect(hasActiveBooking(bookings, 'doc-1', 'loc-delhi')).toBe(true);
  });

  it('ALLOWS when doctor is in queue at a different branch only', () => {
    const bookings = [booking('doc-1', 'loc-kota')];
    expect(hasActiveBooking(bookings, 'doc-1', 'loc-delhi')).toBe(false);
  });
});

// ─── isLiveQueueMode ─────────────────────────────────────────────────────────

describe('isLiveQueueMode', () => {
  it('returns true for LIVE_QUEUE (the FIFO mode)', () => {
    expect(isLiveQueueMode('LIVE_QUEUE')).toBe(true);
  });

  it('returns true when queueMode is null (defaults to LIVE_QUEUE)', () => {
    expect(isLiveQueueMode(null)).toBe(true);
  });

  it('returns true when queueMode is undefined (defaults to LIVE_QUEUE)', () => {
    expect(isLiveQueueMode(undefined)).toBe(true);
  });

  it('returns false for TIME_SLOT (requires slot selection)', () => {
    expect(isLiveQueueMode('TIME_SLOT')).toBe(false);
  });

  it('returns false for CAPACITY_TIME_SLOT (requires slot selection)', () => {
    expect(isLiveQueueMode('CAPACITY_TIME_SLOT')).toBe(false);
  });

  it('returns false for any unknown / future slot-based mode', () => {
    expect(isLiveQueueMode('UNKNOWN_SLOT_MODE')).toBe(false);
  });
});
