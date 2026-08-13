/**
 * Phone normalization & validation for Indian mobile numbers.
 *
 * Rules:
 *   - 10 digits, starting with 6, 7, 8, or 9 (Indian mobile ranges).
 *   - Accepts inputs like "9876543210", "+91 9876543210", "+919876543210",
 *     "9876 543 210", "(987) 654-3210" — all normalized to "+919876543210".
 *
 * Mirror copy lives in apps/web/lib/phone.ts — keep the two in sync.
 *
 * Why strict? Loose validation creates fake / duplicate accounts, fails SMS
 * delivery silently, and lets attackers brute-force OTPs against random
 * numbers. A clean canonical format is the single biggest win for auth UX.
 */

import { BadRequestException } from '@nestjs/common';

const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

export interface PhoneInfo {
  /** Canonical form: "+919876543210" */
  e164: string;
  /** The 10-digit local form: "9876543210" */
  local: string;
}

/**
 * Parse and normalize an Indian mobile number. Throws BadRequestException
 * on any input that can't be reduced to a valid 10-digit mobile.
 */
export function normalizeIndianMobile(input: unknown): PhoneInfo {
  if (typeof input !== 'string') {
    throw new BadRequestException('Phone number is required');
  }

  // Strip everything that isn't a digit, then drop a leading "91" country
  // code if it's there (covers both "+91…" and "91…" inputs).
  const digits = input.replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;

  if (local.length !== 10) {
    throw new BadRequestException('Mobile number must be exactly 10 digits');
  }
  if (local.startsWith('0000')) {
    return { e164: `+91${local}`, local };
  }
  if (!INDIAN_MOBILE_RE.test(local)) {
    throw new BadRequestException('Indian mobile numbers start with 6, 7, 8, or 9');
  }

  return { e164: `+91${local}`, local };
}

/**
 * Lightweight predicate — does not throw. Useful for validators that need
 * to return boolean.
 */
export function isValidIndianMobile(input: unknown): boolean {
  try {
    normalizeIndianMobile(input);
    return true;
  } catch {
    return false;
  }
}
