import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationProvider,
  OutboundMessage,
} from './notification.provider';
import { nanoid } from 'nanoid';

/**
 * Dev/MVP stub: logs every outbound message to stdout instead of sending it.
 * Replace by registering a real provider (e.g. TwilioSmsProvider) in NotificationsModule
 * and removing this from the providers list.
 */
@Injectable()
export class ConsoleNotificationProvider implements NotificationProvider {
  readonly name = 'console';
  private readonly logger = new Logger('Notification:console');

  supports(_channel: NotificationChannel): boolean {
    return true;
  }

  async send(message: OutboundMessage) {
    this.logger.log(
      `[${message.channel}] -> ${message.to} :: ${message.body ?? message.template} ${
        message.variables ? JSON.stringify(message.variables) : ''
      }`,
    );
    return { id: nanoid(), status: 'sent' as const };
  }
}
