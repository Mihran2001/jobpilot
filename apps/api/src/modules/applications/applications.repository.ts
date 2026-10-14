import { PrismaClient, type ApplicationStatus, type Prisma } from '@jobpilot/db';
import { Injectable } from '@nestjs/common';

const summarySelect = {
  id: true,
  status: true,
  appliedAt: true,
  notes: true,
  createdAt: true,
  jobListing: {
    select: { id: true, title: true, company: { select: { id: true, name: true } } },
  },
} satisfies Prisma.ApplicationSelect;

const detailSelect = {
  ...summarySelect,
  events: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, fromStatus: true, toStatus: true, note: true, createdAt: true },
  },
} satisfies Prisma.ApplicationSelect;

export type ApplicationSummaryRow = Prisma.ApplicationGetPayload<{ select: typeof summarySelect }>;
export type ApplicationDetailRow = Prisma.ApplicationGetPayload<{ select: typeof detailSelect }>;

export type TransitionResult =
  | { kind: 'ok'; application: ApplicationDetailRow }
  | { kind: 'not_found' }
  | { kind: 'unchanged' }
  | { kind: 'conflict' };

/**
 * Every query filters by userId as well as by id. That is the ownership
 * check: another user's application is simply not found, so the API answers
 * 404 and does not even confirm that the id exists.
 */
@Injectable()
export class ApplicationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listingExists(jobListingId: string): Promise<boolean> {
    return this.prisma.jobListing.count({ where: { id: jobListingId } }).then((count) => count > 0);
  }

  /**
   * One INSERT for the application and one for its first event, in one
   * transaction (a nested create is a transaction). A second application
   * for the same listing violates UNIQUE (user_id, job_listing_id): P2002.
   */
  create(data: {
    userId: string;
    jobListingId: string;
    notes?: string;
  }): Promise<ApplicationDetailRow> {
    return this.prisma.application.create({
      data: {
        ...data,
        status: 'SAVED',
        events: { create: { fromStatus: null, toStatus: 'SAVED' } },
      },
      select: detailSelect,
    });
  }

  findManyForUser(userId: string, status?: ApplicationStatus): Promise<ApplicationSummaryRow[]> {
    return this.prisma.application.findMany({
      where: { userId, status },
      orderBy: { createdAt: 'desc' },
      select: summarySelect,
    });
  }

  /** SELECT status, count(*) FROM applications WHERE user_id = $1 GROUP BY status */
  async countByStatus(userId: string): Promise<Map<ApplicationStatus, number>> {
    const groups = await this.prisma.application.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.status, g._count._all]));
  }

  findOneForUser(id: string, userId: string): Promise<ApplicationDetailRow | null> {
    return this.prisma.application.findFirst({ where: { id, userId }, select: detailSelect });
  }

  /**
   * Changes the status and records the event atomically.
   *
   * The UPDATE only matches if the status is still the one we read
   * ("optimistic concurrency"). If a parallel request changed it in between,
   * zero rows match, the transaction is rolled back, and no event claims a
   * `fromStatus` that was no longer true.
   */
  transitionStatus(args: {
    id: string;
    userId: string;
    toStatus: ApplicationStatus;
    note?: string;
  }): Promise<TransitionResult> {
    const { id, userId, toStatus, note } = args;
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.application.findFirst({
        where: { id, userId },
        select: { status: true, appliedAt: true },
      });
      if (!current) return { kind: 'not_found' };
      if (current.status === toStatus) return { kind: 'unchanged' };

      const { count } = await tx.application.updateMany({
        where: { id, userId, status: current.status },
        data: {
          status: toStatus,
          // Remember when it was first sent, even if the status moves on later.
          ...(toStatus === 'APPLIED' && !current.appliedAt ? { appliedAt: new Date() } : {}),
        },
      });
      if (count === 0) return { kind: 'conflict' };

      await tx.applicationEvent.create({
        data: { applicationId: id, fromStatus: current.status, toStatus, note },
      });
      const application = await tx.application.findUniqueOrThrow({
        where: { id },
        select: detailSelect,
      });
      return { kind: 'ok', application };
    });
  }
}
