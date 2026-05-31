/**
 * Phone normalization & validation — Indian mobile numbers.
 *
 * Mirror of apps/api/src/common/utils/phone.ts so the client and server
 * agree on the canonical format. Always normalize before sending to the
 * API so the database stores "+919876543210" — not "9876 543 210" or
 * "+91-9876-543-210".
 */

const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

export interface PhoneValidationResult {
  ok: boolean;
  e164?: string;       // "+919876543210"
  local?: string;      // "9876543210"
  error?: string;
}

export function validateIndianMobile(input: string): PhoneValidationResult {
  if (!input) return { ok: false, error: 'Mobile number is required' };

  const digits = input.replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;

  if (local.length !== 10) {
    return { ok: false, error: 'Enter exactly 10 digits' };
  }
  if (!INDIAN_MOBILE_RE.test(local)) {
    return { ok: false, error: 'Indian mobile numbers start with 6, 7, 8, or 9' };
  }

  return { ok: true, e164: `+91${local}`, local };
}

/**
 * Format for display: "+91 98765 43210". Pass either the e164 or local
 * form — accepts both.
 */
export function formatIndianMobile(input: string | null | undefined): string {
  if (!input) return '';
  const r = validateIndianMobile(input);
  if (!r.ok || !r.local) return input;
  return `+91 ${r.local.slice(0, 5)} ${r.local.slice(5)}`;
}
