/**
 * Central feature flags — toggle via environment variables.
 * All flags default to OFF so new deployments are safe without any config change.
 *
 * To enable a feature on Fly.io:
 *   fly secrets set FEATURE_WHATSAPP=true -a queue-hq-api
 *   fly secrets set FEATURE_SMS=true      -a queue-hq-api
 *
 * When a flag is OFF the app falls back to dev mode: console-logs the message
 * instead of sending it. No provider SDK is called.
 */
export const FEATURES = {
  /** Send WhatsApp messages via Twilio when a patient's turn arrives. */
  WHATSAPP_NOTIFICATIONS: process.env.FEATURE_WHATSAPP === 'true',

  /** Send SMS messages via Twilio when a patient's turn arrives. */
  SMS_NOTIFICATIONS: process.env.FEATURE_SMS === 'true',
} as const;
