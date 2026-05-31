import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ConsoleNotificationProvider } from './console.provider';
import { NOTIFICATION_PROVIDERS } from './notification.provider';

@Module({
  providers: [
    ConsoleNotificationProvider,
    NotificationsService,
    {
      provide: NOTIFICATION_PROVIDERS,
      useFactory: (consoleProvider: ConsoleNotificationProvider) => [consoleProvider],
      inject: [ConsoleNotificationProvider],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
