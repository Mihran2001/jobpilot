import type { ListingDetail, ListingSummary } from '@jobpilot/shared';
import type { ListingDetailRow, ListingSummaryRow } from './listings.repository.js';

export function toListingSummary(row: ListingSummaryRow): ListingSummary {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    location: row.location,
    remote: row.remote,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    postedAt: row.postedAt.toISOString(),
    company: row.company,
    source: row.source,
    score: row.scores[0]?.score ?? null,
  };
}

export function toListingDetail(row: ListingDetailRow): ListingDetail {
  return { ...toListingSummary(row), description: row.description };
}
