'use server';

import { loginSchema } from '@jobpilot/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { readSessionFromSetCookie, setSessionCookie } from '@/lib/session';
import { formString } from '@/lib/form';
import { safeNextPath } from '@/lib/redirect';

export interface LoginState {
  error?: string;
  email?: string;
}

function forwardedFor(incoming: Headers): Record<string, string> {
  const chain = incoming.get('x-forwarded-for');
  return chain ? { 'x-forwarded-for': chain } : {};
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const input = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  const email = formString(formData, 'email');
  if (!input.success) return { error: 'Enter your email and password.', email };

  const res = await fetch(`${env.API_INTERNAL_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Pass the client's address chain on, so the API rate-limits per
      // client rather than per web pod. The API decides which hops to trust.
      ...forwardedFor(await headers()),
    },
    body: JSON.stringify(input.data),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) return { error: 'Invalid email or password.', email };
  if (res.status === 429)
    return { error: 'Too many attempts. Wait a minute and try again.', email };
  if (!res.ok) return { error: 'Login is unavailable right now.', email };

  // The API set its session cookie on its response to us; hand the same
  // token to the browser as a cookie on the web app's own domain.
  const session = readSessionFromSetCookie(res.headers.getSetCookie());
  if (!session) return { error: 'Login failed: no session returned.', email };
  await setSessionCookie(session.token, session.maxAge);
  redirect(safeNextPath(formData.get('next')));
}
