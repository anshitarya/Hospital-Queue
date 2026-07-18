export interface ShiftLike {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isHoliday: boolean;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m ?? 0);
}

export function shiftsOverlap(a: ShiftLike, b: ShiftLike): boolean {
  if (a.isHoliday || b.isHoliday) return false;
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  const as = timeToMinutes(a.startTime);
  const ae = timeToMinutes(a.endTime);
  const bs = timeToMinutes(b.startTime);
  const be = timeToMinutes(b.endTime);
  if (ae <= as || be <= bs) return false;
  return as < be && bs < ae;
}

/** Detect overlapping working shifts within one list (same day). */
export function findIntraDayOverlaps(shifts: ShiftLike[]): string | null {
  for (let i = 0; i < shifts.length; i++) {
    for (let j = i + 1; j < shifts.length; j++) {
      if (shiftsOverlap(shifts[i], shifts[j])) {
        return `Overlapping shifts on day ${shifts[i].dayOfWeek}`;
      }
    }
  }
  return null;
}
