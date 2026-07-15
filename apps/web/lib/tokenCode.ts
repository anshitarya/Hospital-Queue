/**
 * Converts a numeric queue token (1, 2, 3…) to a 3-letter display code
 * (e.g. "FOF", "PVM", "ACT").
 *
 * Why: sequential numbers look clinical. 3-letter codes are easier to read
 * aloud, less prone to mis-hearing, and feel less like a simple counter.
 *
 * Implementation: a bijective linear-congruential shuffle on the space
 * 0..17575 (26³). Parameters chosen so every token 1-17576 maps to a
 * unique code. More than enough for any single doctor's daily queue.
 *
 *   a = 6949  (prime → gcd(a, 17576) = 1 → full-cycle permutation)
 *   addend = 3749  (salt so token 1 doesn't map to AAA)
 *   m = 17576  (26³)
 */

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const M = 17576; // 26^3
const A = 6949;
const ADD = 3749;

export function tokenToCode(n: number): string {
  if (n <= 0) return '---';
  const x = (((n - 1) * A) + ADD) % M;
  return (
    CHARS[Math.floor(x / 676)] +
    CHARS[Math.floor((x % 676) / 26)] +
    CHARS[x % 26]
  );
}

/** Display helper — returns "#FOF" style string. */
export function tokenDisplay(n: number): string {
  if (n <= 0) return '#…';
  return `#${tokenToCode(n)}`;
}

/**
 * Returns true if the search query (e.g. "FO" or "#FOF") matches the
 * code for a given token number. Case-insensitive, leading # stripped.
 */
export function matchesTokenSearch(query: string, tokenNumber: number): boolean {
  const q = query.replace(/^#/, '').toUpperCase().trim();
  if (!q) return false;
  return tokenToCode(tokenNumber).startsWith(q);
}
