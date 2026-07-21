'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { staffLogin, staffGoogleLogin, getAuthStatus, useAuth } from '@/lib/auth';
import type { AuthStatus } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { IdentifierInput } from '@/components/IdentifierInput';
import { TurnosIcon } from '@/components/Icons';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

export default function StaffLoginPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);

  const passwordId = useId();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

  useEffect(() => {
    getAuthStatus()
      .then(setAuthStatus)
      .catch(() => {
        setAuthStatus({ googleAuthEnabled: false, devAuthEnabled: true, authMode: 'development' });
      });
  }, []);

  function redirectByRole(role: string) {
    if (role === 'DOCTOR') router.push('/doctor');
    else if (role === 'ADMIN') router.push('/admin');
    else router.push('/reception');
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await staffLogin(identifier, password);
      setSession(result);
      redirectByRole(result.user.role);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSuccess(idToken: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await staffGoogleLogin(idToken);
      setSession(result);
      redirectByRole(result.user.role);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Google Sign-In failed');
    } finally {
      setBusy(false);
    }
  }

  const showGoogle = authStatus?.googleAuthEnabled;
  const showPassword = authStatus?.devAuthEnabled;
  const showBoth = showGoogle && showPassword;

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-slate-50 dark:bg-[#0a0a0b]">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[400px] w-[600px] rounded-full bg-brand-300/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[300px] w-[400px] rounded-full bg-purple-200/15 blur-3xl" />
      </div>

      <div className="w-full max-w-sm space-y-6 animate-enter">
        <div className="text-center space-y-1">
          <Link href="/login/choose" className="inline-flex items-center gap-3 group">
            <TurnosIcon className="h-11 w-11 transition-transform group-hover:scale-105 duration-200" />
            <span className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Turnos</span>
          </Link>
          <p className="text-sm text-slate-500 dark:text-slate-400">Staff portal</p>
        </div>

        <div className="card p-7 space-y-5">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Welcome back</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Sign in with your Login ID and password.</p>
          </div>

          {!authStatus && (
            <div className="space-y-3 animate-pulse">
              <div className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800" />
            </div>
          )}

          {authStatus && (
            <div className="space-y-4">
              {showGoogle && (
                <GoogleSignInButton
                  onSuccess={handleGoogleSuccess}
                  onError={setError}
                  disabled={busy}
                />
              )}

              {showBoth && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">or</span>
                  <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
                </div>
              )}

              {showPassword && (
                <form onSubmit={submitPassword} className="space-y-4">
                  <IdentifierInput
                    label="Login ID"
                    value={identifier}
                    onChange={setIdentifier}
                    autoFocus={!showGoogle}
                    required
                  />

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor={passwordId} className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPwd((s) => !s)}
                        className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors select-none"
                      >
                        {showPwd ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <input
                      id={passwordId}
                      className="input font-mono tracking-widest"
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      required
                    />
                  </div>

                  <button type="submit" className="btn-primary w-full !py-2.5 text-base" disabled={busy}>
                    {busy ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Signing in…
                      </span>
                    ) : 'Sign in'}
                  </button>
                </form>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 ring-1 ring-rose-200 dark:ring-rose-800/60 px-3.5 py-2.5 text-sm flex items-start gap-2">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 mt-0.5 text-rose-500">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-2 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              New business?{' '}
              <Link href="/get-started" className="text-brand-600 hover:text-brand-700 dark:text-brand-400 font-medium transition-colors">
                Register →
              </Link>
            </p>
            <p>
              <Link href="/login/choose" className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                ← Choose a different role
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
