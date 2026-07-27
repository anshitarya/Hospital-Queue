import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';

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
    _store: store,
    _ttls: ttls,
  };
}

function makeService(overrides: { ttlSeconds?: number; authKey?: string; widgetId?: string } = {}) {
  const redis = fakeRedis();
  const config = {
    get: (k: string) => {
      if (k === 'otp.ttlSeconds') return overrides.ttlSeconds ?? 300;
      if (k === 'msg91.authKey') return overrides.authKey ?? 'test-auth-key';
      if (k === 'msg91.widgetId') return overrides.widgetId ?? 'test-widget-id';
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
      text: async () => JSON.stringify({ type: 'success', message: 'mock-req-id' }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('calls MSG91 Widget sendOtp API and stores reqId in Redis', async () => {
    const { svc, redis } = makeService({ authKey: 'test-auth-key', widgetId: 'test-widget-id' });
    await svc.issue('phone', '+919876543210');
    expect(global.fetch).toHaveBeenCalled();
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const url: string = fetchCall[0];
    expect(url).toContain('https://control.msg91.com/api/v5/widget/sendOtp');
    expect(url).toContain('authkey=test-auth-key');
    expect(url).toContain('widgetId=test-widget-id');
    expect(redis._store.get('otp:reqId:+919876543210')).toBe('mock-req-id');
  });

  it('rate-limits issuances to 5 per window then throws 429', async () => {
    const { svc } = makeService();
    for (let i = 0; i < 5; i++) {
      await expect(svc.issue('phone', '+919876543210')).resolves.toBeUndefined();
    }
    await expect(svc.issue('phone', '+919876543210')).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });
});

describe('OtpService.verify', () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('verifies code strictly via MSG91 Widget verifyOtp API', async () => {
    const { svc, redis } = makeService({ authKey: 'test-auth-key', widgetId: 'test-widget-id' });
    await redis.client.set('otp:reqId:+919876543210', 'mock-req-id');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'success', message: 'OTP verified' }),
    });

    const res = await svc.verify('phone', '+919876543210', '1234');
    expect(res).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://control.msg91.com/api/v5/widget/verifyOtp',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: 'test-auth-key',
        },
        body: JSON.stringify({
          widgetId: 'test-widget-id',
          reqId: 'mock-req-id',
          otp: '1234',
        }),
      }),
    );
  });

  it('rejects when no reqId was stored', async () => {
    const { svc } = makeService();
    await expect(svc.verify('phone', '+919876543210', '1234')).rejects.toThrow(
      BadRequestException,
    );
  });
});
