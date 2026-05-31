/**
 * Provider-agnostic notification channel. Swap implementations without touching callers.
 *
 * Available channels: SMS, WHATSAPP, PUSH.
 * A provider may support one or many channels.
 */
export type NotificationChannel = 'SMS' | 'WHATSAPP' | 'PUSH';

export interface OutboundMessage {
  channel: NotificationChannel;
  to: string;     // phone, device token, etc.
  template: string;
  variables?: Record<string, string | number>;
  body?: string;  // optional pre-rendered body for simple providers
}

export interface NotificationProvider {
  readonly name: string;
  supports(channel: NotificationChannel): boolean;
  send(message: OutboundMessage): Promise<{ id: string; status: 'sent' | 'queued' | 'failed' }>;
}

export const NOTIFICATION_PROVIDERS = 'NOTIFICATION_PROVIDERS';
