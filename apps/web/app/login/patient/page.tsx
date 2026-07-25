'use client';

import { useId, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TurnosIcon } from '@/components/Icons';
import Link from 'next/link';
import {
  loginCustomer,
  requestCustomerOtp,
  loginCustomerOtp,
  setCustomerPin,
  getAuthStatus,
  useAuth,
} from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { PhoneInput, type PhoneValidationResult } from '@/components/PhoneInput';
import { WarpSpeedLoader } from '@/components/WarpSpeedLoader';

type Step = 'phone' | 'pin' | 'otp' | 'set-pin';

export default function PatientLoginPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);

  const [phone, setPhone]             = useState('');
  const [e164, setE164]               = useState('');
  const [phoneResult, setPhoneResult] = useState<PhoneValidationResult>({ ok: false });
  const [step, setStep]               = useState<Step>('phone');
  const [busy, setBusy]               = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [otpLoginEnabled, setOtpLoginEnabled] = useState(true);
  const [devCode, setDevCode]         = useState<string | null>(null);

  useEffect(() => {
    getAuthStatus()
      .then((status) => {
        if (status.customerOtpLoginEnabled !== undefined) {
          setOtpLoginEnabled(status.customerOtpLoginEnabled);
        }
      })
      .catch(() => {});
  }, []);

  function err(msg: unknown) {
    setError(msg instanceof ApiError ? msg.message : String(msg));
    setBusy(false);
  }

  async function handlePhone(e: React.FormEvent) {
    e.preventDefault();
    if (!phoneResult.ok || !phoneResult.e164) {
      setError(phoneResult.error ?? 'Invalid mobile number');
      return;
    }
    setE164(phoneResult.e164);
    setStep('pin');
    setError(null);
  }

  async function handlePinLogin(enteredPin: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await loginCustomer(e164, enteredPin);
      setSession(result);
      router.push('/patient');
    } catch (ex) {
      err(ex);
    }
  }

  async function handleSendOtp() {
    setBusy(true);
    setError(null);
    setDevCode(null);
    try {
      const res = await requestCustomerOtp(e164);
      setBusy(false);
      setStep('otp');
      if (res.devCode) {
        setDevCode(res.devCode);
      }
    } catch (ex) {
      err(ex);
    }
  }

  async function handleVerifyOtp(code: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await loginCustomerOtp(e164, code);
      setSession(result);
      setBusy(false);
      setStep('set-pin');
      setDevCode(null);
    } catch (ex) {
      err(ex);
    }
  }

  async function handleSetPin(enteredPin: string) {
    setBusy(true);
    setError(null);
    try {
      await setCustomerPin(enteredPin);
      setBusy(false);
      router.push('/patient');
    } catch (ex) {
      err(ex);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-[#07090e] text-slate-100 selection:bg-brand-500/30">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-[450px] w-[450px] rounded-full bg-brand-500/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-purple-600/10 blur-[130px]" />
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Link href="/login/choose" className="inline-flex items-center gap-2.5 group">
            <TurnosIcon className="h-10 w-10 text-white" />
            <span className="text-xl font-bold tracking-tight text-white">turnos</span>
          </Link>
        </div>

        <div className="card p-6 space-y-5 backdrop-blur-2xl bg-slate-900/40 border border-white/10 rounded-3xl shadow-card">

          {step === 'phone' && (
            <>
              <div>
                <h1 className="text-xl font-semibold text-white">Customer sign-in</h1>
                <p className="text-sm text-slate-400 mt-0.5">
                  Enter your registered mobile number to continue.
                </p>
              </div>
              <form onSubmit={handlePhone} className="space-y-3">
                <PhoneInput
                  value={phone}
                  onChange={(raw, result) => { setPhone(raw); setPhoneResult(result); }}
                  autoFocus required autoComplete="tel"
                />
                <ErrorBox msg={error} />
                <button className="btn-primary w-full" disabled={busy || !phoneResult.ok}>
                  {busy ? 'Checking…' : 'Continue'}
                </button>
              </form>
              <p className="text-xs text-slate-400 text-center">
                 Click Forgot PIN / Login with OTP when logging in for the first time.
              </p>
            </>
          )}

          {step === 'pin' && (
            <>
              <div>
                <h1 className="text-xl font-semibold">Enter your Customer PIN</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Sign in as{' '}
                  <span className="font-medium text-slate-700">{e164}</span>{' '}
                  with your permanent 4-digit PIN.
                </p>
              </div>
              <PinPad
                onComplete={handlePinLogin}
                disabled={busy}
                error={error}
                onClearError={() => setError(null)}
              />
              {otpLoginEnabled && (
                <button
                  type="button"
                  onClick={handleSendOtp}
                  className="text-xs text-brand-600 hover:text-brand-700 font-semibold text-center block w-full mt-2 transition-colors duration-150"
                >
                  Forgot PIN / Login with OTP
                </button>
              )}
              <BackButton onClick={() => { setStep('phone'); setError(null); }} />
            </>
          )}

          {step === 'otp' && (
            <>
              <div>
                <h1 className="text-xl font-semibold">Verify Mobile Number</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  We sent a 4-digit OTP to{' '}
                  <span className="font-medium text-slate-700">{e164}</span>.
                </p>
              </div>
              {devCode && (
                <div className="bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-900/50">
                  <span className="font-bold">Dev Mode:</span> Use code <code className="font-mono bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">{devCode}</code>
                </div>
              )}
              <OtpPad
                onComplete={handleVerifyOtp}
                disabled={busy}
                error={error}
                onClearError={() => setError(null)}
              />
              <BackButton onClick={() => { setStep('phone'); setError(null); setDevCode(null); }} />
            </>
          )}

          {step === 'set-pin' && (
            <>
              <div>
                <h1 className="text-xl font-semibold">Set your 4-digit PIN</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Set a new PIN to log in quickly next time.
                </p>
              </div>
              <PinPad
                onComplete={handleSetPin}
                disabled={busy}
                error={error}
                onClearError={() => setError(null)}
                label="Enter a new 4-digit PIN"
              />
            </>
          )}

          <p className="text-xs text-center text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
            <Link href="/login/choose" className="hover:text-slate-600">← Choose a different role</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

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

function OtpPad({
  onComplete,
  disabled,
  error,
  onClearError,
  label = 'Enter your 4-digit OTP code',
}: {
  onComplete: (code: string) => void;
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
      setTimeout(() => {
        setEntered('');
        onComplete(next);
      }, 120);
    }
  }

  function backspace() {
    if (disabled) return;
    onClearError?.();
    setEntered((p) => p.slice(0, -1));
  }

  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500 text-center font-medium">{label}</p>

      <div className="flex justify-center gap-2">
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
