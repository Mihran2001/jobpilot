import type { CookieOptions } from 'express';
import type { AppConfig } from '../../config/config.js';

export const SESSION_COOKIE = 'jp_session';

export function sessionCookieOptions(config: AppConfig, maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true, // page JavaScript cannot read it, so XSS cannot steal it
    sameSite: 'lax', // not sent on cross-site POSTs, which blocks basic CSRF
    secure: config.NODE_ENV === 'production', // HTTPS only outside local dev
    path: '/',
    maxAge: maxAgeMs,
  };
}
