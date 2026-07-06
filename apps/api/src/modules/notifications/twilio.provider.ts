import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FEATURES } from '../../common/features';
import {
  NotificationChannel,
  NotificationProvider,
  OutboundMessage,
} from './notification.provider';

/**
 * Sends SMS and WhatsApp messages via the Twilio REST API (no SDK needed).
 *
 * Activated when FEATURE_SMS=true (for SMS) or FEATURE_WHATSAPP=true (for WhatsApp).
 * Requires these Fly.io secrets on queue-hq-api:
 *   TWILIO_ACCOUNT_SID  — from console.twilio.com
 *   TWILIO_AUTH_TOKEN   — from console.twilio.com
 *   TWILIO_SMS_FROM     — your Twilio phone number, e.g. +14155552671
 *   TWILIO_WHATSAPP_FROM — your WhatsApp sender, e.g. whatsapp:+14155238886
 */
@Injectable()
export class TwilioNotificationProvider implements NotificationProvider {
  readonly name = 'twilio';
  private readonly logger = new Logger('Notification:twilio');

  private readonly accountSid: string | undefined;
  private readonly authToken: string | undefined;
  private readonly whatsappFrom: string;
  private readonly smsFrom: string;

  constructor(config: ConfigService) {
    this.accountSid = config.get<string>('twilio.accountSid');
    this.authToken = config.get<string>('twilio.authToken');
    this.whatsappFrom = config.get<string>('twilio.whatsappFrom') ?? 'whatsapp:+14155238886';
    this.smsFrom = config.get<string>('twilio.smsFrom') ?? '';
  }

  supports(channel: NotificationChannel): boolean {
    if (channel === 'SMS') return FEATURES.SMS_NOTIFICATIONS;
    if (channel === 'WHATSAPP') return FEATURES.WHATSAPP_NOTIFICATIONS;
    return false;
  }

  async send(msg: OutboundMessage): Promise<{ id: string; status: 'sent' | 'queued' | 'failed' }> {
    if (!this.accountSid || !this.authToken) {
      this.logger.warn(`Twilio credentials not set — ${msg.channel} to ${msg.to} dropped`);
      return { id: '', status: 'failed' };
    }

    const isWhatsApp = msg.channel === 'WHATSAPP';
    const from = isWhatsApp ? this.whatsappFrom : this.smsFrom;
    const to = isWhatsApp ? `whatsapp:${msg.to}` : msg.to;

    if (!from) {
      this.logger.warn(`${msg.channel} sender number not configured (set TWILIO_WHATSAPP_FROM / TWILIO_SMS_FROM)`);
      return { id: '', status: 'failed' };
    }

    try {
      const creds = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${creds}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: from, To: to, Body: msg.body ?? msg.template }).toString(),
      });

      if (!res.ok) {
        this.logger.error(`Twilio ${msg.channel} failed (${res.status}): ${await res.text()}`);
        return { id: '', status: 'failed' };
      }

      const data = (await res.json()) as { sid: string };
      this.logger.log(`${msg.channel} sent to ${msg.to} (sid: ${data.sid})`);
      return { id: data.sid, status: 'sent' };
    } catch (err) {
      this.logger.error(`Twilio ${msg.channel} exception`, err as Error);
      return { id: '', status: 'failed' };
    }
  }
}
