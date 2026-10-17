import { PrismaClient, type Prisma } from '@jobpilot/db';
import { Injectable } from '@nestjs/common';
import type { ListingCursor } from './listing-cursor.js';

export interface ListingFilters {
  q?: string;
  remote?: boolean;
  minSalary?: number;
  sourceId?: string;
  minScore?: number;
}

/** Columns for list rows. The description is left out: it is the bulk of each row. */
const summarySelect = (userId: string) =>
  ({
    id: true,
    title: true,
    url: true,
    location: true,
    remote: true,
    salaryMin: true,
    salaryMax: true,
    postedAt: true,
    company: { select: { id: true, name: true } },
    source: { select: { id: true, name: true } },
    // At most one row: the primary key is (user_id, job_listing_id).
    scores: { where: { userId }, select: { score: true } },
  }) satisfies Prisma.JobListingSelect;

export type ListingSummaryRow = Prisma.JobListingGetPayload<{
  select: ReturnType<typeof summarySelect>;
}>;
export type ListingDetailRow = ListingSummaryRow & { description: string };

@Injectable()
export class ListingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Newest first. `id` breaks ties between listings posted at the same
   * instant, so the order is total and the cursor can never skip a row.
   */
  findPage(args: {
    userId: string;
    filters: ListingFilters;
    after?: ListingCursor;
    take: number;
  }): Promise<ListingSummaryRow[]> {
    const { userId, filters, after, take } = args;
    const where: Prisma.JobListingWhereInput[] = [];

    if (filters.q) {
      where.push({
        OR: [
          { title: { contains: filters.q, mode: 'insensitive' } },
          { description: { contains: filters.q, mode: 'insensitive' } },
        ],
      });
    }
    if (filters.remote !== undefined) where.push({ remote: filters.remote });
    if (filters.minSalary !== undefined) where.push({ salaryMax: { gte: filters.minSalary } });
    if (filters.sourceId) where.push({ sourceId: filters.sourceId });
    if (filters.minScore !== undefined) {
      where.push({ scores: { some: { userId, score: { gte: filters.minScore } } } });
    }
    if (after) {
      // "Rows that sort after the cursor": (posted_at, id) < (cursor.postedAt, cursor.id).
      // Written as a range plus a tie-break rather than `a < x OR (a = x AND b < y)`:
      // the range gives Postgres a starting point in job_listings_posted_at_id_idx,
      // while the OR form makes it scan the index from the top and discard every
      // earlier row (measured in packages/db/explain/listings-feed.sql).
      where.push(
        { postedAt: { lte: after.postedAt } },
        { OR: [{ postedAt: { lt: after.postedAt } }, { id: { lt: after.id } }] },
      );
    }

    return this.prisma.jobListing.findMany({
      where: { AND: where },
      orderBy: [{ postedAt: 'desc' }, { id: 'desc' }],
      take,
      select: summarySelect(userId),
    });
  }

  findById(id: string, userId: string): Promise<ListingDetailRow | null> {
    return this.prisma.jobListing.findUnique({
      where: { id },
      select: { ...summarySelect(userId), description: true },
    });
  }
}
