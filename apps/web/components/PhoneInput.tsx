'use client';

/**
 * PhoneInput — reusable Indian mobile number field.
 *
 * Responsibilities:
 *  - Renders "+91" prefix addon + 10-digit numeric input
 *  - Strips non-digits and caps at 10 characters on every keystroke
 *  - Runs `validateIndianMobile` and surfaces inline success / error
 *  - Calls `onChange(rawDigits, validationResult)` so the parent only has to
 *    store the raw value — it never needs to re-validate itself
 *
 * Usage:
 *   const [phone, setPhone] = useState('');
 *   const [phoneResult, setPhoneResult] = useState<PhoneValidationResult>({ ok: false });
 *
 *   <PhoneInput
 *     value={phone}
 *     onChange={(raw, result) => { setPhone(raw); setPhoneResult(result); }}
 *   />
 *
 *   // Then submit with phoneResult.e164 (the "+91XXXXXXXXXX" form)
 */

import { useId } from 'react';
import { validateIndianMobile, type PhoneValidationResult } from '@/lib/phone';

export type { PhoneValidationResult };

export interface PhoneInputProps {
  /** Raw 10-digit string stored in the parent (no "+91" prefix). */
  value: string;
  /** Called every time the value changes. */
  onChange: (rawDigits: string, result: PhoneValidationResult) => void;
  /** Field label. Defaults to "Mobile number". Pass `null` to suppress. */
  label?: string | null;
  /** Forwarded to the underlying <input>. */
  autoFocus?: boolean;
  required?: boolean;
  autoComplete?: string;
  /** Extra class names on the outer wrapper div. */
  className?: string;
}

export function PhoneInput({
  value,
  onChange,
  label = 'Mobile number',
  autoFocus,
  required,
  autoComplete = 'tel',
  className = '',
}: PhoneInputProps) {
  const id = useId();
  const check = validateIndianMobile(value);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Strip everything that isn't a digit. Common paste shapes the user might
    // hit us with: "+91 98765 43210", "91 9876543210", "(987) 654-3210",
    // "919876543210". After this line they all collapse to a digits-only string.
    let digits = e.target.value.replace(/\D/g, '');

    // Country-code accommodation. If the cleaned digits are exactly 12 and
    // start with "91", strip the "91" so the user ends up with the canonical
    // 10-digit local form. Without this, a paste of "919438946367" would get
    // truncated by `.slice(0, 10)` to "9194389463" — silently producing the
    // wrong number with the wrong prefix.
    if (digits.length === 12 && digits.startsWith('91')) {
      digits = digits.slice(2);
    }

    const raw = digits.slice(0, 10);
    onChange(raw, validateIndianMobile(raw));
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label !== null && (
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
      )}
      <div className="flex">
        <span className="inline-flex items-center px-3 rounded-l-lg bg-slate-100 border border-r-0 border-slate-200 text-sm text-slate-600 font-medium select-none">
          +91
        </span>
        {/*
          IMPORTANT: do NOT set `maxLength={10}` here. The browser enforces
          maxLength BEFORE our onChange fires — so pasting "+919876543210"
          (13 chars) would arrive in onChange already truncated to 10, and
          our country-code-strip would never see the leading "91". We cap
          to 10 in JS instead (handleChange above).
        */}
        <input
          id={id}
          className="input !rounded-l-none flex-1"
          type="tel"
          inputMode="numeric"
          placeholder="98765 43210"
          value={value}
          onChange={handleChange}
          autoComplete={autoComplete}
          required={required}
          autoFocus={autoFocus}
        />
      </div>
      {/* Inline feedback — only shown when the user has started typing */}
      {value && !check.ok && (
        <p className="text-xs text-rose-600">{check.error}</p>
      )}
      {check.ok && (
        <p className="text-xs text-emerald-600">✓ Valid Indian mobile</p>
      )}
    </div>
  );
}
