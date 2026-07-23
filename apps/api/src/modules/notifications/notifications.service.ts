import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NOTIFICATION_PROVIDERS,
  NotificationChannel,
  NotificationProvider,
  OutboundMessage,
} from './notification.provider';
import { FEATURES } from '../../common/features';

import { PushNotificationProvider, StaffBookingNotificationParams } from './push-notification.provider';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(NOTIFICATION_PROVIDERS) private readonly providers: NotificationProvider[],
    private readonly pushProvider: PushNotificationProvider,
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

  /**
   * Dispatches a message to enabled outbound channels (SMS, WhatsApp, and Web Push).
   * When SMS/WhatsApp flags are off, SMS goes to console (dev mode), while Web Push
   * attempts delivery to active browser subscriptions.
   */
  async sendToAll(
    phone: string,
    template: string,
    variables: Record<string, string | number>,
    body: string,
  ): Promise<void> {
    const channels: NotificationChannel[] = [];
    if (FEATURES.SMS_NOTIFICATIONS) channels.push('SMS');
    if (FEATURES.WHATSAPP_NOTIFICATIONS) channels.push('WHATSAPP');
    // Neither flag on → console (dev mode). The ConsoleProvider supports all channels.
    if (channels.length === 0) channels.push('SMS');
    
    // Always attempt Web Push if the target user has active browser subscriptions
    channels.push('PUSH');

    await Promise.allSettled(
      channels.map((ch) => this.send({ channel: ch, to: normalizePhone(phone), template, variables, body })),
    );
  }

  // ── Pre-built message templates ───────────────────────────────────────────

  notifyJoined(phone: string, tokenCode: string, doctorName: string) {
    return this.sendToAll(
      phone,
      'queue_joined',
      { tokenCode, doctorName },
      `You have joined the queue for ${doctorName}. Your token: ${tokenCode}. Track your position live at https://turnos.in`,
    );
  }

  notifyTurnSoon(phone: string, etaMinutes: number, doctorName: string) {
    return this.sendToAll(
      phone,
      'turn_soon',
      { etaMinutes, doctorName },
      `Your turn with ${doctorName} is in approximately ${etaMinutes} minutes. Please head to the clinic.`,
    );
  }

  notifyAlmostNext(phone: string, doctorName: string) {
    return this.sendToAll(
      phone,
      'almost_next',
      { doctorName },
      `You are up next! Please head towards ${doctorName}'s consultation room now.`,
    );
  }

  notifyTurnNow(phone: string, doctorName: string) {
    return this.sendToAll(
      phone,
      'turn_now',
      { doctorName },
      `It's your turn! ${doctorName} is ready to see you now. Please proceed to the consultation room.`,
    );
  }

  notifyDelayed(phone: string, minutes: number, doctorName: string) {
    return this.sendToAll(
      phone,
      'doctor_delayed',
      { minutes, doctorName },
      `${doctorName} is running ~${minutes} minutes late. We will update you as the queue moves.`,
    );
  }

  notifyQueueCleared(phone: string, tokenCode: string) {
    return this.sendToAll(
      phone,
      'queue_cleared',
      { tokenCode },
      `Your appointment (Token ${tokenCode}) has been cancelled. Please contact the clinic for assistance.`,
    );
  }

  notifyDoctorPaused(phone: string, doctorName: string) {
    return this.sendToAll(
      phone,
      'doctor_paused',
      { doctorName },
      `The queue with ${doctorName} has been temporarily paused. We will notify you when it resumes.`,
    );
  }

  notifyDoctorResumed(phone: string, doctorName: string) {
    return this.sendToAll(
      phone,
      'doctor_resumed',
      { doctorName },
      `The queue with ${doctorName} has resumed. Please keep tracking your live status.`,
    );
  }

  notifyDoctorBreak(phone: string, estimatedMinutes: number, doctorName: string) {
    return this.sendToAll(
      phone,
      'doctor_break',
      { estimatedMinutes, doctorName },
      `${doctorName} is on a short ~${estimatedMinutes} min break. Your ETA has been adjusted accordingly.`,
    );
  }

  notifyStaffSelfBooking(params: StaffBookingNotificationParams) {
    return this.pushProvider.sendToStaff(params);
  }
}

/** Normalises Indian phone numbers to E.164 format required by Twilio. */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}
