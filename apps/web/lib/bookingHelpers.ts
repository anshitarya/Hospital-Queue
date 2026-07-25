/**
 * Booking helper utilities extracted for testability.
 */

export interface ActiveBookingEntry {
  doctorId: string;
  locationId?: string | null;
  serviceDay: string;
}

/**
 * Determines whether an active booking already exists for the given doctor
 * at the given branch. Branch-level granularity means the same doctor can
 * be booked at a different branch independently.
 *
 * Logic matrix:
 *  | currentLocationId | entry.locationId | Result                           |
 *  |-------------------|------------------|----------------------------------|
 *  | provided          | provided         | block only if both match         |
 *  | provided          | null / undefined | allow (can't confirm same branch)|
 *  | undefined         | any              | block (legacy / safe fallback)   |
 */
export function hasActiveBooking(
  activeBookings: ActiveBookingEntry[],
  doctorId: string,
  locationId?: string,
): boolean {
  return activeBookings.some((b) => {
    if (b.doctorId !== doctorId) return false;
    // Both sides have location context → compare directly
    if (locationId && b.locationId) return b.locationId === locationId;
    // We know the target branch but the entry doesn't have branch info → allow
    if (locationId && !b.locationId) return false;
    // No location context → block to be safe (old behaviour)
    return true;
  });
}

/**
 * Returns true when the queue mode means FIFO / live-queue ordering
 * (no time-slot selection needed).
 *
 * DB values: 'LIVE_QUEUE' | 'TIME_SLOT' | 'CAPACITY_TIME_SLOT'
 */
export function isLiveQueueMode(queueMode: string | null | undefined): boolean {
  return !queueMode || queueMode === 'LIVE_QUEUE';
}
