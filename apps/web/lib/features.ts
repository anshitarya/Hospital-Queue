/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║              WEB  —  MASTER FEATURE FLAGS FILE                  ║
 * ║                                                                  ║
 * ║  This is the ONLY place to turn web/frontend features on or off.║
 * ║  Every flag reads from an environment variable; the value here  ║
 * ║  is the DEFAULT used when that variable is not set.             ║
 * ║                                                                  ║
 * ║  How to flip a flag on Fly.io (production):                     ║
 * ║    fly secrets set <ENV_VAR>=true -a clinicqueue                ║
 * ║  How to flip locally:                                            ║
 * ║    Add the var to your .env or .env.preprod file                 ║
 * ║                                                                  ║
 * ║  API-side flags live in:  apps/api/src/common/features.ts       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * NOTE: This file is read at request time inside Next.js middleware
 * and server components. Do NOT import it in client components
 * ('use client') because process.env is not available in the browser.
 */

export const FEATURES = {

  // ── Super admin portal ────────────────────────────────────────────────────
  /**
   * When OFF : /admin is accessible from any hostname, including localhost
   *            and clinicqueue.fly.dev. Use this until you own the domain.
   * When ON  : /admin only responds to requests arriving on SUPER_ADMIN_HOST.
   *            All other hostnames are redirected to the homepage.
   *
   * Flip ON after:
   *   1. Buying theclinicqueue.com
   *   2. Adding admin.theclinicqueue.com as a Fly.io custom domain
   *   3. Pointing the DNS CNAME to <your-fly-app>.fly.dev
   *   fly secrets set SUPER_ADMIN_LOCKED=true -a clinicqueue
   */
  SUPER_ADMIN_LOCKED: process.env.SUPER_ADMIN_LOCKED === 'true',

  /**
   * The hostname that is allowed to access /admin when SUPER_ADMIN_LOCKED=true.
   * Override if you chose a different subdomain.
   */
  SUPER_ADMIN_HOST: process.env.SUPER_ADMIN_HOST ?? 'admin.theclinicqueue.com',

} as const;
