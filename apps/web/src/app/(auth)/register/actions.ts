'use server';

import { registerSchema } from '@jobpilot/shared';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { formString } from '@/lib/form';
import { readSessionFromSetCookie, setSessionCookie } from '@/lib/session';

export interface RegisterState {
  error?: string;
  email?: string;
}

export async function register(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const email = formString(formData, 'email');
  const input = registerSchema.safeParse({ email, password: formString(formData, 'password') });
  if (!input.success) {
    return { error: input.error.issues[0]?.message ?? 'Check your email and password.', email };
  }
  const forwarded = (await headers()).get('x-forwarded-for');
  const res = await fetch(`${env.API_INTERNAL_URL}/api/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(forwarded ? { 'x-forwarded-for': forwarded } : {}),
    },
    body: JSON.stringify(input.data),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 409) return { error: 'An account with this email already exists.', email };
  if (res.status === 429)
    return { error: 'Too many attempts. Wait a minute and try again.', email };
  if (!res.ok) return { error: 'Registration is unavailable right now.', email };

  const session = readSessionFromSetCookie(res.headers.getSetCookie());
  if (!session) return { error: 'Registration failed: no session returned.', email };
  await setSessionCookie(session.token, session.maxAge);
  // Onboarding: without skills, nothing can be scored for this user.
  redirect('/settings?welcome=1');
}
