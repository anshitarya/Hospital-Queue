import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { FEATURES } from '@/lib/features';

export function middleware(request: NextRequest) {
  if (!FEATURES.SUPER_ADMIN_LOCKED) return NextResponse.next();

  const host = request.headers.get('host') ?? '';
  if (host !== FEATURES.SUPER_ADMIN_HOST) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
