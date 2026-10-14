import type { App } from 'supertest/types.js';
import request from 'supertest';

export const PASSWORD = 'correct horse battery staple';

/** Registers a user and returns the Cookie header value for their session. */
export async function registerUser(server: App, email: string): Promise<string> {
  const res = await request(server)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD })
    .expect(201);
  return sessionCookie(res.headers['set-cookie']);
}

/** Extracts "jp_session=<token>" from a Set-Cookie header. */
export function sessionCookie(setCookie: string | string[] | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const session = cookies.find((c) => c.startsWith('jp_session='));
  if (!session) throw new Error('Response did not set a session cookie');
  return session.split(';')[0] ?? '';
}
