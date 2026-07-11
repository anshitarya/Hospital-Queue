'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, TurnosIcon } from '@/components/Icons';
import Link from 'next/link';
import {
  requestOtp,
  verifyOtp,
  checkPinStatus,
  loginWithPin,
  setPatientPin,
  useAuth,
} from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { PhoneInput, type PhoneValidationResult } from '@/components/PhoneInput';

type Step =
  | 'phone'          // enter phone → decide which flow
  | 'pin'            // returning patient: enter PIN
  | 'otp'            // new/forgot-pin patient: enter OTP
  | 'set-pin'        // after OTP verify: create PIN
  | 'confirm-pin';   // confirm the PIN they just typed

export default function PatientLoginPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const nameId = useId();

  const [phone, setPhone]             = useState('');
  const [e164, setE164]               = useState('');
  const [phoneResult, setPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [name, setName]               = useState('');
  const [otp, setOtp]                 = useState('');
  const [devCode, setDevCode]         = useState<string | null>(null);
  const [pin, setPin]                 = useState('');
  const [confirmPin, setConfirmPin]   = useState('');
  const [step, setStep]               = useState<Step>('phone');
  const [busy, setBusy]               = useState(false);
  const [error, setError]             = useState<string | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────

  function err(msg: unknown) {
    setError(msg instanceof ApiError ? msg.message : String(msg));
    setBusy(false);
  }

  // ── Step 1: phone → decide PIN or OTP ────────────────────────────────────

  async function handlePhone(e: React.FormEvent) {
    e.preventDefault();
    if (!phoneResult.ok || !phoneResult.e164) {
      setError(phoneResult.error ?? 'Invalid mobile number');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { pinSet } = await checkPinStatus(phoneResult.e164);
      setE164(phoneResult.e164);
      if (!pinSet) {
        const { devCode: code } = await requestOtp(phoneResult.e164);
        setDevCode(code ?? null);
      }
      setStep(pinSet ? 'pin' : 'otp');
    } catch (ex) {
      err(ex);
    } finally {
      setBusy(false);
    }
  }

  // ── Step 2a: PIN login ────────────────────────────────────────────────────

  async function handlePinLogin(enteredPin: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await loginWithPin(e164, enteredPin);
      setSession(result);
      router.push('/patient');
    } catch (ex) {
      setPin('');
      err(ex);
    } finally {
      setBusy(false);
    }
  }

  // ── Step 2b: send OTP ─────────────────────────────────────────────────────

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestOtp(e164);
      setStep('otp');
    } catch (ex) {
      err(ex);
    } finally {
      setBusy(false);
    }
  }

  // ── Step 2b: verify OTP ───────────────────────────────────────────────────

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await verifyOtp(e164, otp, name || undefined);
      setSession(result);
      // Always prompt PIN setup after OTP — first-time and forgot-PIN both land here.
      setStep('set-pin');
    } catch (ex) {
      err(ex);
    } finally {
      setBusy(false);
    }
  }

  // ── Step 3: set PIN ───────────────────────────────────────────────────────

  function handlePinEntered(enteredPin: string) {
    setPin(enteredPin);
    setStep('confirm-pin');
  }

  async function handleConfirmPin(confirmedPin: string) {
    if (confirmedPin !== pin) {
      setConfirmPin('');
      setError("PINs don't match — try again.");
      setStep('set-pin');
      setPin('');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setPatientPin(confirmedPin);
      router.push('/patient');
    } catch (ex) {
      err(ex);
    } finally {
      setBusy(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-6">
          <Link href="/login/choose" className="inline-flex items-center gap-2.5 group">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold shadow-md">
            <TurnosIcon className="h-7 w-7" />
            </span>
            <span className="text-lg font-semibold">Turnos</span>
          </Link>
        </div>

        <div className="card p-6 space-y-5">

          {/* ── Phone step ─────────────────────────────────────────────────── */}
          {step === 'phone' && (
            <>
              <div>
                <h1 className="text-xl font-semibold">Patient sign-in</h1>
                <p className="text-sm text-slate-500 mt-0.5">Enter your registered mobile number.</p>
              </div>
              <form onSubmit={handlePhone} className="space-y-3">
                <PhoneInput
                  value={phone}
                  onChange={(raw, result) => { setPhone(raw); setPhoneResult(result); }}
                  autoFocus required autoComplete="tel"
                />
                <div className="space-y-1.5">
                  <label htmlFor={nameId} className="text-sm font-medium">
                    Name <span className="text-slate-400 font-normal">(first visit only)</span>
                  </label>
                  <input id={nameId} className="input" value={name}
                    onChange={(e) => setName(e.target.value)} placeholder="Optional" />
                </div>
                <ErrorBox msg={error} />
                <button className="btn-primary w-full" disabled={busy || !phoneResult.ok}>
                  {busy ? 'Checking…' : 'Continue'}
                </button>
              </form>
            </>
          )}

          {/* ── PIN login step ─────────────────────────────────────────────── */}
          {step === 'pin' && (
            <>
              <div>
                <h1 className="text-xl font-semibold">Enter your PIN</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Enter your 4-digit PIN to sign in as{' '}
                  <span className="font-medium text-slate-700">{e164}</span>.
                </p>
              </div>
              <PinPad
                onComplete={handlePinLogin}
                disabled={busy}
                error={error}
                onClearError={() => setError(null)}
              />
              <button
                type="button"
                className="btn-ghost w-full text-sm"
                onClick={async () => { setStep('otp'); setOtp(''); setError(null); try { const { devCode: c } = await requestOtp(e164); setDevCode(c ?? null); } catch { /* ignore, user can resend */ } }}
              >
                Forgot PIN? Use OTP instead
              </button>
              <BackButton onClick={() => { setStep('phone'); setPin(''); setError(null); }} />
            </>
          )}

          {/* ── OTP send prompt (first time or forgot-pin) ─────────────────── */}
          {step === 'otp' && (
            <>
              <div>
                <h1 className="text-xl font-semibold">Verify with OTP</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  We&apos;ll send a 6-digit code to{' '}
                  <span className="font-medium text-slate-700">{e164}</span> via SMS.
                </p>
              </div>
              {devCode && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-sm text-amber-800">
                  <span className="font-medium">Dev OTP:</span>
                  <span className="font-mono tracking-widest font-bold">{devCode}</span>
                  <span className="ml-auto text-xs text-amber-500">(dev only)</span>
                </div>
              )}
              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">6-digit OTP</label>
                  <input
                    className="input tracking-[0.5em] text-center text-xl font-mono"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6} inputMode="numeric" required autoFocus
                    placeholder="······"
                  />
                  <p className="text-xs text-slate-400">Check your SMS inbox for the code.</p>
                </div>
                <ErrorBox msg={error} />
                <button className="btn-primary w-full" disabled={busy || otp.length !== 6}>
                  {busy ? 'Verifying…' : 'Verify & continue'}
                </button>
                <button type="button" className="btn-secondary w-full text-sm"
                  onClick={async () => { try { const { devCode: c } = await requestOtp(e164); setDevCode(c ?? null); } catch { /* ignore */ } }}>
                  Resend OTP
                </button>
              </form>
              <BackButton onClick={() => { setStep('phone'); setOtp(''); setError(null); }} />
            </>
          )}

          {/* ── Set PIN step ───────────────────────────────────────────────── */}
          {step === 'set-pin' && (
            <>
              <div>
                <h1 className="text-xl font-semibold">Create your PIN</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Set a 4-digit PIN for faster sign-in next time — no OTP needed.
                </p>
              </div>
              <PinPad
                onComplete={handlePinEntered}
                disabled={busy}
                error={error}
                onClearError={() => setError(null)}
                label="Choose a 4-digit PIN"
              />
            </>
          )}

          {/* ── Confirm PIN step ───────────────────────────────────────────── */}
          {step === 'confirm-pin' && (
            <>
              <div>
                <h1 className="text-xl font-semibold">Confirm your PIN</h1>
                <p className="text-sm text-slate-500 mt-0.5">Re-enter your PIN to confirm.</p>
              </div>
              <PinPad
                onComplete={handleConfirmPin}
                disabled={busy}
                error={error}
                onClearError={() => setError(null)}
                label="Re-enter PIN to confirm"
              />
            </>
          )}

          <p className="text-xs text-center text-slate-400 pt-1 border-t border-slate-100">
            <Link href="/login/choose" className="hover:text-slate-600">← Choose a different role</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

// ─── PIN pad component ────────────────────────────────────────────────────────
function PinPad({
  onComplete,
  disabled,
  error,
  onClearError,
  label = 'Enter your 4-digit PIN',
}: {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  error?: string | null;
  onClearError?: () => void;
  label?: string;
}) {
  const [entered, setEntered] = useState('');

  function press(digit: string) {
    if (disabled) return;
    onClearError?.();
    const next = (entered + digit).slice(0, 4);
    setEntered(next);
    if (next.length === 4) {
      // Short delay so the 4th dot fills before the callback fires.
      setTimeout(() => { setEntered(''); onComplete(next); }, 120);
    }
  }

  function backspace() {
    if (disabled) return;
    onClearError?.();
    setEntered((p) => p.slice(0, -1));
  }

  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500 text-center font-medium">{label}</p>

      {/* 4 dots */}
      <div className="flex justify-center gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition-all duration-150 ${
              i < entered.length
                ? 'bg-brand-600 border-brand-600 scale-110'
                : 'bg-transparent border-slate-300'
            }`}
          />
        ))}
      </div>

      {error && <ErrorBox msg={error} />}

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-2.5">
        {KEYS.map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : k === '⌫' ? (
            <button
              key={i}
              type="button"
              onClick={backspace}
              disabled={disabled || entered.length === 0}
              className="h-14 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 active:bg-slate-300 dark:active:bg-slate-500 text-xl font-light text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-40"
              aria-label="Backspace"
            >
              ⌫
            </button>
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => press(k)}
              disabled={disabled}
              className="h-14 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-brand-50 dark:hover:bg-brand-900/40 hover:border-brand-200 active:bg-brand-100 text-xl font-semibold text-slate-800 dark:text-slate-100 transition-colors disabled:opacity-40 select-none"
            >
              {k}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

// ─── Small shared bits ────────────────────────────────────────────────────────
function ErrorBox({ msg }: { msg?: string | null }) {
  if (!msg) return null;
  return (
    <div className="text-sm bg-rose-50 text-rose-700 ring-1 ring-rose-200 rounded-lg px-3 py-2">
      {msg}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn-ghost w-full text-sm" onClick={onClick}>
      ← Use a different number
    </button>
  );
}
