/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║              API  —  MASTER FEATURE FLAGS FILE                  ║
 * ║                                                                  ║
 * ║  This is the ONLY place to turn API features on or off.         ║
 * ║  Every flag reads from an environment variable; the value here  ║
 * ║  is the DEFAULT used when that variable is not set.             ║
 * ║                                                                  ║
 * ║  How to flip a flag on Fly.io (production):                     ║
 * ║    fly secrets set <ENV_VAR>=true -a turnos-api               ║
 * ║  How to flip locally:                                            ║
 * ║    Add the var to your .env or .env.preprod file                 ║
 * ║                                                                  ║
 * ║  Web-side flags live in:  apps/web/lib/features.ts              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

export const FEATURES = {

  // ── OTP ──────────────────────────────────────────────────────────────────
  /**
   * When ON  : OTPs are printed to stdout (no real SMS sent).
   * When OFF : OTPs are sent via the configured SMS provider.
   * Default  : ON (safe for local dev and preprod)
   * Prod env : set OTP_DEV_MODE=false
   */
  OTP_DEV_MODE: (process.env.OTP_DEV_MODE ?? 'true') === 'true',

  // ── SMS notifications ─────────────────────────────────────────────────────
  /**
   * When ON  : SMS sent via MSG91 (requires MSG91_AUTH_KEY secret).
   * When OFF : notification is console-logged only (dev mode).
   * Flip via : fly secrets set FEATURE_SMS=true -a turnos-api
   */
  SMS_NOTIFICATIONS: process.env.FEATURE_SMS === 'true',

  // ── WhatsApp notifications ────────────────────────────────────────────────
  /**
   * When ON  : WhatsApp message sent via Meta Cloud API
   *            (requires META_WA_ACCESS_TOKEN + META_WA_PHONE_NUMBER_ID secrets).
   * When OFF : notification is console-logged only (dev mode).
   * Flip via : fly secrets set FEATURE_WHATSAPP=true -a turnos-api
   */
  WHATSAPP_NOTIFICATIONS: process.env.FEATURE_WHATSAPP === 'true',

  /**
   * Controls HOW WhatsApp messages are sent:
   * When OFF : plain text messages — works within a 24-hour session window
   *            or to registered sandbox test numbers. Good for dev + preprod.
   * When ON  : approved template messages — required for business-initiated
   *            outbound messages to cold contacts (production use).
   * Flip via : fly secrets set META_WA_USE_TEMPLATES=true -a turnos-api
   */
  WHATSAPP_USE_TEMPLATES: process.env.META_WA_USE_TEMPLATES === 'true',

  // ── Queue ordering ────────────────────────────────────────────────────────
  /**
   * false → legacy: walk-in gaps, follow-up interleaving, missed rejoin near current position
   * true  → FIFO  : all patients join at end; emergency still jumps to front;
   *                 missed patients rejoin at the END; walk-in/follow-up gaps ignored
   */
  FIFO_QUEUE_ORDERING: true,

  // ── Authentication ────────────────────────────────────────────────────────
  /**
   * AUTH_MODE: Convenience alias ("development" | "production").
   *
   * ENABLE_GOOGLE_AUTH:
   *   When ON  : POST /auth/staff/google endpoint is active.
   *              Staff can log in via Google Sign-In (requires GOOGLE_CLIENT_ID).
   *   When OFF : Google endpoint returns 400; password login is the only option.
   *   Prod env : set ENABLE_GOOGLE_AUTH=true + GOOGLE_CLIENT_ID=<your-client-id>
   *
   * ENABLE_DEV_AUTH_BYPASS:
   *   When ON  : email+password staff login (POST /auth/staff/login) is allowed.
   *   When OFF : that endpoint returns 400 — forces all staff to use Google.
   *   Prod env : set ENABLE_DEV_AUTH_BYPASS=false
   */
  AUTH_MODE: (process.env.AUTH_MODE ?? 'development') as 'development' | 'production',

  ENABLE_GOOGLE_AUTH: process.env.ENABLE_GOOGLE_AUTH === 'true',

  ENABLE_DEV_AUTH_BYPASS: process.env.ENABLE_DEV_AUTH_BYPASS !== 'false',

} as const;

