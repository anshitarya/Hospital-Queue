import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FEATURES } from '../../common/features';
import {
  NotificationChannel,
  NotificationProvider,
  OutboundMessage,
} from './notification.provider';

/**
 * Sends WhatsApp messages via Meta's official WhatsApp Cloud API.
 *
 * Free tier: 1,000 business-initiated conversations per month.
 * After that: ~$0.004–0.007 per conversation (very cheap).
 *
 * Required Fly.io secrets (queue-hq-api):
 *   META_WA_ACCESS_TOKEN    — permanent System User token from Meta Business Manager
 *   META_WA_PHONE_NUMBER_ID — found in WhatsApp > Getting Started in Meta Developer portal
 *
 * Two messaging modes (controlled by META_WA_USE_TEMPLATES):
 *
 *   false (default / testing):
 *     Sends plain text messages. Only works within a 24-hour session window
 *     (after the user messages you first) or to test numbers registered in
 *     your Meta Developer app. Good enough to verify the integration works.
 *
 *   true (production):
 *     Sends pre-approved template messages. Needed for outbound notifications
 *     (business-initiated) where the user has not messaged you in the last 24h.
 *     Template names are configurable (META_WA_TMPL_*). Defaults are provided
 *     but your Meta account templates must match these names exactly.
 *
 * Setup steps are listed at the bottom of this file.
 */
@Injectable()
export class MetaWhatsappProvider implements NotificationProvider {
  readonly name = 'meta-whatsapp';
  private readonly logger = new Logger('Notification:meta-wa');

  private readonly accessToken: string | undefined;
  private readonly phoneNumberId: string | undefined;
  private readonly useTemplates: boolean;

  // Default template names — register these in Meta Business Manager → WhatsApp Templates.
  // Override via env vars if you used different names.
  private readonly templates: Record<string, string>;

  constructor(config: ConfigService) {
    this.accessToken = config.get<string>('metaWa.accessToken');
    this.phoneNumberId = config.get<string>('metaWa.phoneNumberId');
    this.useTemplates = config.get<string>('metaWa.useTemplates') === 'true';
    this.templates = {
      queue_joined:    config.get<string>('metaWa.tmplQueueJoined')    ?? 'cq_queue_joined',
      turn_soon:       config.get<string>('metaWa.tmplTurnSoon')       ?? 'cq_turn_soon',
      almost_next:     config.get<string>('metaWa.tmplAlmostNext')     ?? 'cq_almost_next',
      turn_now:        config.get<string>('metaWa.tmplTurnNow')        ?? 'cq_turn_now',
      doctor_delayed:  config.get<string>('metaWa.tmplDoctorDelayed')  ?? 'cq_doctor_delayed',
      queue_cleared:   config.get<string>('metaWa.tmplQueueCleared')   ?? 'cq_queue_cleared',
    };
  }

  supports(channel: NotificationChannel): boolean {
    return channel === 'WHATSAPP' && FEATURES.WHATSAPP_NOTIFICATIONS;
  }

  async send(msg: OutboundMessage): Promise<{ id: string; status: 'sent' | 'queued' | 'failed' }> {
    if (!this.accessToken || !this.phoneNumberId) {
      this.logger.warn('META_WA_ACCESS_TOKEN or META_WA_PHONE_NUMBER_ID not set — WhatsApp dropped');
      return { id: '', status: 'failed' };
    }

    // Strip non-digits; Meta expects E.164 without the '+'
    const to = msg.to.replace(/\D/g, '');

    const payload = this.useTemplates
      ? this.buildTemplatePayload(to, msg)
      : this.buildTextPayload(to, msg.body ?? msg.template);

    try {
      const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as {
        messages?: Array<{ id: string }>;
        error?: { message: string; code: number };
      };

      if (!res.ok || data.error) {
        this.logger.error(`Meta WA failed: ${data.error?.message ?? res.status}`);
        return { id: '', status: 'failed' };
      }

      const msgId = data.messages?.[0]?.id ?? '';
      this.logger.log(`WhatsApp sent to ${to} (wamid: ${msgId})`);
      return { id: msgId, status: 'sent' };
    } catch (err) {
      this.logger.error('Meta WA exception', err as Error);
      return { id: '', status: 'failed' };
    }
  }

  private buildTextPayload(to: string, body: string) {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { preview_url: false, body },
    };
  }

  private buildTemplatePayload(to: string, msg: OutboundMessage) {
    const templateName = this.templates[msg.template] ?? msg.template;
    const vars = msg.variables ?? {};

    // Map variables to positional parameters ({{1}}, {{2}}, …).
    // The order must match the template body registered in Meta Business Manager.
    const parameters = Object.values(vars).map((v) => ({
      type: 'text',
      text: String(v),
    }));

    return {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components: parameters.length
          ? [{ type: 'body', parameters }]
          : [],
      },
    };
  }
}

/*
 * ── Setup guide ────────────────────────────────────────────────────────────────
 *
 * A. Create a Meta Developer App
 *    1. Go to https://developers.facebook.com → My Apps → Create App
 *    2. Choose "Business" type
 *    3. Under "Add Products", click WhatsApp → Set Up
 *
 * B. Get a Phone Number
 *    1. In WhatsApp → Getting Started, Meta gives you a FREE test number.
 *       - Useful for sandbox testing (up to 5 test recipient numbers, free)
 *    2. For production: add a real Indian number (or buy one from Meta) under
 *       WhatsApp → Phone Numbers → Add Phone Number.
 *    3. Copy the Phone Number ID (NOT the number itself).
 *
 * C. Get an Access Token
 *    1. For testing: use the "Temporary access token" in Getting Started (expires in 24h).
 *    2. For production: create a System User in Meta Business Settings →
 *       System Users → Add → assign "Generate Access Token" permission.
 *       This token never expires.
 *
 * D. Set Fly.io secrets
 *    fly secrets set META_WA_ACCESS_TOKEN=<token>      -a queue-hq-api
 *    fly secrets set META_WA_PHONE_NUMBER_ID=<id>      -a queue-hq-api
 *    fly secrets set FEATURE_WHATSAPP=true             -a queue-hq-api
 *
 * E. Register message templates (for production / META_WA_USE_TEMPLATES=true)
 *    Go to Meta Business Manager → WhatsApp Manager → Message Templates → Create
 *    Create templates with these names (or override with META_WA_TMPL_* env vars):
 *      cq_queue_joined    — "You have joined the queue for {{1}}. Token: {{2}}."
 *      cq_almost_next     — "You are up next for {{1}}. Please head to the room."
 *      cq_turn_now        — "It's your turn! {{1}} is ready to see you now."
 *      cq_queue_cleared   — "Appointment {{1}} was cancelled. Contact the clinic."
 *    Templates take 1–3 business days to get approved.
 *
 * F. Testing
 *    Set META_WA_USE_TEMPLATES=false in dev/preprod.
 *    Add your personal WhatsApp number as a test recipient in Meta Developer portal.
 *    Set FEATURE_WHATSAPP=true and trigger a queue event — you should receive a WA message.
 */
