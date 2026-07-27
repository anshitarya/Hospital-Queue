'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  useAuth,
  getProfile,
  updateProfile,
  changePassword,
  changePin,
  requestEmailVerification,
  verifyEmail,
  cancelPendingEmail,
  type UserProfile,
} from '@/lib/auth';
import { useRequireRole } from '@/lib/useRequireRole';
import { formatDateIst } from '@/lib/datetime';
import { formatIndianMobile } from '@/lib/phone';
import { Header } from '@/components/Header';
import { PageLoader } from '@/components/PageLoader';
import { ProfileSkeleton } from '@/components/Skeleton';
import { Toast, type ToastMessage } from '@/components/Toast';
import { Icon } from '@/components/Icons';
import { useWebPush } from '@/lib/useWebPush';


/**
 * Production profile page.
 *
 * Sections:
 *   1. Identity card    — avatar, role pill, clinic, member-since
 *   2. Personal details — edit display name (only); phone is read-only by policy
 *   3. Email            — two-step OTP verification on add / change
 *   4. Security         — change password (hidden for OTP-only patient accts)
 *
 * Why phone is locked: phone is the account identifier. Changing it is
 * functionally a transfer-of-ownership operation — it has to go through
 * support / admin. This prevents account hijack via SIM-swap pretexting.
 */
