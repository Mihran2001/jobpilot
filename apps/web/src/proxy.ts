import { NextResponse, type NextRequest } from 'next/server';

/**
 * An optimistic check only: no session cookie means "certainly not logged
 * in", so skip rendering and go to /login. A cookie that exists but is
 * invalid is caught by the API (401), which redirects the same way.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has('jp_session')) return NextResponse.next();
  const login = new URL('/login', request.url);
  login.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the login page, the probe endpoint, Next.js internals and static files.
  matcher: ['/((?!login|healthz|_next/static|_next/image|favicon.ico).*)'],
};
