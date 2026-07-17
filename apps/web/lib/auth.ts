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
    // Only overwrite the token when we actually received one. The profile page
    // calls setSession with token:'' just to refresh display fields — that must
    // NOT clobber the stored auth token.
    if (r.token) window.localStorage.setItem('hq_token', r.token);
    set({ user: r.user, loaded: true });
  },
  logout: async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    window.localStorage.removeItem('hq_user');
    window.localStorage.removeItem('hq_token');
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

export async function loginCustomer(phone: string, pin: string) {
  return api<AuthResult>('/auth/customer/login', { method: 'POST', body: { phone, pin } });
}

/** @deprecated Use loginCustomer */
export async function loginWithPin(phone: string, pin: string) {
  return loginCustomer(phone, pin);
}

/* ─── Profile ─────────────────────────────────────────────────────────────── */

export interface UserProfile {
  id: string;
  role: 'PATIENT' | 'RECEPTIONIST' | 'CLINIC_ADMIN' | 'DOCTOR' | 'ADMIN';
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
  customerPin?: string | null;
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

export async function registerCustomer(phone: string, name: string) {
  return api<AuthResult & { pin: string }>('/auth/customer/register', {
    method: 'POST',
    body: { phone, name },
  });
}

export async function changePin(currentPin: string, newPin: string) {
  return api<{ ok: true }>('/auth/customer/change-pin', {
    method: 'POST',
    body: { currentPin, newPin },
  });
}
