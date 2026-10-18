import { z } from 'zod';
import { listingSummarySchema } from './listings.js';

/**
 * The listing filters a saved search remembers. Same meaning as the
 * /api/listings query parameters, but typed (booleans, numbers) because they
 * are stored as JSON, not read from a URL.
 */
export const savedSearchFiltersSchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  remote: z.boolean().optional(),
  minSalary: z.number().int().min(0).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
});
export type SavedSearchFilters = z.infer<typeof savedSearchFiltersSchema>;

export const createSavedSearchSchema = z.object({
  name: z.string().trim().min(1).max(60),
  filters: savedSearchFiltersSchema,
});
export type CreateSavedSearchInput = z.infer<typeof createSavedSearchSchema>;

export const savedSearchResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  filters: savedSearchFiltersSchema,
  createdAt: z.iso.datetime(),
  /** Matches not marked as seen yet. */
  newMatches: z.number().int(),
});
export type SavedSearchResponse = z.infer<typeof savedSearchResponseSchema>;

export const searchMatchSchema = z.object({
  listing: listingSummarySchema,
  matchedAt: z.iso.datetime(),
  seen: z.boolean(),
});
export type SearchMatch = z.infer<typeof searchMatchSchema>;

export const alertsSummarySchema = z.object({
  /** Unseen matches across all of the user's saved searches: the nav badge. */
  unseen: z.number().int(),
});
export type AlertsSummary = z.infer<typeof alertsSummarySchema>;
