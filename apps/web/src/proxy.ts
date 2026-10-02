import { NextResponse, type NextRequest } from 'next/server';
import { matchRoute } from '@/shared/routing/table';

/**
 * Edge redirect for signed-out visitors (Next 16 proxy, formerly middleware). It reads only
 * the non-secret `lp_role` hint cookie, so it can't grant anything: it just saves a round trip
 * before the page's own guard and the API's real checks.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const access = matchRoute(pathname)?.row.access;
  if (!access || access === 'public' || access === 'guest') return NextResponse.next();
  if (request.cookies.get('lp_role')?.value) return NextResponse.next();
  const login = new URL('/login', request.url);
  login.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Skip static files and Next internals.
  matcher: ['/((?!_next/|.*\\..*).*)'],
};
