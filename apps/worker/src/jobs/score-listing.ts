import type { PrismaClient } from '@jobpilot/db';
import type { Job } from 'bullmq';
import type { ScoreListingData } from '../queues.js';
import { scoreListing } from '../scoring/score.js';

export interface ScoreListingResult {
  score: number | null;
}

export function createScoreListingProcessor(prisma: PrismaClient) {
  return async (job: Job<ScoreListingData>): Promise<ScoreListingResult> => {
    const { userId, jobListingId } = job.data;
    const [listing, profile] = await Promise.all([
      prisma.jobListing.findUnique({
        where: { id: jobListingId },
        select: { title: true, description: true, salaryMax: true },
      }),
      prisma.skillProfile.findUnique({ where: { userId } }),
    ]);
    // Deleted since the job was queued, or the user has no profile: nothing to do.
    if (!listing || !profile) return { score: null };

    const score = scoreListing(listing, profile);
    await prisma.listingScore.upsert({
      where: { userId_jobListingId: { userId, jobListingId } },
      create: { userId, jobListingId, score },
      update: { score, scoredAt: new Date() },
    });
    return { score };
  };
}
