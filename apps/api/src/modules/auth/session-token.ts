import { createHash, randomBytes } from 'node:crypto';

/** 256 random bits, URL-safe. This is what goes in the cookie. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What goes in the database. A fast hash is enough here: unlike a password,
 * the token is 256 random bits, so there is nothing to guess or brute-force.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
