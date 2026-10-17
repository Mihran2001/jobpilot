'use server';

import {
  applicationDetailSchema,
  applicationStatusSchema,
  cvUploadResponseSchema,
  cvVersionResponseSchema,
  type CvUploadResponse,
} from '@jobpilot/shared';
import { revalidatePath } from 'next/cache';
import { api, errorMessage } from '@/lib/api';
import { formString } from '@/lib/form';

export interface ActionResult {
  error?: string;
}

/**
 * Server Actions are public HTTP endpoints: arguments come from the browser,
 * so they are validated here too, and the API checks ownership again.
 */
export async function changeStatus(applicationId: string, status: string): Promise<ActionResult> {
  const parsed = applicationStatusSchema.safeParse(status);
  if (!parsed.success) return { error: 'Unknown status' };
  try {
    await api(
      `/applications/${encodeURIComponent(applicationId)}/status`,
      applicationDetailSchema,
      {
        method: 'PATCH',
        body: { status: parsed.data },
      },
    );
  } catch (err) {
    return { error: errorMessage(err) };
  } finally {
    revalidatePath('/applications');
  }
  return {};
}

export interface NotesState extends ActionResult {
  saved?: boolean;
}

export async function saveNotes(_prev: NotesState, formData: FormData): Promise<NotesState> {
  const id = formString(formData, 'applicationId');
  const notes = formString(formData, 'notes').trim();
  try {
    await api(`/applications/${encodeURIComponent(id)}`, applicationDetailSchema, {
      method: 'PATCH',
      body: { notes: notes === '' ? null : notes },
    });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(`/applications/${id}`);
  return { saved: true };
}

export async function generateCv(applicationId: string): Promise<ActionResult> {
  try {
    await api(`/applications/${encodeURIComponent(applicationId)}/cv`, cvVersionResponseSchema, {
      method: 'POST',
    });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(`/applications/${applicationId}`);
  return {};
}

/** Step 1 of an upload: the API answers with a presigned URL for exactly this file. */
export async function startCvUpload(input: {
  applicationId: string;
  fileName: string;
  sizeBytes: number;
}): Promise<CvUploadResponse | { error: string }> {
  try {
    return await api('/cv-versions/uploads', cvUploadResponseSchema, {
      method: 'POST',
      body: { ...input, contentType: 'application/pdf' },
    });
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

/** Step 3, after the browser PUT the file straight to storage. */
export async function completeCvUpload(
  cvVersionId: string,
  applicationId: string,
): Promise<ActionResult> {
  try {
    await api(
      `/cv-versions/${encodeURIComponent(cvVersionId)}/complete-upload`,
      cvVersionResponseSchema,
      {
        method: 'POST',
      },
    );
  } catch (err) {
    return { error: errorMessage(err) };
  }
  revalidatePath(`/applications/${applicationId}`);
  return {};
}
