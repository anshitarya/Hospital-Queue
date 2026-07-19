'use client';

import { Suspense, useId, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon, TurnosIcon } from '@/components/Icons';
import Link from 'next/link';
import { registerReceptionist, useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { PhoneInput, type PhoneValidationResult } from '@/components/PhoneInput';

/**
 * Receptionist self-signup. Production-level form rules:
 *
 *   - Invite code is required and is normalized to uppercase to match how
 *     codes are generated (XXXX-XXXX, A-Z + 0-9).
 *   - Phone uses the shared PhoneInput component — validated and normalized to
 *     "+91…" before sending. The server re-validates.
 *   - Password must be ≥ 8 chars with letters + digits. Inline strength meter.
 *   - Confirm field must match before submission is enabled.
 */

interface PasswordRules {
  minLength: boolean;
  hasLetter: boolean;
  hasDigit: boolean;
  ok: boolean;
}

function checkPassword(pwd: string): PasswordRules {
  const minLength = pwd.length >= 8;
  const hasLetter = /[A-Za-z]/.test(pwd);
  const hasDigit = /\d/.test(pwd);
  return { minLength, hasLetter, hasDigit, ok: minLength && hasLetter && hasDigit };
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-1.5 ${ok ? 'text-emerald-600' : 'text-slate-400'}`}>
      <span
        className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[10px] ${ok ? 'bg-emerald-100' : 'bg-slate-100'}`}
      >
        {ok ? '✓' : '·'}
      </span>
      {children}
    </li>
  );
}

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const setSession = useAuth((s) => s.setSession);

  const inviteCodeId = useId();
  const nameId = useId();
  const passwordId = useId();
  const confirmId = useId();

  const [inviteCode, setInviteCode] = useState(params.get('code') ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneResult, setPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pwdRules = useMemo(() => checkPassword(password), [password]);
  const passwordsMatch = password === confirm && confirm.length > 0;

  const canSubmit =
    inviteCode.trim().length >= 6 &&
    name.trim().length >= 2 &&
    phoneResult.ok &&
    pwdRules.ok &&
    passwordsMatch &&
    !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const result = await registerReceptionist({
        inviteCode: inviteCode.trim().toUpperCase(),
        name: name.trim(),
        phone: phoneResult.e164!,
        password,
      });
      setSession(result);
      router.push('/reception');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-6">
        <Link href="/login/choose" className="inline-flex items-center gap-2.5 group">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold shadow-md">
          <TurnosIcon className="h-7 w-7" />
          </span>
          <span className="text-lg font-semibold">Clinic Queue</span>
        </Link>
      </div>

      <form onSubmit={submit} className="card p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Receptionist registration</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            You need an invite code from your clinic admin.
          </p>
        </div>

        {/* Invite code */}
        <div className="space-y-1.5">
          <label htmlFor={inviteCodeId} className="text-sm font-medium">Invite code</label>
          <input
            id={inviteCodeId}
            className="input font-mono tracking-widest uppercase"
            placeholder="XXXX-XXXX"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            required
            autoFocus={!inviteCode}
          />
        </div>

        {/* Name */}
        <div className="space-y-1.5">
          <label htmlFor={nameId} className="text-sm font-medium">Your name</label>
          <input
            id={nameId}
            className="input"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            autoFocus={!!inviteCode}
          />
        </div>

        {/* Phone — via shared PhoneInput */}
        <PhoneInput
          value={phone}
          onChange={(raw, result) => {
            setPhone(raw);
            setPhoneResult(result);
          }}
          required
          autoComplete="tel"
        />

        {/* Password */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor={passwordId} className="text-sm font-medium">Password</label>
            <button
              type="button"
              onClick={() => setShowPwd((s) => !s)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              {showPwd ? 'Hide' : 'Show'}
            </button>
          </div>
          <input
            id={passwordId}
            className="input"
            type={showPwd ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          {password && (
            <ul className="text-xs space-y-0.5 mt-1">
              <Rule ok={pwdRules.minLength}>At least 8 characters</Rule>
              <Rule ok={pwdRules.hasLetter}>Contains a letter</Rule>
              <Rule ok={pwdRules.hasDigit}>Contains a digit</Rule>
            </ul>
          )}
        </div>

        {/* Confirm */}
        <div className="space-y-1.5">
          <label htmlFor={confirmId} className="text-sm font-medium">Confirm password</label>
          <input
            id={confirmId}
            className="input"
            type={showPwd ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
          {confirm && !passwordsMatch && (
            <p className="text-xs text-rose-600">Passwords don&apos;t match</p>
          )}
        </div>

        {error && (
          <div className="text-sm bg-rose-50 text-rose-700 ring-1 ring-rose-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!canSubmit}
        >
          {busy ? 'Creating account…' : 'Create account'}
        </button>

        <div className="text-sm text-center text-slate-500 pt-1 border-t border-slate-100 space-y-2">
          <p>
            Already registered?{' '}
            <Link href="/login" className="text-brand-600 hover:text-brand-700 font-medium">
              Sign in →
            </Link>
          </p>
          <p className="text-xs">
            <Link href="/login/choose" className="text-slate-400 hover:text-slate-600">
              ← Choose a different role
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <Suspense fallback={<div className="text-slate-500">Loading…</div>}>
        <RegisterForm />
      </Suspense>
    </main>
  );
}
