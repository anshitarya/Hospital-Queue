import { Body, Controller, Get, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PushNotificationProvider } from './push-notification.provider';
import { SubscribePushDto, UnsubscribePushDto } from './dto/push-subscription.dto';

@Controller('notifications/push')
export class NotificationsController {
  constructor(
    private readonly pushProvider: PushNotificationProvider,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Public endpoint to retrieve the VAPID Public Key for Web Push registration.
   */
  @Public()
  @Get('vapid-key')
  getVapidPublicKey() {
    return { publicKey: this.pushProvider.getPublicKey() };
  }

  /**
   * Registers or updates a Web Push subscription for the authenticated user.
   * Customers cannot register subscriptions for other users because req.user.id is enforced.
   */
  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  async subscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubscribePushDto,
  ) {
    const subscription = await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId: user.id,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent || null,
      },
      update: {
        userId: user.id,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent || null,
      },
    });

    return { ok: true, id: subscription.id };
  }

  /**
   * Unsubscribes a Web Push subscription endpoint.
   */
  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  async unsubscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UnsubscribePushDto,
  ) {
    await this.prisma.pushSubscription.deleteMany({
      where: {
        userId: user.id,
        endpoint: dto.endpoint,
      },
    });

    return { ok: true };
  }

  /**
   * Lists active subscriptions for the authenticated user (for settings UI).
   */
  @Get('subscriptions')
  async getSubscriptions(@CurrentUser() user: AuthUser) {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        endpoint: true,
        userAgent: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { subscriptions };
  }
}
