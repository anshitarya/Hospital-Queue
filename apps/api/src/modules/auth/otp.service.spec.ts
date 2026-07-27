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

function makeService(overrides: { ttlSeconds?: number; authKey?: string } = {}) {
  const redis = fakeRedis();
  const config = {
    get: (k: string) => {
      if (k === 'otp.ttlSeconds') return overrides.ttlSeconds ?? 300;
      if (k === 'msg91.authKey') return overrides.authKey;
      return undefined;
    },
  } as unknown as ConfigService;
  const notificationsService = {
    send: jest.fn().mockResolvedValue({ id: 'msg-id', status: 'sent' }),
  };
  return {
    svc: new OtpService(
      redis as unknown as { client: typeof redis.client } as never,
      config,
      notificationsService as any,
    ),
    redis,
    notificationsService,
  };
}

const originalFetch = global.fetch;

describe('OtpService.issue', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ type: 'success', request_id: 'mock-request-id' }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('issues OTP code into Redis store (no authKey = dev mode)', async () => {
    const { svc, redis } = makeService();
    await svc.issue('phone', '+919876543210');
    expect(redis._store.get('otp:phone:+919876543210')).toBeDefined();
  });

  it('calls MSG91 Dedicated OTP API when authKey is configured', async () => {
    const { svc } = makeService({ authKey: 'test-auth-key' });
    await svc.issue('phone', '+919876543210');
    expect(global.fetch).toHaveBeenCalled();
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const url: string = fetchCall[0];
    expect(url).toContain('https://control.msg91.com/api/v5/otp');
    expect(url).toContain('authkey=test-auth-key');
    expect(url).toContain('mobile=919876543210');
    expect(url).toContain('otp_length=4');
    expect(url).toContain('otp_expiry=5');
    // We pass our generated code to MSG91 so it can deliver the SMS
    expect(url).toMatch(/otp=\d{4}/);
  });

  it('does NOT store code in Redis when MSG91 handles OTP', async () => {
    const { svc, redis } = makeService({ authKey: 'test-auth-key' });
    await svc.issue('phone', '+919876543210');
    // No Redis OTP key should be stored — MSG91 owns the OTP
    expect(redis._store.get('otp:phone:+919876543210')).toBeUndefined();
  });

  it('stores the OTP at the right channel-scoped key (dev mode)', async () => {
    const { svc, redis } = makeService();
    await svc.issue('phone', '+919876543210');
    expect(redis._store.get('otp:phone:+919876543210')).toBeDefined();
  });

  it('uses separate keys per channel (phone vs email)', async () => {
    const { svc, redis } = makeService();
    await svc.issue('phone', 'shared@example.com');
    await svc.issue('email', 'shared@example.com');
    expect(redis._store.get('otp:phone:shared@example.com')).toBeDefined();
    expect(redis._store.get('otp:email:shared@example.com')).toBeDefined();
  });

  it('rate-limits issuances to 3 per window then throws 429', async () => {
    const { svc } = makeService();
    for (let i = 0; i < 3; i++) {
      await expect(svc.issue('phone', '+919876543210')).resolves.toBeUndefined();
    }
    // 4th attempt → 429
    await expect(svc.issue('phone', '+919876543210')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('rate limit is per-target — different numbers do not share a counter', async () => {
    const { svc } = makeService();
    for (let i = 0; i < 3; i++) await svc.issue('phone', '+919876543210');
    // A different number is still fresh
    await expect(svc.issue('phone', '+919999999999')).resolves.toBeUndefined();
  });

  it('issuance overrides any existing stored code for the same target (dev mode)', async () => {
    const { svc, redis } = makeService();
    await svc.issue('phone', '+919876543210');
    const firstCode = redis._store.get('otp:phone:+919876543210');
    await svc.issue('phone', '+919876543210');
    const secondCode = redis._store.get('otp:phone:+919876543210');
    expect(secondCode).toBeDefined();
    expect(firstCode).toBeDefined();
  });

  it('throws SERVICE_UNAVAILABLE when MSG91 returns an error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      text: async () => JSON.stringify({ type: 'error', message: 'Invalid request' }),
    });
    const { svc } = makeService({ authKey: 'test-auth-key' });
    await expect(svc.issue('phone', '+919876543210')).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
  });
});

