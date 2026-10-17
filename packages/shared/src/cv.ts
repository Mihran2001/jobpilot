import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
/** "2024-03" */
const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

export const cvProfileSchema = z.object({
  fullName: text(100),
  headline: text(150),
  email: z.email().optional(),
  phone: text(40).optional(),
  location: text(100).optional(),
  links: z
    .array(z.object({ label: text(40), url: z.url() }))
    .max(10)
    .default([]),
  summary: text(2000),
  skills: z.array(text(50)).max(60).default([]),
  experience: z
    .array(
      z.object({
        company: text(100),
        title: text(100),
        start: yearMonth,
        /** null while it is the current job. */
        end: yearMonth.nullable(),
        location: text(100).optional(),
        highlights: z.array(text(400)).max(12).default([]),
      }),
    )
    .max(20)
    .default([]),
  education: z
    .array(
      z.object({
        school: text(150),
        degree: text(150),
        start: yearMonth.optional(),
        end: yearMonth.optional(),
      }),
    )
    .max(10)
    .default([]),
});
export type CvProfile = z.infer<typeof cvProfileSchema>;
/** What a client sends: defaults (empty lists) may be left out. */
export type CvProfileInput = z.input<typeof cvProfileSchema>;

export const cvStatusSchema = z.enum(['PENDING', 'READY', 'FAILED']);
export const cvSourceSchema = z.enum(['GENERATED', 'UPLOADED']);
export type CvStatus = z.infer<typeof cvStatusSchema>;
export type CvSource = z.infer<typeof cvSourceSchema>;

export const cvVersionResponseSchema = z.object({
  id: z.uuid(),
  applicationId: z.uuid().nullable(),
  source: cvSourceSchema,
  status: cvStatusSchema,
  fileName: z.string(),
  sizeBytes: z.number().int().nullable(),
  /** Why generation failed; null otherwise. */
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type CvVersionResponse = z.infer<typeof cvVersionResponseSchema>;

export const cvVersionsQuerySchema = z.object({
  applicationId: z.uuid().optional(),
});
export type CvVersionsQuery = z.infer<typeof cvVersionsQuerySchema>;

/** Uploads are PDFs up to 5 MB, sent by the browser straight to storage. */
export const MAX_CV_UPLOAD_BYTES = 5 * 1024 * 1024;

export const createCvUploadSchema = z.object({
  applicationId: z.uuid().optional(),
  fileName: text(120).regex(/\.pdf$/i, 'Must be a .pdf file'),
  contentType: z.literal('application/pdf'),
  sizeBytes: z.number().int().min(1).max(MAX_CV_UPLOAD_BYTES),
});
export type CreateCvUploadInput = z.infer<typeof createCvUploadSchema>;

/** A short-lived URL straight to object storage; the file never passes through the API. */
export const presignedUrlSchema = z.object({
  url: z.url(),
  expiresAt: z.iso.datetime(),
});

export const cvUploadResponseSchema = z.object({
  cvVersion: cvVersionResponseSchema,
  upload: presignedUrlSchema.extend({
    method: z.literal('PUT'),
    /** Send exactly these headers with the PUT, or storage rejects the signature. */
    headers: z.record(z.string(), z.string()),
  }),
});
export type CvUploadResponse = z.infer<typeof cvUploadResponseSchema>;
export type PresignedUrl = z.infer<typeof presignedUrlSchema>;
