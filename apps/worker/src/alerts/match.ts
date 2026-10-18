import type { SavedSearchFilters } from '@jobpilot/shared';

export interface MatchableListing {
  title: string;
  /** Raw HTML, as stored: the listings endpoint's text search looks at it too. */
  description: string;
  remote: boolean;
  salaryMax: number | null;
}

/**
 * Does a listing pass a saved search's filters? Same meaning as the
 * /api/listings filters, so an alert never disagrees with the listings page:
 * - q: case-insensitive substring of title or description
 * - remote: equal
 * - minSalary: the top of the range reaches it (unknown salary does not)
 * - minScore: this user's score reaches it
 */
export function matchesSearch(
  listing: MatchableListing,
  filters: SavedSearchFilters,
  score: number,
): boolean {
  if (filters.q !== undefined) {
    const needle = filters.q.toLowerCase();
    const found =
      listing.title.toLowerCase().includes(needle) ||
      listing.description.toLowerCase().includes(needle);
    if (!found) return false;
  }
  if (filters.remote !== undefined && listing.remote !== filters.remote) return false;
  if (filters.minSalary !== undefined) {
    if (listing.salaryMax === null || listing.salaryMax < filters.minSalary) return false;
  }
  if (filters.minScore !== undefined && score < filters.minScore) return false;
  return true;
}
