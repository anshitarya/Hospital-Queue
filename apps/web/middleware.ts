import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const session = request.cookies.get('hq_session');
  const { pathname } = request.nextUrl;

  // Protect dashboard routes
  const protectedRoutes = ['/reception', '/doctor', '/patient', '/admin', '/profile'];
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));

  if (isProtected && !session) {
    // Redirect to patient or staff login
    const loginUrl = pathname.startsWith('/patient') ? '/login/patient' : '/login';
    return NextResponse.redirect(new URL(loginUrl, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/reception/:path*',
    '/doctor/:path*',
    '/patient/:path*',
    '/admin/:path*',
    '/profile/:path*',
  ],
};
