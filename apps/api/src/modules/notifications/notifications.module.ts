import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { ConsoleNotificationProvider } from './console.provider';
import { Msg91SmsProvider } from './msg91.provider';
import { MetaWhatsappProvider } from './meta-whatsapp.provider';
import { NOTIFICATION_PROVIDERS } from './notification.provider';
import { FEATURES } from '../../common/features';

@Module({
  imports: [ConfigModule],
  providers: [
    ConsoleNotificationProvider,
    Msg91SmsProvider,
    MetaWhatsappProvider,
    NotificationsService,
    {
      provide: NOTIFICATION_PROVIDERS,
      useFactory: (
        msg91: Msg91SmsProvider,
        metaWa: MetaWhatsappProvider,
        console: ConsoleNotificationProvider,
      ) => {
        // Real providers go first so they handle the channels they support.
        // Console catches everything else (dev mode fallback).
        const real = [
          ...(FEATURES.SMS_NOTIFICATIONS ? [msg91] : []),
          ...(FEATURES.WHATSAPP_NOTIFICATIONS ? [metaWa] : []),
        ];
        return [...real, console];
      },
      inject: [Msg91SmsProvider, MetaWhatsappProvider, ConsoleNotificationProvider],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
