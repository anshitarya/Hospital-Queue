import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger('Notification:whatsapp');
  private readonly accessToken: string | undefined;
  private readonly phoneNumberId: string | undefined;
  private readonly useTemplates: boolean;

  constructor(private readonly config: ConfigService) {
    this.accessToken = this.config.get<string>('META_WA_ACCESS_TOKEN');
    this.phoneNumberId = this.config.get<string>('META_WA_PHONE_NUMBER_ID');
    this.useTemplates = this.config.get<string>('META_WA_USE_TEMPLATES') === 'true';
  }

  async sendPrescription(phone: string, patientName: string, doctorName: string, pdfUrl: string) {
    if (!this.accessToken || !this.phoneNumberId) {
      this.logger.warn(
        `META_WA_ACCESS_TOKEN or META_WA_PHONE_NUMBER_ID not set — WhatsApp dropped. Message: Hello ${patientName}, your prescription from Dr. ${doctorName} is ready: ${pdfUrl}`,
      );
      return;
    }

    const to = phone.replace(/\D/g, '');
    let payload: any;

    if (this.useTemplates) {
      const templateName = this.config.get<string>('META_WA_TMPL_PRESCRIPTION') ?? 'prescription_ready';
      payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: patientName },
                { type: 'text', text: doctorName },
                { type: 'text', text: pdfUrl },
              ],
            },
          ],
        },
      };
    } else {
      const body = `Hello ${patientName}, your prescription from Dr. ${doctorName} is ready. You can view or download it here: ${pdfUrl}`;
      payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { preview_url: true, body },
      };
    }

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

      const data = (await res.json()) as any;
      if (!res.ok || data.error) {
        this.logger.error(`Meta WA failed: ${data.error?.message ?? res.statusText}`);
      } else {
        this.logger.log(`WhatsApp prescription link sent to ${to} (wamid: ${data.messages?.[0]?.id})`);
      }
    } catch (err) {
      this.logger.error('Failed to send WhatsApp message', err);
    }
  }
}
