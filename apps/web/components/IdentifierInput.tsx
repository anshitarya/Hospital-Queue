'use client';

/**
 * IdentifierInput — smart email-OR-phone input for staff login.
 *
 * Staff can sign in with either their registered email or their 10-digit
 * Indian mobile. This component detects which mode the user is typing in and
 * surfaces appropriate inline validation:
 *
 *   - If the value contains "@"          → email mode  (no strict live check)
 *   - If the value is all digits ≤10     → phone mode  (full phone validation)
 *   - If the value is empty              → neutral placeholder shown
 *
 * The "+91" prefix is shown as a non-selectable badge inside the input row
 * only in phone mode, so the field doesn't jump around — it uses padding
 * instead of an absolutely-positioned addon.
 *
 * The parent receives the raw string unchanged (it sends it straight to the
 * API, which normalises both forms server-side).
 */

import { useId } from 'react';
import { validateIndianMobile } from '@/lib/phone';

type Mode = 'neutral' | 'phone' | 'email';

function detectMode(value: string): Mode {
  if (!value) return 'neutral';
  if (value.includes('@')) return 'email';
  if (/^\d+$/.test(value)) return 'phone';
  return 'neutral';
}

export interface IdentifierInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  autoFocus?: boolean;
  required?: boolean;
}

export function IdentifierInput({
  value,
  onChange,
  label = 'ID',
  autoFocus,
  required,
}: IdentifierInputProps) {
  const id = useId();
  const mode = detectMode(value);
  const phoneCheck = mode === 'phone' ? validateIndianMobile(value) : null;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    let raw = e.target.value;

    // Phone-shape handling. We consider the input "phone-shaped" if it has
    // no "@" and contains only the characters a phone number can have:
    // digits, spaces, "+", "-", "(", ")". That captures both raw pastes
    // ("+91 98765 43210") and step-by-step typing.
    const isPhoneShaped = raw.length > 0 && !raw.includes('@') && /^[\d\s+\-()]+$/.test(raw);
    if (isPhoneShaped) {
      // Strip everything that isn't a digit and apply the country-code rule
      // (12 digits + "91" prefix → drop the "91"). Then cap at 10 — anything
      // longer is rejected without firing onChange so the input visually
      // stays at the previous valid state.
      let cleaned = raw.replace(/\D/g, '');
      if (cleaned.length === 12 && cleaned.startsWith('91')) {
        cleaned = cleaned.slice(2);
      }
      if (cleaned.length > 10) return;
      raw = cleaned;
    }

    onChange(raw);
  }

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
          {label}
        </label>
      )}

      <div className="relative flex">
        {/* +91 badge — only visible in phone mode, uses absolute positioning
            so the input width never changes */}
        {mode === 'phone' && (
          <span className="inline-flex items-center px-3 rounded-l-2xl bg-slate-100 dark:bg-white/10 border border-r-0 border-slate-200 dark:border-white/10 text-sm text-slate-600 dark:text-slate-300 font-medium select-none shrink-0 backdrop-blur-xl">
            +91
          </span>
        )}
        {/*
          NOTE: no `maxLength={10}` on the input. The browser enforces maxLength
          BEFORE our onChange fires, which would truncate "+919876543210"
          (13 chars) to 10 before our country-code strip could run. We cap
          length in JS instead — see handleChange above.
        */}
        <input
          id={id}
          className={`input flex-1 ${mode === 'phone' ? '!rounded-l-none' : ''}`}
          type={mode === 'email' ? 'email' : 'text'}
          inputMode={mode === 'phone' ? 'numeric' : 'text'}
          placeholder="Your-login-ID"
          autoComplete="username"
          value={value}
          onChange={handleChange}
          required={required}
          autoFocus={autoFocus}
        />
      </div>

      {/* Mode-specific feedback */}
      {mode === 'phone' && phoneCheck && (
        <>
          {value && !phoneCheck.ok && (
            <p className="text-xs text-rose-600">{phoneCheck.error}</p>
          )}
          {phoneCheck.ok && (
            <p className="text-xs text-emerald-600">✓ Valid Indian mobile</p>
          )}
        </>
      )}
      {mode === 'neutral' && !value && (
        <p className="text-[11px] text-slate-400 mt-1">
          Use the ID provided to login
        </p>
      )}
    </div>
  );
}
