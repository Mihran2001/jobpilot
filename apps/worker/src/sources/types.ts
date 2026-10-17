import type { z } from 'zod';

/** One listing in our shape, whatever site it came from. */
export interface NormalizedListing {
  externalId: string;
  title: string;
  companyName: string;
  /** Raw HTML from the source. Must be sanitised before a browser renders it. */
  description: string;
  /** The listing on the source's site: where attribution links and apply buttons go. */
  url: string;
  location: string;
  remote: boolean;
  /** USD per year, or null when the source gives anything else. */
  salaryMin: number | null;
  salaryMax: number | null;
  postedAt: Date;
}

export interface FetchedListings {
  listings: NormalizedListing[];
  /** Jobs in the response that failed validation and were skipped. */
  invalid: number;
}

export interface SourceAdapter {
  fetch(url: string): Promise<FetchedListings>;
}

/**
 * Validates each item on its own: one malformed job is skipped and counted,
 * instead of failing the whole fetch.
 */
export function parseEach<S extends z.ZodType>(
  items: unknown[],
  schema: S,
  toListing: (item: z.infer<S>) => NormalizedListing,
): FetchedListings {
  const listings: NormalizedListing[] = [];
  let invalid = 0;
  for (const item of items) {
    const parsed = schema.safeParse(item);
    if (parsed.success) listings.push(toListing(parsed.data));
    else invalid += 1;
  }
  return { listings, invalid };
}
