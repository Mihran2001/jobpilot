import type { PrismaClient } from '@jobpilot/db';
import type { Queue } from 'bullmq';
import type { Logger } from 'pino';
import { FETCH_JOB_OPTIONS, type FetchSourceData } from './queues.js';

/**
 * Makes the BullMQ schedulers match the sources table: one per enabled
 * source that has an adapter, none for anything else.
 *
 * Safe to run on every start: upserting an existing scheduler keeps its
 * next run time, so a restart does not trigger an extra fetch.
 */
export async function syncFetchSchedulers(args: {
  prisma: PrismaClient;
  queue: Queue<FetchSourceData>;
  adapterNames: ReadonlySet<string>;
  everyMs: number;
  logger: Logger;
}): Promise<void> {
  const { prisma, queue, adapterNames, everyMs, logger } = args;
  const sources = await prisma.source.findMany({ orderBy: { name: 'asc' } });

  const wanted = new Set<string>();
  for (const source of sources) {
    if (!source.enabled || !adapterNames.has(source.name)) continue;
    const schedulerId = `fetch-${source.name}`;
    wanted.add(schedulerId);
    await queue.upsertJobScheduler(
      schedulerId,
      { every: everyMs },
      { name: 'fetch', data: { sourceId: source.id }, opts: FETCH_JOB_OPTIONS },
    );
  }

  for (const scheduler of await queue.getJobSchedulers()) {
    if (!wanted.has(scheduler.key)) await queue.removeJobScheduler(scheduler.key);
  }
  logger.info(
    { schedulers: [...wanted], everyHours: everyMs / 3_600_000 },
    'Fetch schedulers in sync',
  );
}
