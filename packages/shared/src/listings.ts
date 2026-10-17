import { z } from 'zod';
import { sourceKindSchema } from './enums.js';

/** Query-string booleans arrive as text; only "true" and "false" are accepted. */
const booleanParam = z.enum(['true', 'false']).transform((v) => v === 'true');

export const listingsQuerySchema = z.object({
  /** Opaque value from a previous page's `nextCursor`. */
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Case-insensitive match against title and description. */
  q: z.string().trim().min(1).max(100).optional(),
  remote: booleanParam.optional(),
  /** Listings whose top of range reaches at least this salary. */
  minSalary: z.coerce.number().int().min(0).optional(),
  sourceId: z.uuid().optional(),
  /** Only listings the current user has a score of at least this for. */
  minScore: z.coerce.number().int().min(0).max(100).optional(),
});
export type ListingsQuery = z.infer<typeof listingsQuerySchema>;

export const idParamSchema = z.uuid();

const listingBase = z.object({
  id: z.uuid(),
  title: z.string(),
  url: z.string(),
  location: z.string(),
  remote: z.boolean(),
  salaryMin: z.number().int().nullable(),
  salaryMax: z.number().int().nullable(),
  postedAt: z.iso.datetime(),
  company: z.object({ id: z.uuid(), name: z.string() }),
  source: z.object({ id: z.uuid(), name: z.string() }),
  /** The current user's score, or null if it has not been scored for them yet. */
  score: z.number().int().nullable(),
});

export const listingSummarySchema = listingBase;
export type ListingSummary = z.infer<typeof listingSummarySchema>;

export const listingDetailSchema = listingBase.extend({ description: z.string() });
export type ListingDetail = z.infer<typeof listingDetailSchema>;

export const listingsPageSchema = z.object({
  items: z.array(listingSummarySchema),
  /** Pass back as `cursor` for the next page; null on the last page. */
  nextCursor: z.string().nullable(),
});
export type ListingsPage = z.infer<typeof listingsPageSchema>;

export const sourceResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: sourceKindSchema,
  url: z.string(),
  enabled: z.boolean(),
  lastFetchedAt: z.iso.datetime().nullable(),
});
export type SourceResponse = z.infer<typeof sourceResponseSchema>;
