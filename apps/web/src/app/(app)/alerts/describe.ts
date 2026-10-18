import type { SavedSearchFilters } from '@jobpilot/shared';

/** "node · remote · ≥ $80k · score ≥ 70" */
export function describeFilters(f: SavedSearchFilters): string {
  const parts = [
    f.q && `"${f.q}"`,
    f.remote === true ? 'remote' : f.remote === false ? 'on-site' : undefined,
    f.minSalary !== undefined && `≥ $${Math.round(f.minSalary / 1000)}k`,
    f.minScore !== undefined && `score ≥ ${f.minScore}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'all new listings';
}

/** Back to the listings page with the same filters. */
export function listingsHref(f: SavedSearchFilters): string {
  const q = new URLSearchParams();
  if (f.q) q.set('q', f.q);
  if (f.remote !== undefined) q.set('remote', String(f.remote));
  if (f.minSalary !== undefined) q.set('minSalary', String(f.minSalary));
  if (f.minScore !== undefined) q.set('minScore', String(f.minScore));
  return `/listings?${q.toString()}`;
}
