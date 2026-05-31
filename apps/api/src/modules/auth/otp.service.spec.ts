import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';

/**
 * Build a tiny in-memory fake of the redis client surface OtpService actually
 * uses. Keeps tests fast, deterministic, and self-contained — no need for a
 * real Redis or ioredis-mock.
 */
function fakeRedis() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  return {
    client: {
      async incr(key: string) {
        const v = (Number(store.get(key) ?? '0') + 1);
        store.set(key, String(v));
        return v;
      },
      async expire(key: string, sec: number) {
        ttls.set(key, sec);
        return 1;
      },
      async set(key: string, val: string, _mode?: string, _ttl?: number) {
        store.set(key, val);
        return 'OK';
      },
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async del(key: string) {
        const had = store.has(key) ? 1 : 0;
        store.delete(key);
        return had;
      },
    },
    // Inspection helpers (not part of the redis API — for assertions).
    _store: store,
    _ttls: ttls,
  };
}

function makeService(overrides: { devMode?: boolean; ttlSeconds?: number } = {}) {
  const redis = fakeRedis();
  const config = {
    get: (k: string) => {
      if (k === 'otp.devMode') return overrides.devMode ?? true;
      if (k === 'otp.ttlSeconds') return overrides.ttlSeconds ?? 300;
      return undefined;
    },
  } as unknown as ConfigService;
  return { svc: new OtpService(redis as unknown as { client: typeof redis.client } as never, config), redis };
}

describe('OtpService.issue', () => {
  it('returns devCode in dev mode', async () => {
    const { svc } = makeService({ devMode: true });
    const res = await svc.issue('phone', '+919876543210');
    expect(res.devCode).toMatch(/^\d{6}$/);
  });

  it('omits devCode when devMode=false', async () => {
    const { svc } = makeService({ devMode: false });
    const res = await svc.issue('phone', '+919876543210');
    expect(res.devCode).toBeUndefined();
  });

  it('stores the OTP at the right channel-scoped key', async () => {
    const { svc, redis } = makeService();
    const { devCode } = await svc.issue('phone', '+919876543210');
    expect(redis._store.get('otp:phone:+919876543210')).toBe(devCode);
  });

  it('uses separate keys per channel (phone vs email)', async () => {
    const { svc, redis } = makeService();
    const a = await svc.issue('phone', 'shared@example.com');
    const b = await svc.issue('email', 'shared@example.com');
    expect(redis._store.get('otp:phone:shared@example.com')).toBe(a.devCode);
    expect(redis._store.get('otp:email:shared@example.com')).toBe(b.devCode);
  });

  it('rate-limits issuances to 5 per window then throws 429', async () => {
    const { svc } = makeService();
    for (let i = 0; i < 5; i++) {
      await expect(svc.issue('phone', '+919876543210')).resolves.toBeDefined();
    }
    // 6th attempt → 429
    await expect(svc.issue('phone', '+919876543210')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('rate limit is per-target — different numbers do not share a counter', async () => {
    const { svc } = makeService();
    for (let i = 0; i < 5; i++) await svc.issue('phone', '+919876543210');
    // A different number is still fresh
    await expect(svc.issue('phone', '+919999999999')).resolves.toBeDefined();
  });

  it('issuance overrides any existing stored code for the same target', async () => {
    const { svc, redis } = makeService();
    const first = await svc.issue('phone', '+919876543210');
    const second = await svc.issue('phone', '+919876543210');
    // Different code expected (probabilistically; we just assert the stored
    // one matches `second`, not `first`).
    expect(redis._store.get('otp:phone:+919876543210')).toBe(second.devCode);
    expect(second.devCode).not.toBe(undefined);
    expect(first.devCode).not.toBe(undefined);
  });
});

describe('OtpService.verify', () => {
  it('accepts the issued code and returns true', async () => {
    const { svc } = makeService();
    const { devCode } = await svc.issue('phone', '+919876543210');
    await expect(svc.verify('phone', '+919876543210', devCode!)).resolves.toBe(true);
  });

  it('rejects a wrong code with BadRequestException', async () => {
    const { svc } = makeService();
    await svc.issue('phone', '+919876543210');
    await expect(svc.verify('phone', '+919876543210', '000000')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects when no OTP was ever issued', async () => {
    const { svc } = makeService();
    await expect(svc.verify('phone', '+919876543210', '123456')).rejects.toThrow(
      /expired or never issued/i,
    );
  });

  it('is one-use — second verify with the same code fails', async () => {
    const { svc } = makeService();
    const { devCode } = await svc.issue('phone', '+919876543210');
    await svc.verify('phone', '+919876543210', devCode!);
    await expect(svc.verify('phone', '+919876543210', devCode!)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rate-limits failed verify attempts to 5 then 429', async () => {
    const { svc } = makeService();
    await svc.issue('phone', '+919876543210');
    for (let i = 0; i < 5; i++) {
      await expect(svc.verify('phone', '+919876543210', '000000')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    // 6th attempt → 429 (rate limit overrides the bad-code error)
    await expect(svc.verify('phone', '+919876543210', '000000')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('resets verify counter on success — successive logins not blocked', async () => {
    const { svc } = makeService();
    // 4 bad attempts
    await svc.issue('phone', '+919876543210');
    for (let i = 0; i < 4; i++) {
      await svc.verify('phone', '+919876543210', '000000').catch(() => undefined);
    }
    // 5th attempt — correct code, succeeds, resets counter
    const { devCode } = await svc.issue('phone', '+919876543210');
    await expect(svc.verify('phone', '+919876543210', devCode!)).resolves.toBe(true);

    // After reset we should be able to fail again without immediate 429.
    await svc.issue('phone', '+919876543210');
    await expect(svc.verify('phone', '+919876543210', '999999')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('handles phone and email channels independently', async () => {
    const { svc } = makeService();
    const phoneRes = await svc.issue('phone', '+919876543210');
    const emailRes = await svc.issue('email', 'a@example.com');

    // Wrong channel pairing fails
    await expect(svc.verify('email', '+919876543210', phoneRes.devCode!)).rejects.toThrow();
    await expect(svc.verify('phone', 'a@example.com', emailRes.devCode!)).rejects.toThrow();

    // Right pairings succeed
    await expect(svc.verify('phone', '+919876543210', phoneRes.devCode!)).resolves.toBe(true);
    await expect(svc.verify('email', 'a@example.com', emailRes.devCode!)).resolves.toBe(true);
  });
});
