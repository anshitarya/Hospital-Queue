'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { staffLogin, useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { IdentifierInput } from '@/components/IdentifierInput';

export default function StaffLoginPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);

  const passwordId = useId();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await staffLogin(identifier, password);
      setSession(result);
      if (result.user.role === 'DOCTOR') router.push('/doctor');
      else if (result.user.role === 'ADMIN') router.push('/admin');
      else router.push('/reception');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Link href="/login/choose" className="inline-flex items-center gap-2.5 group">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold shadow-md group-hover:shadow-lg transition-shadow">
              CQ
            </span>
            <span className="text-lg font-semibold">Clinic Queue</span>
          </Link>
        </div>

        <form onSubmit={submit} className="card p-6 space-y-4">
          <div>
            <h1 className="text-xl font-semibold">Staff sign in</h1>
            <p className="text-sm text-slate-500 mt-0.5">Reception, doctor, or admin.</p>
          </div>

          {/* Smart identifier — detects email vs phone, shows validation accordingly */}
          <IdentifierInput
            value={identifier}
            onChange={setIdentifier}
            autoFocus
            required
          />

          <div className="space-y-1.5">
            <label htmlFor={passwordId} className="text-sm font-medium">Password</label>
            <input
              id={passwordId}
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="text-sm bg-rose-50 text-rose-700 ring-1 ring-rose-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="text-sm text-center text-slate-500 pt-1 border-t border-slate-100 space-y-2">
            <p>
              New receptionist?{' '}
              <Link href="/register" className="text-brand-600 hover:text-brand-700 font-medium">
                Register with invite code →
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
    </main>
  );
}
