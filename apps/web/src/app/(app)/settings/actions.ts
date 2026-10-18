'use server';

import { skillProfileSchema } from '@jobpilot/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, api, apiVoid } from '@/lib/api';
import { formString } from '@/lib/form';
import { clearSessionCookie } from '@/lib/session';

export interface SettingsState {
  error?: string;
  saved?: boolean;
}

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

export async function saveSkillProfile(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const minSalary = formString(formData, 'minSalary').trim();
  const input = skillProfileSchema.safeParse({
    skills: lines(formString(formData, 'skills')),
    preferredRoles: lines(formString(formData, 'preferredRoles')),
    minSalary: minSalary === '' ? null : Number(minSalary),
  });
  if (!input.success) return { error: input.error.issues[0]?.message ?? 'Check the fields.' };
  try {
    await api('/skill-profile', skillProfileSchema, { method: 'PUT', body: input.data });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
  revalidatePath('/settings');
  return { saved: true };
}

export async function deleteAccount(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  if (formString(formData, 'confirm') !== 'DELETE') return { error: 'Type DELETE to confirm.' };
  try {
    await apiVoid('/users/me', {
      method: 'DELETE',
      body: { password: formString(formData, 'password') },
    });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
  await clearSessionCookie();
  redirect('/login?deleted=1');
}
