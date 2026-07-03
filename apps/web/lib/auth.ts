'use client';

import { create } from 'zustand';
import { api, AuthResult } from './api';

interface AuthState {
  user: AuthResult['user'] | null;
  loaded: boolean;
  hydrate: () => void;
  setSession: (r: AuthResult) => void;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loaded: false,
  hydrate: () => {
    if (typeof window === 'undefined') return;
    const userRaw = window.localStorage.getItem('hq_user');
    set({
      user: userRaw ? JSON.parse(userRaw) : null,
      loaded: true,
    });
  },
  setSession: (r: AuthResult) => {
    window.localStorage.setItem('hq_user', JSON.stringify(r.user));
    set({ user: r.user, loaded: true });
  },
  logout: async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    window.localStorage.removeItem('hq_user');
    set({ user: null });
  },
}));

export async function staffLogin(identifier: string, password: string) {
  return api<AuthResult>('/auth/staff/login', { method: 'POST', body: { identifier, password } });
}

export async function registerReceptionist(opts: {
  inviteCode: string;
  name: string;
  phone: string;
  password: string;
}) {
  return api<AuthResult>('/auth/register', { method: 'POST', body: opts });
}

export async function requestOtp(phone: string) {
  return api<{ devCode?: string }>('/auth/otp/request', { method: 'POST', body: { phone } });
}

export async function verifyOtp(phone: string, code: string, name?: string) {
  return api<AuthResult & { pinSet: boolean }>('/auth/otp/verify', {
    method: 'POST',
    body: { phone, code, name },
  });
}

export async function checkPinStatus(phone: string) {
  return api<{ pinSet: boolean }>(`/auth/patient/pin-status?phone=${encodeURIComponent(phone)}`);
}

export async function loginWithPin(phone: string, pin: string) {
  return api<AuthResult>('/auth/patient/pin/login', { method: 'POST', body: { phone, pin } });
}

export async function setPatientPin(pin: string) {
  return api<{ ok: boolean }>('/auth/patient/pin/set', { method: 'POST', body: { pin } });
}

/* ─── Profile ─────────────────────────────────────────────────────────────── */

export interface UserProfile {
  id: string;
  role: 'PATIENT' | 'RECEPTIONIST' | 'DOCTOR' | 'ADMIN';
  name: string;
  email: string | null;
  emailVerified: boolean;
  pendingEmail: string | null;
  phone: string | null;
  phoneVerified: boolean;
  clinicId: string | null;
  clinic: { id: string; name: string } | null;
  createdAt: string;
  hasPassword: boolean;
}

export async function getProfile() {
  return api<UserProfile>('/auth/profile');
}

/**
 * Update editable profile fields. Currently only `name` — see backend
 * UpdateProfileDto for the rationale (email is two-step verified; phone
 * is immutable).
 */
export async function updateProfile(opts: { name?: string }) {
  return api<UserProfile>('/auth/profile', { method: 'PATCH', body: opts });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return api<{ ok: true }>('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

/* ─── Email verification ──────────────────────────────────────────────────── */

export async function requestEmailVerification(email: string) {
  return api<{ sent?: boolean; alreadyVerified?: boolean; devCode?: string }>(
    '/auth/email/request-verify',
    { method: 'POST', body: { email } },
  );
}

export async function verifyEmail(code: string) {
  return api<UserProfile>('/auth/email/verify', {
    method: 'POST',
    body: { code },
  });
}

export async function cancelPendingEmail() {
  return api<UserProfile>('/auth/email/cancel-pending', { method: 'POST' });
}
