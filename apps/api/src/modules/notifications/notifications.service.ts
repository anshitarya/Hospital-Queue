import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NOTIFICATION_PROVIDERS,
  NotificationChannel,
  NotificationProvider,
  OutboundMessage,
} from './notification.provider';

/**
 * Picks the first provider that supports the requested channel.
 * Production: route by tenant/cost/priority.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(NOTIFICATION_PROVIDERS) private readonly providers: NotificationProvider[],
  ) {}

  async send(message: OutboundMessage) {
    const provider = this.providers.find((p) => p.supports(message.channel));
    if (!provider) {
      this.logger.warn(`No provider for channel ${message.channel}`);
      return { id: '', status: 'failed' as const };
    }
    try {
      return await provider.send(message);
    } catch (err) {
      this.logger.error(`Provider ${provider.name} failed`, err as Error);
      return { id: '', status: 'failed' as const };
    }
  }

  // Convenience helpers used by call sites — keeps template strings here, not in queue logic.

  notifyTurnSoon(phone: string, etaMinutes: number, doctorName: string) {
    return this.send({
      channel: 'SMS',
      to: phone,
      template: 'turn_soon',
      variables: { etaMinutes, doctorName },
      body: `Your turn with Dr. ${doctorName} is in approximately ${etaMinutes} minutes. Please head to the clinic.`,
    });
  }

  notifyTurnNow(phone: string, doctorName: string) {
    return this.send({
      channel: 'SMS',
      to: phone,
      template: 'turn_now',
      variables: { doctorName },
      body: `Dr. ${doctorName} is ready to see you now. Please proceed to the consultation room.`,
    });
  }

  notifyDelayed(phone: string, minutes: number, doctorName: string) {
    return this.send({
      channel: 'SMS',
      to: phone,
      template: 'doctor_delayed',
      variables: { minutes, doctorName },
      body: `Dr. ${doctorName} is running ~${minutes} minutes late. We will update you as the queue moves.`,
    });
  }
}
