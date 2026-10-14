import type { ApplicationDetail, ApplicationSummary } from '@jobpilot/shared';
import type { ApplicationDetailRow, ApplicationSummaryRow } from './applications.repository.js';

export function toApplicationSummary(row: ApplicationSummaryRow): ApplicationSummary {
  return {
    id: row.id,
    status: row.status,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    listing: row.jobListing,
  };
}

export function toApplicationDetail(row: ApplicationDetailRow): ApplicationDetail {
  return {
    ...toApplicationSummary(row),
    events: row.events.map((e) => ({
      id: e.id,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
