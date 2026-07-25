import { PushNotificationProvider } from './push-notification.provider';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { OutboundMessage } from './notification.provider';

describe('PushNotificationProvider', () => {
  let provider: PushNotificationProvider;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      pushSubscription: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const config = {
      get: jest.fn((key: string, defaultVal?: string) => {
        if (key === 'VAPID_SUBJECT') return 'mailto:test@turnos.app';
        return defaultVal;
      }),
    };

    provider = new PushNotificationProvider(prisma as unknown as PrismaService, config as unknown as ConfigService);
  });

  it('supports PUSH channel', () => {
    expect(provider.supports('PUSH')).toBe(true);
    expect(provider.supports('SMS')).toBe(false);
    expect(provider.supports('WHATSAPP')).toBe(false);
  });

  it('returns false/failed status when user has no active subscriptions', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([]);

    const msg: OutboundMessage = {
      channel: 'PUSH',
      to: '+919999999999',
      template: 'turn_now',
      body: "It's your turn!",
    };

    const result = await provider.send(msg);
    expect(result.status).toBe('failed');
    expect(result.id).toBe('');
  });
});
