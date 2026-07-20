'use client';

import { create } from 'zustand';
import { api, ApiError, AuthResult } from './api';

interface AuthState {
  user: AuthResult['user'] | null;
  loaded: boolean;
  hydrate: () => Promise<void>;
  setSession: (r: AuthResult) => void;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loaded: false,
  hydrate: async () => {
    if (typeof window === 'undefined') return;
    const userRaw = window.localStorage.getItem('hq_user');
    const token = window.localStorage.getItem('hq_token');

    // Fast path: we have user data in localStorage — trust it and return immediately.
    // The API will evict the session with a 401 on the next real request if the token
    // is expired; api.ts clears localStorage when that happens.
    if (userRaw) {
      set({ user: JSON.parse(userRaw), loaded: true });
      return;
    }

    // Slow path: no user in localStorage at all — try to restore session from the
    // httpOnly cookie (happens after manual localStorage clear or cross-browser scenario).
    // Only attempt this when there's also no token, to avoid an extra round-trip.
    if (token) {
      // Have a token but no user profile — shouldn't normally happen; just mark loaded
      set({ loaded: true });
      return;
    }

    try {
      const me = await api<AuthResult['user']>('/auth/me');
      // Server accepted the cookie — restore full session to localStorage
      window.localStorage.setItem('hq_user', JSON.stringify(me));
      set({ user: me, loaded: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Cookie is also expired/invalid — nothing to restore
        set({ user: null, loaded: true });
      } else {
        // Network error or server down — nothing cached, show as logged out
        set({ user: null, loaded: true });
      }
    }
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

/** Sign in via Google ID token. Backend verifies the token and issues our own session. */
export async function staffGoogleLogin(idToken: string) {
  return api<AuthResult>('/auth/staff/google', { method: 'POST', body: { idToken } });
}

export interface AuthStatus {
  googleAuthEnabled: boolean;
  devAuthEnabled: boolean;
  authMode: 'development' | 'production';
}

/** Check which auth modes are enabled — used to conditionally show Google button vs password form. */
export async function getAuthStatus(): Promise<AuthStatus> {
  return api<AuthStatus>('/auth/staff/status');
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
  role: 'PATIENT' | 'RECEPTIONIST' | 'CLINIC_ADMIN' | 'MANAGER' | 'DOCTOR' | 'ADMIN';
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
