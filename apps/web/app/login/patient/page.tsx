'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { requestOtp, verifyOtp, useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { PhoneInput, type PhoneValidationResult } from '@/components/PhoneInput';

export default function PatientLoginPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);

  const nameId = useId();
  const otpId = useId();

  const [phone, setPhone] = useState('');
  const [phoneResult, setPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!phoneResult.ok || !phoneResult.e164) {
      setError(phoneResult.error ?? 'Invalid mobile number');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await requestOtp(phoneResult.e164);
      setDevCode(res.devCode ?? null);
      setStep('code');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send OTP');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!phoneResult.e164) return;
    setBusy(true);
    setError(null);
    try {
      const result = await verifyOtp(phoneResult.e164, code, name || undefined);
      setSession(result);
      router.push('/patient');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'OTP verification failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Link href="/login/choose" className="inline-flex items-center gap-2.5 group">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold shadow-md">
              HQ
            </span>
            <span className="text-lg font-semibold">Hospital Queue</span>
          </Link>
        </div>

        <div className="card p-6 space-y-4">
          <div>
            <h1 className="text-xl font-semibold">Patient sign-in</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {step === 'phone'
                ? 'Enter your mobile number to receive an OTP.'
                : `Enter the 6-digit code sent to +91 ${phone}.`}
            </p>
          </div>

          {step === 'phone' && (
            <form onSubmit={sendOtp} className="space-y-3">
              <PhoneInput
                value={phone}
                onChange={(raw, result) => {
                  setPhone(raw);
                  setPhoneResult(result);
                }}
                autoFocus
                required
                autoComplete="tel"
              />

              <div className="space-y-1.5">
                <label htmlFor={nameId} className="text-sm font-medium">
                  Name{' '}
                  <span className="text-slate-400 font-normal">(first visit only)</span>
                </label>
                <input
                  id={nameId}
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Optional"
                />
              </div>

              {error && (
                <div className="text-sm bg-rose-50 text-rose-700 ring-1 ring-rose-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <button
                className="btn-primary w-full"
                disabled={busy || !phoneResult.ok}
              >
                {busy ? 'Sending…' : 'Send OTP'}
              </button>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={verify} className="space-y-3">
              {devCode && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                  <strong>Dev mode:</strong> your OTP is{' '}
                  <code className="font-mono font-bold">{devCode}</code>
                </div>
              )}
              <div className="space-y-1.5">
                <label htmlFor={otpId} className="text-sm font-medium">OTP</label>
                <input
                  id={otpId}
                  className="input tracking-[0.5em] text-center text-xl font-mono"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  inputMode="numeric"
                  required
                  autoFocus
                />
              </div>
              {error && (
                <div className="text-sm bg-rose-50 text-rose-700 ring-1 ring-rose-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              <button className="btn-primary w-full" disabled={busy || code.length !== 6}>
                {busy ? 'Verifying…' : 'Verify & continue'}
              </button>
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => { setStep('phone'); setCode(''); setError(null); }}
              >
                Use a different number
              </button>
            </form>
          )}

          <p className="text-xs text-center text-slate-400 pt-1 border-t border-slate-100">
            <Link href="/login/choose" className="hover:text-slate-600">
              ← Choose a different role
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