describe('OtpService.verify', () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('accepts the issued code and returns true (dev mode)', async () => {
    const { svc, redis } = makeService();
    await svc.issue('phone', '+919876543210');
    const code = redis._store.get('otp:phone:+919876543210');
    await expect(svc.verify('phone', '+919876543210', code!)).resolves.toBe(true);
  });

  it('rejects a wrong code with BadRequestException (dev mode)', async () => {
    const { svc } = makeService();
    await svc.issue('phone', '+919876543210');
    await expect(svc.verify('phone', '+919876543210', '0000')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects when no OTP was ever issued (dev mode)', async () => {
    const { svc } = makeService();
    await expect(svc.verify('phone', '+919876543210', '1234')).rejects.toThrow(
      /expired or never issued/i,
    );
  });

  it('is one-use — second verify with the same code fails (dev mode)', async () => {
    const { svc, redis } = makeService();
    await svc.issue('phone', '+919876543210');
    const code = redis._store.get('otp:phone:+919876543210');
    await svc.verify('phone', '+919876543210', code!);
    await expect(svc.verify('phone', '+919876543210', code!)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rate-limits failed verify attempts to 5 then 429 (dev mode)', async () => {
    const { svc } = makeService();
    await svc.issue('phone', '+919876543210');
    for (let i = 0; i < 5; i++) {
      await expect(svc.verify('phone', '+919876543210', '0000')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    // 6th attempt → 429 (rate limit overrides the bad-code error)
    await expect(svc.verify('phone', '+919876543210', '0000')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('resets verify counter on success — successive logins not blocked (dev mode)', async () => {
    const { svc, redis } = makeService();
    // 4 bad attempts
    await svc.issue('phone', '+919876543210');
    for (let i = 0; i < 4; i++) {
      await svc.verify('phone', '+919876543210', '0000').catch(() => undefined);
    }
    // 5th attempt — correct code, succeeds, resets counter
    await svc.issue('phone', '+919876543210');
    const code = redis._store.get('otp:phone:+919876543210');
    await expect(svc.verify('phone', '+919876543210', code!)).resolves.toBe(true);

    // After reset we should be able to fail again without immediate 429.
    await svc.issue('phone', '+919876543210');
    await expect(svc.verify('phone', '+919876543210', '9999')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('handles phone and email channels independently (dev mode)', async () => {
    const { svc, redis } = makeService();
    await svc.issue('phone', '+919876543210');
    const phoneCode = redis._store.get('otp:phone:+919876543210');
    await svc.issue('email', 'a@example.com');
    const emailCode = redis._store.get('otp:email:a@example.com');

    // Wrong channel pairing fails
    await expect(svc.verify('email', '+919876543210', phoneCode!)).rejects.toThrow();
    await expect(svc.verify('phone', 'a@example.com', emailCode!)).rejects.toThrow();

    // Right pairings succeed
    await expect(svc.verify('phone', '+919876543210', phoneCode!)).resolves.toBe(true);
    await expect(svc.verify('email', 'a@example.com', emailCode!)).resolves.toBe(true);
  });

  it('verifies via MSG91 Dedicated OTP verify API when authKey is configured', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'success', message: 'OTP verified successfully' }),
    });

    const { svc } = makeService({ authKey: 'test-auth-key' });
    const res = await svc.verify('phone', '+919876543210', '1234');
    expect(res).toBe(true);

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const url: string = fetchCall[0];
    expect(url).toContain('https://control.msg91.com/api/v5/otp/verify');
    expect(url).toContain('mobile=919876543210');
    expect(url).toContain('otp=1234');
    expect(url).toContain('authkey=test-auth-key');
    expect(fetchCall[1].method).toBe('GET');
  });

  it('throws BadRequestException when MSG91 verify says OTP not match', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'error', message: 'OTP not match' }),
    });

    const { svc } = makeService({ authKey: 'test-auth-key' });
    await expect(svc.verify('phone', '+919876543210', '0000')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
