import type { PrismaClient } from '@jobpilot/db';
import type { Job } from 'bullmq';
import type { RescoreUserData, ScoreListingData } from '../queues.js';

/**
 * A user's skill profile changed: every listing's score for them is stale.
 * Queues one score job per listing; the score queue's deduplication makes a
 * second rescore while the first is still running add nothing.
 */
export function createRescoreUserProcessor(deps: {
  prisma: PrismaClient;
  enqueueScores: (pairs: ScoreListingData[]) => Promise<void>;
}) {
  return async (job: Job<RescoreUserData>): Promise<{ queued: number }> => {
    const { userId } = job.data;
    const listings = await deps.prisma.jobListing.findMany({ select: { id: true } });
    await deps.enqueueScores(listings.map((l) => ({ userId, jobListingId: l.id })));
    return { queued: listings.length };
  };
}
