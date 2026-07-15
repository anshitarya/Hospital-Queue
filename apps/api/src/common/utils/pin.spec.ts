import { timingSafeEqual } from 'crypto';
import { pinsEqual } from './pin';

describe('pinsEqual', () => {
  it('returns true for matching PINs', () => {
    expect(pinsEqual('4315', '4315')).toBe(true);
  });

  it('returns false for mismatched PINs', () => {
    expect(pinsEqual('4315', '4316')).toBe(false);
  });

  it('returns false when lengths differ', () => {
    expect(pinsEqual('4315', '431')).toBe(false);
  });

  it('uses constant-time comparison', () => {
    const a = '1234';
    const b = '1234';
    expect(pinsEqual(a, b)).toBe(timingSafeEqual(Buffer.from(a), Buffer.from(b)));
  });
});