export default function ProfilePage() {
  const { user, ready } = useRequireRole(['PATIENT', 'RECEPTIONIST', 'CLINIC_ADMIN', 'DOCTOR', 'ADMIN']);
  const setSession = useAuth((s) => s.setSession);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    if (!ready) return;
    getProfile()
      .then((p) => setProfile(p))
      .catch((e: ApiError) => setToast({ type: 'err', msg:e.message }))
      .finally(() => setLoading(false));
  }, [ready]);

  if (!ready || loading || !profile) return <ProfileSkeleton />;

  // Keep the global auth store in sync whenever the profile changes —
  // ensures the header avatar and name update everywhere.
  function syncSession(updated: UserProfile) {
    setProfile(updated);
    if (user) {
      setSession({
        token: '',
        user: {
          id: updated.id,
          role: updated.role,
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
          clinicId: updated.clinicId,
        },
      });
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#07090e] text-slate-900 dark:text-slate-100">
      <Header />

      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8 space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Profile &amp; account</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage your personal details, email, and security settings.
          </p>
        </div>

        <IdentityCard profile={profile} />

        <PersonalDetails
          profile={profile}
          onSaved={(p) => { syncSession(p); setToast({ type: 'ok', msg:'Profile updated' }); }}
          onError={(t) => setToast({ type: 'err', msg:t })}
        />

        <EmailSection
          profile={profile}
          onChanged={(p) => { syncSession(p); setToast({ type: 'ok', msg:'Email verified' }); }}
          onPendingUpdate={(p) => setProfile(p)}
          onError={(t) => setToast({ type: 'err', msg:t })}
          onInfo={(t) => setToast({ type: 'info', msg:t })}
        />

        <Security
          profile={profile}
          onSuccess={() => setToast({ type: 'ok', msg:'Password changed' })}
          onError={(t) => setToast({ type: 'err', msg:t })}
        />

        <NotificationSettings
          onSuccess={(msg) => setToast({ type: 'ok', msg })}
          onError={(msg) => setToast({ type: 'err', msg })}
        />
      </main>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Identity card                                                              */
/* ─────────────────────────────────────────────────────────────────────────── */

function IdentityCard({ profile }: { profile: UserProfile }) {
  const initials = profile.name
    .split(' ').filter(Boolean).slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '').join('') || 'U';

  const roleColor =
    profile.role === 'ADMIN' ? 'from-purple-500 to-purple-700' :
    profile.role === 'DOCTOR' ? 'from-sky-500 to-sky-700' :
    profile.role === 'RECEPTIONIST' || profile.role === 'CLINIC_ADMIN' ? 'from-emerald-500 to-emerald-700' :
    'from-slate-500 to-slate-700';

  const roleLabel = displayRole(profile.role);
  const memberSince = formatDateIst(profile.createdAt, {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <section className="card overflow-hidden">
      <div className="relative h-24 bg-gradient-to-br from-brand-500 via-brand-600 to-purple-700">
        <div className="absolute -bottom-10 left-6">
          <span className={`flex h-20 w-20 rounded-2xl bg-gradient-to-br ${roleColor} text-white text-2xl font-bold items-center justify-center shadow-lg ring-4 ring-white`}>
            {initials}
          </span>
        </div>
      </div>

      <div className="pt-12 px-6 pb-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate">{profile.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="pill bg-slate-100 text-slate-700 ring-slate-200">{roleLabel}</span>
              {profile.clinic && (
                <span className="pill bg-brand-50 text-brand-700 ring-brand-200">
                  <Icon.Building className="h-3 w-3" /> {profile.clinic.name}
                </span>
              )}
            </div>
          </div>
          <div className="text-xs text-slate-400">
            Member since {memberSince}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Personal details — name editable, phone read-only                          */
/* ─────────────────────────────────────────────────────────────────────────── */

function PersonalDetails({
  profile,
  onSaved,
  onError,
}: {
  profile: UserProfile;
  onSaved: (p: UserProfile) => void;
  onError: (t: string) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [busy, setBusy] = useState(false);

  const dirty = name.trim() !== profile.name && name.trim().length >= 2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || busy) return;
    setBusy(true);
    try {
      const updated = await updateProfile({ name: name.trim() });
      onSaved(updated);
    } catch (e) {
      onError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Personal details</h3>
        <p className="text-sm text-slate-500">Your display name across the dashboard.</p>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full name" required>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
          />
        </Field>

        <Field label="Role">
          <input className="input bg-slate-50 cursor-not-allowed" value={displayRole(profile.role)} disabled />
        </Field>

        {/* Phone — visible but locked. Show a "Verified" pill since phone is
            implicitly verified for staff (invite code + login) and patients
            (OTP). */}
        <Field
          label="Mobile number"
          hint="Phone is the account identifier and cannot be changed here. Contact support if you need to update it."
        >
          <div className="relative">
            <input
              className="input bg-slate-50 cursor-not-allowed pr-24"
              value={formatIndianMobile(profile.phone) || '—'}
              disabled
              readOnly
            />
            {profile.phone && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded-full px-2 py-0.5">
                <Icon.Check className="h-3 w-3" /> Verified
              </span>
            )}
          </div>
        </Field>

        <Field label="Business">
          <input
            className="input bg-slate-50 cursor-not-allowed"
            value={profile.clinic?.name ?? '—'}
            disabled
          />
        </Field>

        <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          {dirty && (
            <button type="button" onClick={() => setName(profile.name)} className="btn-secondary text-sm">
              Discard
            </button>
          )}
          <button
            type="submit"
            className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!dirty || busy}
          >
            {busy ? 'Saving…' : 'Save name'}
          </button>
        </div>
      </form>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Email — two-step verification                                              */
/* ─────────────────────────────────────────────────────────────────────────── */

function EmailSection({
  profile,
  onChanged,
  onPendingUpdate,
  onError,
  onInfo,
}: {
  profile: UserProfile;
  onChanged: (p: UserProfile) => void;
  onPendingUpdate: (p: UserProfile) => void;
  onError: (t: string) => void;
  onInfo: (t: string) => void;
}) {
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasPending = !!profile.pendingEmail;

  function isValidEmail(s: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
  }

  async function requestVerify(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!isValidEmail(email)) {
      onError('Enter a valid email address');
      return;
    }
    setBusy(true);
    try {
      const res = await requestEmailVerification(email);
      setDevCode(res.devCode ?? null);
      onInfo(`Verification code sent to ${email}`);
      // Refresh profile so pendingEmail shows up.
      const fresh = await getProfile();
      onPendingUpdate(fresh);
    } catch (err) {
      onError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    try {
      const updated = await verifyEmail(code);
      setNewEmail(''); setCode(''); setDevCode(null);
      onChanged(updated);
    } catch (err) {
      onError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      const updated = await cancelPendingEmail();
      setCode(''); setDevCode(null); setNewEmail('');
      onPendingUpdate(updated);
      onInfo('Email change cancelled');
    } catch (err) {
      onError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Email address</h3>
        <p className="text-sm text-slate-500">
          {profile.email
            ? 'Used for staff sign-in and account recovery.'
            : 'Add an email to enable staff sign-in and account recovery.'}
        </p>
      </div>

      {/* Current email row */}
      <div className="rounded-lg bg-slate-50 ring-1 ring-slate-200 px-4 py-3 flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-slate-400">Current email</div>
          <div className="font-medium truncate">{profile.email ?? 'Not set'}</div>
        </div>
        {profile.email && (
          profile.emailVerified ? (
            <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 ring-1 ring-emerald-200 rounded-full px-2 py-0.5">
              <Icon.Check className="h-3 w-3" /> Verified
            </span>
          ) : (
            <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 ring-1 ring-amber-200 rounded-full px-2 py-0.5">
              Unverified
            </span>
          )
        )}
      </div>

      {/* Pending verification banner */}
      {hasPending && (
        <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 p-4 mb-4">
          <div className="flex items-start gap-3">
            <Icon.Sparkles className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-amber-900">
                Verify {profile.pendingEmail}
              </div>
              <div className="text-xs text-amber-800 mt-0.5">
                We&apos;ve sent a 6-digit code. Enter it below to complete the change.
                Your current email stays active until you verify.
              </div>
            </div>
          </div>

          {devCode && (
            <div className="mt-3 rounded bg-white/80 ring-1 ring-amber-200 px-3 py-2 text-xs">
              <strong>Dev mode:</strong> code is <code className="font-mono font-bold">{devCode}</code>
            </div>
          )}

          <form onSubmit={submitCode} className="mt-3 flex flex-wrap items-center gap-2">
            <input
              className="input flex-1 min-w-[120px] tracking-[0.4em] text-center font-mono"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              autoFocus
            />
            <button
              type="submit"
              className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={busy || code.length !== 6}
            >
              {busy ? 'Verifying…' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Add / change email form */}
      {!hasPending && (
        <form onSubmit={requestVerify} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
          <Field label={profile.email ? 'Change to' : 'Add email'}>
            <input
              className="input"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>
          <div className="sm:flex sm:items-end">
            <button
              type="submit"
              className="btn-primary text-sm w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={busy || !isValidEmail(newEmail)}
            >
              {busy ? 'Sending…' : 'Send verification code'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Security — change password/pin                                             */
/* ─────────────────────────────────────────────────────────────────────────── */

function Security({
  profile,
  onSuccess,
  onError,
}: {
  profile: UserProfile;
  onSuccess: () => void;
  onError: (t: string) => void;
}) {
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);

  // Patient PIN change states
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  if (!profile.hasPassword) {
    const pinRegex = /^\d{4}$/;
    const pinOk = pinRegex.test(newPin);
    const pinMatches = newPin === confirmPin && confirmPin.length > 0;
    const pinDistinct = newPin !== currentPin || newPin === '';

    const handlePinSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (busy) return;
      if (!pinRegex.test(currentPin)) { onError('Current PIN must be exactly 4 digits'); return; }
      if (!pinOk) { onError('New PIN must be exactly 4 digits'); return; }
      if (!pinMatches) { onError('New PIN and confirmation PIN do not match'); return; }
      if (!pinDistinct) { onError('New PIN must be different from current PIN'); return; }

      setBusy(true);
      try {
        await changePin(currentPin, newPin);
        setCurrentPin(''); setNewPin(''); setConfirmPin('');
        onSuccess();
      } catch (e) {
        onError((e as ApiError).message);
      } finally {
        setBusy(false);
      }
    };

    return (
      <section className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Security & PIN</h3>
            <p className="text-sm text-slate-500">Change your Customer Login PIN.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowPin((s) => !s)}
            className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
          >
            <Icon.Eye className="h-3.5 w-3.5" />
            {showPin ? 'Hide' : 'Show'} PINs
          </button>
        </div>

        <form onSubmit={handlePinSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          <Field label="Current 4-digit PIN" required>
            <input
              className="input"
              type={showPin ? 'text' : 'password'}
              maxLength={4}
              pattern="\d*"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="e.g. 1234"
              required
            />
          </Field>

          <div className="hidden sm:block" />

          <Field label="New 4-digit PIN" required>
            <input
              className="input"
              type={showPin ? 'text' : 'password'}
              maxLength={4}
              pattern="\d*"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="e.g. 5678"
              required
            />
          </Field>

          <Field label="Confirm New PIN" required>
            <input
              className="input"
              type={showPin ? 'text' : 'password'}
              maxLength={4}
              pattern="\d*"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="e.g. 5678"
              required
            />
            {confirmPin && !pinMatches && (
              <p className="mt-1 text-xs text-rose-600">PINs don&apos;t match</p>
            )}
          </Field>

          <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="submit"
              className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={busy || !currentPin || !pinOk || !pinMatches || !pinDistinct}
            >
              {busy ? 'Updating…' : 'Update PIN'}
            </button>
          </div>
        </form>
      </section>
    );
  }

  // Production rules — mirror of backend ChangePasswordDto.
  const ruleLen = newPwd.length >= 8;
  const ruleLetter = /[A-Za-z]/.test(newPwd);
  const ruleDigit = /\d/.test(newPwd);
  const newPwdOk = ruleLen && ruleLetter && ruleDigit;
  const matches = newPwd === confirmPwd && confirmPwd.length > 0;
  const distinct = newPwd !== currentPwd || newPwd === '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!newPwdOk) { onError('New password does not meet the requirements'); return; }
    if (!matches) { onError('New password and confirmation do not match'); return; }
    if (!distinct) { onError('New password must be different from current password'); return; }

    setBusy(true);
    try {
      await changePassword(currentPwd, newPwd);
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
      onSuccess();
    } catch (e) {
      onError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Security</h3>
          <p className="text-sm text-slate-500">Change your account password.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowPwd((s) => !s)}
          className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
        >
          <Icon.Eye className="h-3.5 w-3.5" />
          {showPwd ? 'Hide' : 'Show'} passwords
        </button>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
        <Field label="Current password" required>
          <input
            className="input"
            type={showPwd ? 'text' : 'password'}
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        <div className="hidden sm:block" />

        <Field label="New password" required>
          <input
            className="input"
            type={showPwd ? 'text' : 'password'}
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            autoComplete="new-password"
            required
          />
          {newPwd && (
            <ul className="text-xs space-y-0.5 mt-1">
              <Rule ok={ruleLen}>At least 8 characters</Rule>
              <Rule ok={ruleLetter}>Contains a letter</Rule>
              <Rule ok={ruleDigit}>Contains a digit</Rule>
            </ul>
          )}
        </Field>

        <Field label="Confirm new password" required>
          <input
            className="input"
            type={showPwd ? 'text' : 'password'}
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            autoComplete="new-password"
            required
          />
          {confirmPwd && !matches && (
            <p className="mt-1 text-xs text-rose-600">Passwords don&apos;t match</p>
          )}
        </Field>

        <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="submit"
            className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={busy || !currentPwd || !newPwdOk || !matches || !distinct}
          >
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

function displayRole(role: UserProfile['role']) {
  if (role === 'PATIENT') return '—';
  if (role === 'CLINIC_ADMIN') return 'Business Admin';
  if (role === 'RECEPTIONIST') return 'Receptionist';
  if (role === 'DOCTOR') return 'Doctor';
  if (role === 'ADMIN') return 'Admin';
  return String(role);
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-1">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400 leading-snug">{hint}</p>}
    </label>
  );
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-1.5 ${ok ? 'text-emerald-600' : 'text-slate-400'}`}>
      <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[10px] ${ok ? 'bg-emerald-100' : 'bg-slate-100'}`}>
        {ok ? '✓' : '·'}
      </span>
      {children}
    </li>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Notification settings component                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

function NotificationSettings({
  onSuccess,
  onError,
}: {
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { isSupported, permission, subscribed, loading, subscribe, unsubscribe } = useWebPush();
  const [busy, setBusy] = useState(false);

  async function handleToggle() {
    setBusy(true);
    try {
      if (subscribed) {
        const ok = await unsubscribe();
        if (ok) onSuccess('Web Push notifications disabled for this device');
        else onError('Failed to disable push notifications');
      } else {
        const ok = await subscribe();
        if (ok) onSuccess('Web Push notifications enabled successfully!');
        else onError('Could not enable push notifications. Check browser permissions.');
      }
    } catch (e: any) {
      onError(e.message || 'An error occurred');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Icon.Bell className="h-5 w-5 text-brand-600" />
            Browser Push Notifications
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">
            Receive instant alerts when your turn is coming up, even if your browser tab is backgrounded or minimized.
          </p>
        </div>

        <div>
          {!isSupported ? (
            <span className="pill bg-slate-100 text-slate-600 ring-slate-200">
              Not supported
            </span>
          ) : permission === 'denied' ? (
            <span className="pill bg-rose-50 text-rose-700 ring-rose-200">
              Blocked in browser
            </span>
          ) : subscribed ? (
            <span className="pill bg-emerald-50 text-emerald-700 ring-emerald-200 flex items-center gap-1">
              <Icon.Check className="h-3 w-3" /> Active on this device
            </span>
          ) : (
            <span className="pill bg-amber-50 text-amber-700 ring-amber-200">
              Disabled
            </span>
          )}
        </div>
      </div>

      {permission === 'denied' && (
        <div className="mb-4 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs leading-relaxed">
          <strong>Notifications blocked:</strong> Browser permission was previously denied. To re-enable push notifications, click the site lock icon 🔒 next to your browser URL bar and change &quot;Notifications&quot; to &quot;Allow&quot;.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
        <span className="text-xs text-slate-500">
          Device status: {loading ? 'Checking status…' : subscribed ? 'Push notifications active' : 'Push notifications paused'}
        </span>

        {isSupported && permission !== 'denied' && (
          <button
            type="button"
            onClick={handleToggle}
            disabled={loading || busy}
            className={`btn ${subscribed ? 'btn-secondary !text-rose-600 hover:!bg-rose-50' : 'btn-primary'} !py-1.5 !px-4 text-xs font-semibold`}
          >
            {busy ? 'Processing…' : subscribed ? 'Disable Push Notifications' : 'Enable Push Notifications'}
          </button>
        )}
      </div>
    </section>
  );
}

