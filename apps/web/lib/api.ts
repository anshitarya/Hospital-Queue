// Thin fetch wrapper. Centralizes base URL, credentials, and error normalization.
// Keep this dumb on purpose — no React, no state. Composes well with both server
// and client components.

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, message: string, public payload?: unknown) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  const isFormData = init.body instanceof FormData;
  // Auth is primarily a Bearer token from localStorage. We ALSO send cookies
  // (`credentials: 'include'`), but the web app and API live on different
  // domains in production, and browsers block SameSite cross-site cookies —
  // so the Bearer header is the reliable channel. See lib/auth.ts (`hq_token`).
  const token =
    typeof window !== 'undefined' ? window.localStorage.getItem('hq_token') : null;
  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
    credentials: 'include',
    body: init.body && !isFormData ? JSON.stringify(init.body) : (init.body as BodyInit),
    cache: 'no-store',
  });

  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.localStorage.removeItem('hq_user');
      window.localStorage.removeItem('hq_token');
    }
    const msg = (payload as { message?: string | string[] })?.message;
    throw new ApiError(
      res.status,
      Array.isArray(msg) ? msg.join('; ') : msg ?? `Request failed (${res.status})`,
      payload,
    );
  }
  return payload as T;
}

// ---- types matched to API responses ----

export interface AuthResult {
  token: string;
  user: { id: string; role: Role; name: string; phone?: string | null; email?: string | null; clinicId?: string | null };
}

export interface Clinic {
  id: string;
  name: string;
  address?: string | null;
  businessType?: string | null;
  createdAt: string;
  doctors?: Doctor[];
  _count?: { users: number; doctors: number };
  inviteCodes?: InviteCode[];
}

export interface InviteCode {
  id: string;
  code: string;
  clinicId: string;
  usedById?: string | null;
  usedBy?: { id: string; name: string; phone?: string | null } | null;
  expiresAt: string;
  createdAt: string;
}

export type Role = 'PATIENT' | 'RECEPTIONIST' | 'DOCTOR' | 'ADMIN';
export type EntryStatus =
  | 'WAITING'
  | 'IN_CONSULTATION'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'CANCELLED'
  | 'MISSED';
export type SlotType = 'NEW' | 'FOLLOWUP';
export type DoctorStatus = 'AVAILABLE' | 'BUSY' | 'PAUSED' | 'AWAY';

export interface Department {
  id: string;
  name: string;
  doctors?: Doctor[];
}
export interface Doctor {
  id: string;
  userId: string;
  user: { id: string; name: string; email?: string | null; phone?: string | null };
  departmentId: string;
  department?: { id: string; name: string };
  // The clinic the doctor belongs to. Populated by the queue snapshot /
  // patient history endpoints so dashboards can show clinic + doctor in
  // their headers without an extra fetch.
  clinicId?: string;
  clinic?: { id: string; name: string; address?: string | null; businessType?: string | null };
  avgConsultMinutes: number;
  delayMinutes: number;
  status: DoctorStatus;
  // Break handling (Feature 4)
  breakUntil?: string | null;
  breakNote?: string | null;
  // Follow-up slots / insertion gaps (Features 1, 2, 6)
  followUpEvery?: number;
  walkinGap?: number;
  missedGap?: number;
}
export interface QueueEntry {
  id: string;
  doctorId: string;
  patientId: string;
  patient?: { id: string; name: string; phone?: string | null };
  serviceDay: string;
  tokenNumber: number;
  status: EntryStatus;
  priority: number;
  notes?: string | null;
  joinedAt: string;
  calledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  // Sort position for walk-ins / rejoins (Feature 1 & 2)
  sortOrder?: number | null;
  walkin?: boolean;
  // Slot type: NEW or FOLLOWUP (Feature 6)
  slotType?: SlotType;
  // ETA enrichment fields (Features 3, 5)
  peopleAhead?: number;
  etaMinutes?: number;
  etaAbsolute?: string;
  movingAvgMinutes?: number;
}
export interface MissedEntry {
  id: string;
  tokenNumber: number;
  patient: { id: string; name: string; phone?: string | null } | null;
  completedAt: string | null;
  missedCount: number;
}

export interface Snapshot {
  doctor: Doctor;
  entries: QueueEntry[];
  currentToken: number | null;
  /** Today's MISSED entries for the receptionist missed-patients panel. Feature 2. */
  missedEntries?: MissedEntry[];
  /** Moving average minutes/patient used for ETA. null = no history yet. Feature 3. */
  movingAvgMinutes?: number | null;
  /** True if at least one entry has been called today (callNext fired). Used to suppress "queue not started" after all are done. */
  hasStartedToday?: boolean;
}

/**
 * A single finished entry in the queue history log.
 * Returned by GET /api/queue/history
 */
export interface HistoryEntry {
  id: string;
  tokenNumber: number;
  status: 'COMPLETED' | 'SKIPPED' | 'CANCELLED' | 'MISSED';
  slotType?: SlotType;
  serviceDay: string;
  priority: number;
  notes: string | null;
  joinedAt: string;
  calledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** calledAt − joinedAt in whole minutes; null when calledAt is missing */
  waitMinutes: number | null;
  /** completedAt − calledAt in whole minutes; null when timestamps are missing */
  consultMinutes: number | null;
  patient: { id: string; name: string; phone: string | null };
  doctor: { id: string; name: string; department: string };
  createdBy: { id: string; name: string } | null;
}
