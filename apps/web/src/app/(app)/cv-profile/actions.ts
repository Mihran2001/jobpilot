'use server';

import { cvProfileSchema } from '@jobpilot/shared';
import { revalidatePath } from 'next/cache';
import { api, errorMessage } from '@/lib/api';
import { formString } from '@/lib/form';

export interface ProfileState {
  error?: string;
  /** Field path -> message, e.g. "experience.0.start": "Use YYYY-MM". */
  fieldErrors?: Record<string, string>;
  saved?: boolean;
}

export async function saveCvProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  let json: unknown;
  try {
    json = JSON.parse(formString(formData, 'profile'));
  } catch {
    return { error: 'Could not read the form.' };
  }
  // The same schema the API validates with: errors show next to the fields
  // without a round trip, and the API still checks again.
  const parsed = cvProfileSchema.safeParse(json);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] ??= issue.message;
    return { error: 'Some fields need attention.', fieldErrors };
  }
  try {
    await api('/cv-profile', cvProfileSchema, { method: 'PUT', body: parsed.data });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath('/cv-profile');
  return { saved: true };
}
