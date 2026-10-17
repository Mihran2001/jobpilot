import 'server-only';
import { cookies } from 'next/headers';
import { env } from './env';

/** Same name as the API's cookie: the web app holds the token on its own domain. */
export const SESSION_COOKIE = 'jp_session';

/** Only callable from Server Actions and Route Handlers (Next.js rule). */
export async function setSessionCookie(token: string, maxAgeSeconds: number): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // page JavaScript can never read it
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Pulls the session token and its lifetime out of the API's Set-Cookie
 * header, e.g. "jp_session=abc; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax".
 */
export function readSessionFromSetCookie(
  setCookies: string[],
): { token: string; maxAge: number } | null {
  const header = setCookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!header) return null;
  const token = header.slice(SESSION_COOKIE.length + 1).split(';')[0] ?? '';
  const maxAge = Number(/max-age=(\d+)/i.exec(header)?.[1] ?? 0);
  return token && maxAge > 0 ? { token, maxAge } : null;
}
