import { z } from 'zod';
import { applicationStatusSchema } from './enums.js';

export const createApplicationSchema = z.object({
  jobListingId: z.uuid(),
  notes: z.string().trim().max(5000).optional(),
});
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const changeStatusSchema = z.object({
  status: applicationStatusSchema,
  /** Stored on the ApplicationEvent, e.g. "Recruiter call went well". */
  note: z.string().trim().max(1000).optional(),
});
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

export const applicationsQuerySchema = z.object({
  status: applicationStatusSchema.optional(),
});
export type ApplicationsQuery = z.infer<typeof applicationsQuerySchema>;

export const applicationEventSchema = z.object({
  id: z.uuid(),
  fromStatus: applicationStatusSchema.nullable(),
  toStatus: applicationStatusSchema,
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type ApplicationEventResponse = z.infer<typeof applicationEventSchema>;

export const applicationSummarySchema = z.object({
  id: z.uuid(),
  status: applicationStatusSchema,
  appliedAt: z.iso.datetime().nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  listing: z.object({
    id: z.uuid(),
    title: z.string(),
    company: z.object({ id: z.uuid(), name: z.string() }),
  }),
});
export type ApplicationSummary = z.infer<typeof applicationSummarySchema>;

export const applicationDetailSchema = applicationSummarySchema.extend({
  /** Oldest first. */
  events: z.array(applicationEventSchema),
});
export type ApplicationDetail = z.infer<typeof applicationDetailSchema>;

export const applicationListSchema = z.object({
  items: z.array(applicationSummarySchema),
  /** Every status is present, with 0 when the user has none in it. */
  counts: z.record(applicationStatusSchema, z.number().int()),
});
export type ApplicationList = z.infer<typeof applicationListSchema>;
