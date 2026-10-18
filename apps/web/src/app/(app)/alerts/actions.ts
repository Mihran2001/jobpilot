'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiVoid } from '@/lib/api';
import { formString } from '@/lib/form';

export async function markSeen(formData: FormData): Promise<void> {
  const id = formString(formData, 'id');
  await apiVoid(`/saved-searches/${encodeURIComponent(id)}/seen`, { method: 'POST' });
  revalidatePath('/alerts', 'layout'); // also refreshes the nav badge
}

export async function deleteSearch(formData: FormData): Promise<void> {
  const id = formString(formData, 'id');
  await apiVoid(`/saved-searches/${encodeURIComponent(id)}`, { method: 'DELETE' });
  revalidatePath('/alerts', 'layout');
  redirect('/alerts');
}
