import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout', '/_next', '/favicon.ico', '/.well-known'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = await verifySession(token);
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
