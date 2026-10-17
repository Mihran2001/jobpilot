'use server';

import { redirect } from 'next/navigation';
import { apiVoid } from '@/lib/api';
import { clearSessionCookie } from '@/lib/session';

export async function logout(): Promise<void> {
  // Delete the session in the API too, so the token is dead even if a copy exists.
  await apiVoid('/auth/logout', { method: 'POST' }).catch(() => undefined);
  await clearSessionCookie();
  redirect('/login');
}
