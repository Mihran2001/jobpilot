import type { PrismaClient } from '@jobpilot/db';
import { resetDatabase } from '@jobpilot/db/testing';
import { QueueEvents, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { inject } from 'vitest';
import { createFetchSourceProcessor } from '../src/jobs/fetch-source.js';
import { createScoreListingProcessor } from '../src/jobs/score-listing.js';
import {
  allQueues,
  createQueues,
  createRedis,
  enqueueScores,
  QUEUE,
  type Queues,
} from '../src/queues.js';
import { removeFetchSchedulers } from '../src/schedule.js';
import { createAdapterRegistry } from '../src/sources/registry.js';
import {
  createTestPrisma,
  fakeFetch,
  fixture,
  seedSourcesAndUser,
  silentLogger,
  uniquePrefix,
} from './helpers.js';

/** The real worker setup from main.ts, against test Postgres, test Redis and fake HTTP. */
describe('pipeline through BullMQ', () => {
  let prisma: PrismaClient;
  let connection: Redis;
  let queues: Queues;
  let workers: Worker[];
  let prefix: string;

  beforeAll(() => {
    prisma = createTestPrisma();
    connection = createRedis(inject('redisUrl'));
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    prefix = uniquePrefix();
    queues = createQueues(connection, prefix);
    const adapters = createAdapterRegistry(
      fakeFetch({ 'remotive.com': fixture('remotive.json'), 'jobicy.com': fixture('jobicy.json') }),
    );
    workers = [
      new Worker(
        QUEUE.fetchSource,
        createFetchSourceProcessor({
          prisma,
          logger: silentLogger,
          adapters,
          enqueueScores: (pairs) => enqueueScores(queues.scoreListing, pairs),
        }),
        { connection, prefix },
      ),
      new Worker(QUEUE.scoreListing, createScoreListingProcessor(prisma), {
        connection,
        prefix,
        concurrency: 5,
      }),
    ];
  });
  afterEach(async () => {
    await Promise.all(workers.map((w) => w.close()));
    for (const q of allQueues(queues)) {
      await q.obliterate({ force: true });
      await q.close();
    }
  });
  afterAll(async () => {
    await connection.quit();
    await prisma.$disconnect();
  });

  async function waitForIdle(): Promise<void> {
    for (let i = 0; i < 100; i++) {
      const counts = await Promise.all(
        allQueues(queues).map((q) => q.getJobCounts('waiting', 'active', 'delayed', 'prioritized')),
      );
      if (counts.every((c) => Object.values(c).every((n) => n === 0))) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('Queues did not drain');
  }

  it('fetches both sources, stores listings and scores them for the user', async () => {
    const { remotive, jobicy, user } = await seedSourcesAndUser(prisma);
    const events = new QueueEvents(QUEUE.fetchSource, {
      connection: connection.duplicate(),
      prefix,
    });
    await events.waitUntilReady();

    for (const source of [remotive, jobicy]) {
      const job = await queues.fetchSource.add('fetch', { sourceId: source.id });
      await job.waitUntilFinished(events);
    }
    await waitForIdle();
    await events.close();

    expect(await prisma.jobListing.count()).toBe(5); // 2 Remotive (1 invalid skipped) + 3 Jobicy
    const scores = await prisma.listingScore.findMany({
      where: { userId: user.id },
      include: { jobListing: { select: { title: true } } },
      orderBy: { score: 'desc' },
    });
    expect(scores).toHaveLength(5);
    // The two Node/React jobs rank above the designer and the QA contract.
    expect(
      scores
        .slice(0, 2)
        .map((s) => s.jobListing.title)
        .sort(),
    ).toEqual(['Full Stack Developer (React, Node.js)', 'Senior Node.js Engineer']);
  });

  it('removes leftover BullMQ fetch schedulers and the jobs they already queued', async () => {
    // Close the workers first, so nothing picks the queued jobs up during the test.
    await Promise.all(workers.map((w) => w.close()));
    await queues.fetchSource.upsertJobScheduler('fetch-remotive', { every: 6 * 3_600_000 });
    await queues.fetchSource.upsertJobScheduler('fetch-jobicy', { every: 6 * 3_600_000 });
    await queues.fetchSource.add('fetch', { sourceId: 'manual' }); // not from a scheduler: kept
    expect(await queues.fetchSource.getWaitingCount()).toBe(3);

    await removeFetchSchedulers(queues.fetchSource, silentLogger);
    await removeFetchSchedulers(queues.fetchSource, silentLogger); // a second start: nothing to do

    expect(await queues.fetchSource.getJobSchedulers()).toEqual([]);
    const waiting = await queues.fetchSource.getWaiting();
    expect(waiting.map((j) => j.data)).toEqual([{ sourceId: 'manual' }]);
  });
});
