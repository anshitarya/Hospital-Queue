import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FEATURES } from '../../common/features';
import {
  NotificationChannel,
  NotificationProvider,
  OutboundMessage,
} from './notification.provider';

/**
 * Sends transactional SMS via MSG91 (India's most popular SMS gateway).
 *
 * Pricing: ~₹0.15–0.25 per SMS (far cheaper than Twilio for Indian numbers).
 *
 * Required Fly.io secrets (queue-hq-api):
 *   MSG91_AUTH_KEY   — from msg91.com → API → API Key
 *   MSG91_SENDER_ID  — 6-char DLT-registered sender ID, e.g. TURNOS
 *
 * India DLT requirement (mandatory for production):
 *   Before going live you must register on any telecom's DLT portal
 *   (Airtel, JioTrueConnect, BSNL, TRAI TAFCOP) and obtain:
 *     1. Principal Entity ID  → register at the DLT portal
 *     2. Sender ID            → e.g. TURNOS (6 chars)
 *     3. Template IDs         → one per message type (register each template text)
 *   Then add MSG91_DLT_ENTITY_ID and per-template IDs as secrets (see below).
 *
 * Testing without DLT:
 *   MSG91 allows sending to registered test numbers on your account without
 *   DLT approval. Set FEATURE_SMS=true and add your number as a test number
 *   in your MSG91 dashboard to verify the integration before going live.
 */
@Injectable()
export class Msg91SmsProvider implements NotificationProvider {
  readonly name = 'msg91';
  private readonly logger = new Logger('Notification:msg91');

  private readonly authKey: string | undefined;
  private readonly senderId: string;
  private readonly dltEntityId: string | undefined;

  constructor(config: ConfigService) {
    this.authKey = config.get<string>('msg91.authKey');
    this.senderId = config.get<string>('msg91.senderId') ?? 'TURNOS';
    this.dltEntityId = config.get<string>('msg91.dltEntityId');
  }

  supports(channel: NotificationChannel): boolean {
    return channel === 'SMS' && FEATURES.SMS_NOTIFICATIONS;
  }

  async send(msg: OutboundMessage): Promise<{ id: string; status: 'sent' | 'queued' | 'failed' }> {
    if (!this.authKey) {
      this.logger.warn('MSG91_AUTH_KEY not set — SMS dropped');
      return { id: '', status: 'failed' };
    }

    // Normalise phone: MSG91 expects 10-digit number preceded by country code
    const digits = msg.to.replace(/\D/g, '');
    const mobile = digits.startsWith('91') ? digits : `91${digits}`;

    const body: Record<string, unknown> = {
      sender: this.senderId,
      route: '4',    // route 4 = transactional (for notifications, not marketing)
      country: '91',
      sms: [{ message: msg.body ?? msg.template, to: [mobile] }],
    };

    // When DLT entity ID is provided, add it so MSG91 can include it in the
    // outbound header (required by TRAI for commercial SMS in India).
    if (this.dltEntityId) {
      body.dlt_te_id = msg.variables?.templateId as string | undefined;
    }

    try {
      const res = await fetch('https://api.msg91.com/api/v5/sms', {
        method: 'POST',
        headers: {
          authkey: this.authKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as { type?: string; message?: string; request_id?: string };

      if (!res.ok || data.type === 'error') {
        this.logger.error(`MSG91 SMS failed: ${data.message ?? res.status}`);
        return { id: '', status: 'failed' };
      }

      this.logger.log(`SMS sent to ${mobile} (req_id: ${data.request_id ?? '—'})`);
      return { id: data.request_id ?? '', status: 'sent' };
    } catch (err) {
      this.logger.error('MSG91 SMS exception', err as Error);
      return { id: '', status: 'failed' };
    }
  }
}
