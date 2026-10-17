import { Queue, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';

export const QUEUE = {
  fetchSource: 'fetch-source',
  scoreListing: 'score-listing',
} as const;

export interface FetchSourceData {
  sourceId: string;
}

export interface ScoreListingData {
  userId: string;
  jobListingId: string;
}

/**
 * Fetching calls someone else's server: retry 5 times, waiting 1, 2, 4, 8
 * minutes. Failed jobs are kept so they show up in Bull Board.
 */
export const FETCH_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 60_000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
} satisfies JobsOptions;

const SCORE_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 1000 },
} satisfies JobsOptions;

/**
 * Workers block on Redis while waiting for jobs, so ioredis must never give
 * up on a command (maxRetriesPerRequest: null); BullMQ refuses otherwise.
 */
export function createRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

export interface Queues {
  fetchSource: Queue<FetchSourceData>;
  scoreListing: Queue<ScoreListingData>;
}

/** Every queue, for code that treats them alike (Bull Board, shutdown). */
export function allQueues(queues: Queues): Queue[] {
  return [queues.fetchSource, queues.scoreListing];
}

export function createQueues(connection: Redis, prefix?: string): Queues {
  return {
    fetchSource: new Queue<FetchSourceData>(QUEUE.fetchSource, {
      connection,
      prefix,
      defaultJobOptions: FETCH_JOB_OPTIONS,
    }),
    scoreListing: new Queue<ScoreListingData>(QUEUE.scoreListing, {
      connection,
      prefix,
      defaultJobOptions: SCORE_JOB_OPTIONS,
    }),
  };
}

/**
 * One score job per (user, listing). While a job for the same pair is still
 * waiting or running, adding it again is a no-op, so repeated fetches do not
 * pile up duplicate work.
 */
export async function enqueueScores(
  queue: Queue<ScoreListingData>,
  pairs: ScoreListingData[],
): Promise<void> {
  if (pairs.length === 0) return;
  await queue.addBulk(
    pairs.map((data) => ({
      name: 'score',
      data,
      opts: { deduplication: { id: `score-${data.userId}-${data.jobListingId}` } },
    })),
  );
}
