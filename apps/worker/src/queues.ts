import { Queue, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import {
  QUEUE,
  type FetchSourceData,
  type GenerateCvData,
  type RescoreUserData,
  type ScoreListingData,
} from '@jobpilot/shared';

// Queue names and payloads are shared with the API, which enqueues generate-cv.
export {
  QUEUE,
  type FetchSourceData,
  type GenerateCvData,
  type RescoreUserData,
  type ScoreListingData,
} from '@jobpilot/shared';

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
  /** Jobs are added by the API; the worker only needs the queue for Bull Board. */
  generateCv: Queue<GenerateCvData>;
  /** Added by the API when a skill profile changes. */
  rescoreUser: Queue<RescoreUserData>;
}

/** Every queue, for code that treats them alike (Bull Board, shutdown). */
export function allQueues(queues: Queues): Queue[] {
  return [queues.fetchSource, queues.scoreListing, queues.generateCv, queues.rescoreUser];
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
    generateCv: new Queue<GenerateCvData>(QUEUE.generateCv, { connection, prefix }),
    rescoreUser: new Queue<RescoreUserData>(QUEUE.rescoreUser, { connection, prefix }),
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
