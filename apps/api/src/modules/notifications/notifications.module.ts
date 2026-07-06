import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { ConsoleNotificationProvider } from './console.provider';
import { TwilioNotificationProvider } from './twilio.provider';
import { NOTIFICATION_PROVIDERS } from './notification.provider';
import { FEATURES } from '../../common/features';

@Module({
  imports: [ConfigModule],
  providers: [
    ConsoleNotificationProvider,
    TwilioNotificationProvider,
    NotificationsService,
    {
      provide: NOTIFICATION_PROVIDERS,
      useFactory: (
        twilio: TwilioNotificationProvider,
        console: ConsoleNotificationProvider,
      ) => {
        // When any real channel is enabled, put Twilio first so it handles
        // the channels it supports. Console catches everything else (dev mode).
        const hasRealChannel = FEATURES.SMS_NOTIFICATIONS || FEATURES.WHATSAPP_NOTIFICATIONS;
        return hasRealChannel ? [twilio, console] : [console];
      },
      inject: [TwilioNotificationProvider, ConsoleNotificationProvider],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
