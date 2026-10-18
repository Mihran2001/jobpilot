import type { PrismaClient } from '@jobpilot/db';
import { savedSearchFiltersSchema } from '@jobpilot/shared';
import type { Job } from 'bullmq';
import { matchesSearch } from '../alerts/match.js';
import type { ScoreListingData } from '../queues.js';
import { scoreListing } from '../scoring/score.js';

export interface ScoreListingResult {
  score: number | null;
  /** Saved searches of this user that the listing newly matched. */
  alerts?: number;
}

export function createScoreListingProcessor(prisma: PrismaClient) {
  return async (job: Job<ScoreListingData>): Promise<ScoreListingResult> => {
    const { userId, jobListingId } = job.data;
    const [listing, profile] = await Promise.all([
      prisma.jobListing.findUnique({
        where: { id: jobListingId },
        select: {
          title: true,
          description: true,
          salaryMax: true,
          remote: true,
          createdAt: true,
        },
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

    // Alerts: only the minScore filter needs the score, and it is known only
    // now, so saved searches are checked here. A listing alerts a search only
    // if it arrived after the search was saved: saving a search is "tell me
    // about new ones", not "flag everything that already exists".
    const searches = await prisma.savedSearch.findMany({
      where: { userId, createdAt: { lte: listing.createdAt } },
      select: { id: true, filters: true },
    });
    const matched = searches.filter((search) => {
      const filters = savedSearchFiltersSchema.safeParse(search.filters);
      return filters.success && matchesSearch(listing, filters.data, score);
    });
    if (matched.length > 0) {
      // The (search, listing) primary key makes re-scoring harmless.
      await prisma.searchMatch.createMany({
        data: matched.map((s) => ({ savedSearchId: s.id, jobListingId })),
        skipDuplicates: true,
      });
    }
    return { score, alerts: matched.length };
  };
}
