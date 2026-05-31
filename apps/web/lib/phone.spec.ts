import { describe, expect, it } from 'vitest';
import { formatIndianMobile, validateIndianMobile } from './phone';

describe('validateIndianMobile', () => {
  describe('valid inputs', () => {
    it.each([
      ['9876543210', '+919876543210'],
      ['+919876543210', '+919876543210'],
      ['+91 9876543210', '+919876543210'],
      ['+91-9876-543-210', '+919876543210'],
      ['91 9876543210', '+919876543210'],
      ['(987) 654-3210', '+919876543210'],
      ['6000000000', '+916000000000'],
      ['7000000000', '+917000000000'],
      ['8000000000', '+918000000000'],
      ['9999999999', '+919999999999'],
    ])('validates %j → e164=%j', (input, expected) => {
      const r = validateIndianMobile(input);
      expect(r.ok).toBe(true);
      expect(r.e164).toBe(expected);
    });

    it('returns local form alongside e164', () => {
      const r = validateIndianMobile('9876543210');
      expect(r.local).toBe('9876543210');
    });

    it('has no error on success', () => {
      const r = validateIndianMobile('9876543210');
      expect(r.error).toBeUndefined();
    });
  });

  describe('invalid inputs', () => {
    it('rejects empty input with "required" message', () => {
      const r = validateIndianMobile('');
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/required/i);
    });

    it.each(['123', '12345', '987654321', 'abcdefghij'])(
      'rejects too-short or non-numeric %j',
      (input) => {
        const r = validateIndianMobile(input);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/10 digits/i);
      },
    );

    it.each(['0123456789', '5876543210', '1234567890'])(
      'rejects bad prefix %j',
      (input) => {
        const r = validateIndianMobile(input);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/6, 7, 8, or 9/);
      },
    );
  });

  it('treats leading 91 as a country code, not part of the 10 digits', () => {
    const r = validateIndianMobile('919876543210');
    expect(r.ok).toBe(true);
    expect(r.e164).toBe('+919876543210');
  });
});

describe('formatIndianMobile', () => {
  it('formats a 10-digit input as "+91 XXXXX XXXXX"', () => {
    expect(formatIndianMobile('9876543210')).toBe('+91 98765 43210');
  });

  it('formats an e164 input the same way', () => {
    expect(formatIndianMobile('+919876543210')).toBe('+91 98765 43210');
  });

  it('returns "" for null / undefined', () => {
    expect(formatIndianMobile(null)).toBe('');
    expect(formatIndianMobile(undefined)).toBe('');
  });

  it('returns the input unchanged when it cannot be validated', () => {
    expect(formatIndianMobile('garbage')).toBe('garbage');
  });
});
