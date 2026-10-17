import type { PrismaClient } from '@jobpilot/db';
import { UnrecoverableError, type Job } from 'bullmq';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import type { FetchSourceData, ScoreListingData } from '../queues.js';
import { HttpError } from '../sources/http.js';
import type { SourceAdapter } from '../sources/types.js';
import { upsertListings } from './ingest.js';

export interface FetchSourceResult {
  status: 'done' | 'skipped';
  fetched?: number;
  invalid?: number;
  created?: number;
}

export interface FetchSourceDeps {
  prisma: PrismaClient;
  logger: Logger;
  adapters: ReadonlyMap<string, SourceAdapter>;
  enqueueScores: (pairs: ScoreListingData[]) => Promise<void>;
}

export function createFetchSourceProcessor(deps: FetchSourceDeps) {
  const { prisma, adapters, enqueueScores } = deps;

  return async (job: Job<FetchSourceData>): Promise<FetchSourceResult> => {
    const log = deps.logger.child({
      queue: job.queueName,
      jobId: job.id,
      attempt: job.attemptsMade + 1,
    });

    const source = await prisma.source.findUnique({ where: { id: job.data.sourceId } });
    // Retrying cannot fix these, so fail now instead of using up attempts.
    if (!source) throw new UnrecoverableError(`Source ${job.data.sourceId} does not exist`);
    if (!source.enabled) {
      log.info({ source: source.name }, 'Source disabled, skipping');
      return { status: 'skipped' };
    }
    const adapter = adapters.get(source.name);
    if (!adapter) throw new UnrecoverableError(`No adapter for source "${source.name}"`);

    let fetched;
    try {
      fetched = await adapter.fetch(source.url);
    } catch (err) {
      // 4xx other than 429, or a response in an unexpected shape: the next
      // attempt would get the same answer. Network errors, timeouts, 429 and
      // 5xx are rethrown as they are, so BullMQ retries them with backoff.
      if (err instanceof HttpError && !err.retryable) throw new UnrecoverableError(err.message);
      if (err instanceof ZodError) {
        throw new UnrecoverableError(`Unexpected response shape from ${source.name}`);
      }
      throw err;
    }

    const { listingIds, created } = await upsertListings(prisma, source.id, fetched.listings);
    await prisma.source.update({ where: { id: source.id }, data: { lastFetchedAt: new Date() } });

    // Score every listing in the batch, not only new ones: if the worker died
    // after the upserts last time, this run still scores everything.
    const profiles = await prisma.skillProfile.findMany({ select: { userId: true } });
    await enqueueScores(
      listingIds.flatMap((jobListingId) =>
        profiles.map(({ userId }) => ({ userId, jobListingId })),
      ),
    );

    const result = {
      status: 'done' as const,
      fetched: fetched.listings.length,
      invalid: fetched.invalid,
      created,
    };
    log.info({ source: source.name, ...result }, 'Fetched source');
    return result;
  };
}
