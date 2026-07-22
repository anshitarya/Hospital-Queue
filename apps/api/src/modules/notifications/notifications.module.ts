import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { ConsoleNotificationProvider } from './console.provider';
import { Msg91SmsProvider } from './msg91.provider';
import { MetaWhatsappProvider } from './meta-whatsapp.provider';
import { PushNotificationProvider } from './push-notification.provider';
import { NOTIFICATION_PROVIDERS } from './notification.provider';
import { NotificationsController } from './notifications.controller';
import { FEATURES } from '../../common/features';

@Module({
  imports: [ConfigModule],
  controllers: [NotificationsController],
  providers: [
    ConsoleNotificationProvider,
    Msg91SmsProvider,
    MetaWhatsappProvider,
    PushNotificationProvider,
    NotificationsService,
    {
      provide: NOTIFICATION_PROVIDERS,
      useFactory: (
        msg91: Msg91SmsProvider,
        metaWa: MetaWhatsappProvider,
        push: PushNotificationProvider,
        console: ConsoleNotificationProvider,
      ) => {
        // Real providers go first so they handle the channels they support.
        // Console catches everything else (dev mode fallback).
        const real = [
          ...(FEATURES.SMS_NOTIFICATIONS ? [msg91] : []),
          ...(FEATURES.WHATSAPP_NOTIFICATIONS ? [metaWa] : []),
          push,
        ];
        return [...real, console];
      },
      inject: [
        Msg91SmsProvider,
        MetaWhatsappProvider,
        PushNotificationProvider,
        ConsoleNotificationProvider,
      ],
    },
  ],
  exports: [NotificationsService, PushNotificationProvider],
})
export class NotificationsModule {}
