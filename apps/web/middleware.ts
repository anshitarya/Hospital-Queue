import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Super-admin domain gating.
 *
 * SUPER_ADMIN_LOCKED controls whether /admin is domain-restricted:
 *
 *   false (default) — /admin works from any hostname, including localhost and
 *                     clinicqueue.fly.dev. Use this until you own the domain.
 *
 *   true            — /admin only responds when the request arrives on
 *                     admin.theclinicqueue.com. All other hostnames get
 *                     redirected to the homepage. Flip this after you:
 *                       1. Buy theclinicqueue.com
 *                       2. Add admin.theclinicqueue.com as a Fly.io custom domain
 *                       3. Point the DNS CNAME → <your-fly-app>.fly.dev
 *                       4. Run: fly secrets set SUPER_ADMIN_LOCKED=true -a clinicqueue
 */
export function middleware(request: NextRequest) {
  const isLocked = process.env.SUPER_ADMIN_LOCKED === 'true';

  if (!isLocked) return NextResponse.next();

  const host = request.headers.get('host') ?? '';
  const allowedHost = process.env.SUPER_ADMIN_HOST ?? 'admin.theclinicqueue.com';

  if (host !== allowedHost) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
