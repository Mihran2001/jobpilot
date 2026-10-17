import type { PrismaClient } from '@jobpilot/db';
import type { NormalizedListing } from '../sources/types.js';

export interface IngestResult {
  /** Ids of every listing in this batch, new or existing. */
  listingIds: string[];
  created: number;
}

/**
 * Upserts each listing on UNIQUE (source_id, external_id). Running the same
 * batch twice leaves the same rows: that is what makes a retried or
 * re-run fetch job harmless.
 */
export async function upsertListings(
  prisma: PrismaClient,
  sourceId: string,
  listings: NormalizedListing[],
): Promise<IngestResult> {
  const before = await prisma.jobListing.count({ where: { sourceId } });
  const listingIds: string[] = [];

  for (const { companyName, externalId, ...fields } of listings) {
    // Prisma turns these upserts into INSERT ... ON CONFLICT DO UPDATE, which
    // is safe even if two fetches of the same source overlap.
    const company = await prisma.company.upsert({
      where: { name: companyName },
      update: {},
      create: { name: companyName },
      select: { id: true },
    });
    const row = await prisma.jobListing.upsert({
      where: { sourceId_externalId: { sourceId, externalId } },
      update: { ...fields, companyId: company.id },
      create: { ...fields, sourceId, externalId, companyId: company.id },
      select: { id: true },
    });
    listingIds.push(row.id);
  }

  const after = await prisma.jobListing.count({ where: { sourceId } });
  return { listingIds, created: after - before };
}
