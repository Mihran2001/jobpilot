'use server';

import { applicationDetailSchema, savedSearchResponseSchema } from '@jobpilot/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { formString } from '@/lib/form';

export interface SaveState {
  error?: string;
  saved?: boolean;
}

/** Saves a listing as an application (status SAVED). Already saved counts as success. */
export async function saveListing(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const jobListingId = formString(formData, 'jobListingId');
  try {
    await api('/applications', applicationDetailSchema, { method: 'POST', body: { jobListingId } });
    return { saved: true };
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) return { saved: true };
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
}

/** "Save and open": create the application, then go to its page. */
export async function saveAndOpen(formData: FormData): Promise<void> {
  const jobListingId = formString(formData, 'jobListingId');
  const created = await api('/applications', applicationDetailSchema, {
    method: 'POST',
    body: { jobListingId },
  });
  redirect(`/applications/${created.id}`);
}

export interface SaveSearchState {
  error?: string;
  saved?: boolean;
}

/** Saves the current filters as a named search; new matches become alerts. */
export async function saveSearch(
  _prev: SaveSearchState,
  formData: FormData,
): Promise<SaveSearchState> {
  let filters: unknown;
  try {
    filters = JSON.parse(formString(formData, 'filters'));
  } catch {
    return { error: 'Could not read the filters.' };
  }
  try {
    await api('/saved-searches', savedSearchResponseSchema, {
      method: 'POST',
      body: { name: formString(formData, 'name').trim(), filters },
    });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    throw err;
  }
  revalidatePath('/alerts');
  return { saved: true };
}
