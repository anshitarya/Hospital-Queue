import { BadRequestException } from '@nestjs/common';
import { isValidIndianMobile, normalizeIndianMobile } from './phone';

describe('normalizeIndianMobile', () => {
  describe('valid inputs', () => {
    it.each([
      ['9876543210', '+919876543210'],
      ['+919876543210', '+919876543210'],
      ['+91 9876543210', '+919876543210'],
      ['+91-9876-543-210', '+919876543210'],
      ['91 9876543210', '+919876543210'],
      ['(987) 654-3210', '+919876543210'],
      ['6000000000', '+916000000000'],   // starts with 6 — valid
      ['7000000000', '+917000000000'],   // 7 — valid
      ['8000000000', '+918000000000'],   // 8 — valid
      ['9999999999', '+919999999999'],   // 9 — valid
    ])('normalizes %j → %j', (input, expected) => {
      expect(normalizeIndianMobile(input).e164).toBe(expected);
    });

    it('returns both e164 and local form', () => {
      const r = normalizeIndianMobile('9876543210');
      expect(r).toEqual({ e164: '+919876543210', local: '9876543210' });
    });
  });

  describe('invalid inputs', () => {
    it.each([
      '',
      '123',
      '12345',
      '0123456789',          // starts with 0
      '5876543210',          // starts with 5 — not a valid Indian mobile prefix
      '1234567890',          // starts with 1
      '987654321',           // 9 digits
      '98765432101',         // 11 digits — and no "91" prefix
      'abcdefghij',
      'not-a-number',
    ])('rejects %j', (input) => {
      expect(() => normalizeIndianMobile(input)).toThrow(BadRequestException);
    });

    it.each([null, undefined, 1234567890, {}, [], true])(
      'rejects non-string input %j',
      (input) => {
        expect(() => normalizeIndianMobile(input as unknown)).toThrow(BadRequestException);
      },
    );

    it('throws the "10 digits" message for length problems', () => {
      expect(() => normalizeIndianMobile('12345')).toThrow(
        /10 digits/i,
      );
    });

    it('throws the "starts with 6, 7, 8, 9" message for bad prefix', () => {
      expect(() => normalizeIndianMobile('5876543210')).toThrow(
        /6, 7, 8, or 9/,
      );
    });
  });

  describe('whitespace and punctuation tolerance', () => {
    it.each([
      '  9876543210  ',
      '987 654 3210',
      '987-654-3210',
      '+91.9876.543.210',
    ])('strips noise from %j', (input) => {
      expect(normalizeIndianMobile(input).local).toBe('9876543210');
    });
  });
});

describe('isValidIndianMobile', () => {
  it.each([
    ['9876543210', true],
    ['+919876543210', true],
    ['5876543210', false],
    ['', false],
    ['abc', false],
  ])('isValidIndianMobile(%j) === %s', (input, expected) => {
    expect(isValidIndianMobile(input)).toBe(expected);
  });

  it('never throws', () => {
    expect(() => isValidIndianMobile(null)).not.toThrow();
    expect(() => isValidIndianMobile(undefined)).not.toThrow();
    expect(() => isValidIndianMobile({})).not.toThrow();
  });
});
