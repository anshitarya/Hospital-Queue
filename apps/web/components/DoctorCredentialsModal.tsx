'use client';

import { useState } from 'react';

/**
 * Persistent confirmation modal shown after a staff member is created
 * directly (i.e. not via invite-code self-signup). Works for both doctors
 * AND receptionists — the only difference is the header label.
 *
 * Why a modal (and not a toast)?
 *   - The temporary password is the ONLY chance the creator has to share it
 *     with the new user. We don't store it server-side — it's immediately
 *     hashed with argon2. If they miss it, they have to delete + recreate.
 *   - A toast auto-dismisses in 4 seconds. A modal stays until the user
 *     explicitly clicks "I've saved these credentials".
 *
 * The component supports all creation flows that return `{ tempPassword }`:
 *   - Reception → `POST /clinics/my/doctors`             (doctor)
 *   - Admin     → `POST /clinics/:id/doctors`            (doctor)
 *   - Admin     → `POST /clinics/:id/receptionists`      (receptionist)
 *
 * Just pass the shared `DoctorCredentials` shape — the `role` field switches
 * the wording in the header.
 */
export interface DoctorCredentials {
  /** "doctor" | "receptionist" | "clinic_admin" — drives header text only. Defaults to doctor. */
  role?: 'doctor' | 'receptionist' | 'clinic_admin';
  name: string;
  /** Whichever identifier the user will use to sign in — email or phone. */
  email: string | null;
  phone: string | null;
  tempPassword: string;
  /** Optional — shown in the header so the admin knows which clinic. */
  clinicName?: string;
}

interface Props {
  credentials: DoctorCredentials | null;
  onClose: () => void;
}

export function DoctorCredentialsModal({ credentials, onClose }: Props) {
  const [showPwd, setShowPwd] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!credentials) return null;

  const { name, email, phone, tempPassword, clinicName } = credentials;
  const role = credentials.role ?? 'doctor';
  const roleLabel =
    role === 'receptionist' ? 'Receptionist'
    : role === 'clinic_admin' ? 'Business Admin'
    : 'Doctor';
  // Prefer email as the "primary" identifier shown first, but show both if present.
  const primaryId = email ?? phone ?? '—';

  function copy(value: string, label: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedField(label);
      // Flash "copied" for 1.5 s, then revert.
      window.setTimeout(() => setCopiedField(null), 1500);
    });
  }

  function copyAll() {
    const lines = [
      `${roleLabel}: ${name}`,
      email ? `Email: ${email}` : null,
      phone ? `Phone: ${phone}` : null,
      `Temporary password: ${tempPassword}`,
      clinicName ? `Clinic: ${clinicName}` : null,
      '',
      'Use the password to sign in once, then change it from the profile page.',
    ]
      .filter(Boolean)
      .join('\n');
    copy(lines, 'All credentials');
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="doctor-cred-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-lg">
              ✓
            </span>
            <div>
              <h2 id="doctor-cred-title" className="font-semibold text-base">
                {roleLabel} account created
              </h2>
              <p className="text-xs text-white/85">
                Share these credentials with {name}
                {clinicName ? ` (${clinicName})` : ''}.
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Warning banner */}
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 ring-1 ring-amber-200 dark:ring-amber-700/50 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <strong>Save this now.</strong> The password is shown only once
            and cannot be recovered.
          </div>

          {/* Name (read-only) — label adapts to the role. */}
          <Field label={`${roleLabel} name`} value={name} />

          {/* Login identifier */}
          {email && (
            <Field
              label="Login email"
              value={email}
              onCopy={() => copy(email, 'Email')}
              copied={copiedField === 'Email'}
            />
          )}
          {phone && (
            <Field
              label="Login mobile"
              value={phone}
              onCopy={() => copy(phone, 'Phone')}
              copied={copiedField === 'Phone'}
            />
          )}

          {/* Temp password */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wider">
                Temporary password
              </label>
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                {showPwd ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="flex gap-2">
              <input
                readOnly
                type={showPwd ? 'text' : 'password'}
                value={tempPassword}
                onFocus={(e) => e.currentTarget.select()}
                className="input flex-1 font-mono"
              />
              <button
                type="button"
                onClick={() => copy(tempPassword, 'Password')}
                className="btn-secondary !px-3 text-xs whitespace-nowrap"
              >
                {copiedField === 'Password' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              The doctor should change this from <em>Profile → Security</em>
              {' '}after their first login.
            </p>
          </div>

          {/* Sign-in URL hint */}
          <div className="rounded-lg bg-slate-50 dark:bg-slate-700 ring-1 ring-slate-200 dark:ring-slate-600 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">
              Sign-in URL
            </div>
            <code className="text-xs text-slate-700 dark:text-slate-200 break-all">
              {typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login'}
            </code>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-1 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={copyAll}
            className="btn-secondary flex-1 text-sm"
          >
            {copiedField === 'All credentials' ? '✓ All copied' : 'Copy everything'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn-primary flex-1 text-sm"
          >
            I&apos;ve saved these
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Small read-only labeled value row with optional copy button. Used for the
 * doctor name + identifier rows in the modal.
 */
function Field({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-600 uppercase tracking-wider">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="input flex-1"
        />
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="btn-secondary !px-3 text-xs whitespace-nowrap"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
}
