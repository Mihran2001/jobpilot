import type { PrismaClient } from '@jobpilot/db';
import { resetDatabase } from '@jobpilot/db/testing';
import { UnrecoverableError, type Job } from 'bullmq';
import { createFetchSourceProcessor } from '../src/jobs/fetch-source.js';
import type { FetchSourceData, ScoreListingData } from '../src/queues.js';
import { createAdapterRegistry } from '../src/sources/registry.js';
import {
  createTestPrisma,
  fakeFetch,
  fixture,
  seedSourcesAndUser,
  silentLogger,
} from './helpers.js';

const fakeJob = (sourceId: string) =>
  ({
    id: '1',
    queueName: 'fetch-source',
    attemptsMade: 0,
    data: { sourceId },
  }) as Job<FetchSourceData>;

describe('fetch-source processor', () => {
  let prisma: PrismaClient;
  let enqueued: ScoreListingData[];
  let calls: string[];

  const processorWith = (responses: Record<string, unknown>) =>
    createFetchSourceProcessor({
      prisma,
      logger: silentLogger,
      adapters: createAdapterRegistry(fakeFetch(responses, calls)),
      enqueueScores: (pairs) => {
        enqueued.push(...pairs);
        return Promise.resolve();
      },
    });

  beforeAll(() => {
    prisma = createTestPrisma();
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    enqueued = [];
    calls = [];
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('running the same fetch twice creates no duplicates', async () => {
    const { remotive, user } = await seedSourcesAndUser(prisma);
    const process = processorWith({ 'remotive.com': fixture('remotive.json') });

    const first = await process(fakeJob(remotive.id));
    const second = await process(fakeJob(remotive.id));

    expect(first).toMatchObject({ status: 'done', fetched: 2, invalid: 1, created: 2 });
    expect(second).toMatchObject({ status: 'done', fetched: 2, created: 0 });
    expect(await prisma.jobListing.count()).toBe(2);
    expect(await prisma.company.count()).toBe(2);
    // Both runs queue scoring for every listing in the batch; the queue dedupes.
    expect(enqueued).toHaveLength(4);
    expect(enqueued.every((p) => p.userId === user.id)).toBe(true);
  });

  it('updates a listing whose content changed upstream', async () => {
    const { remotive } = await seedSourcesAndUser(prisma);
    await processorWith({ 'remotive.com': fixture('remotive.json') })(fakeJob(remotive.id));

    const changed = structuredClone(fixture('remotive.json')) as { jobs: { title: string }[] };
    changed.jobs[0]!.title = 'Staff Node.js Engineer';
    await processorWith({ 'remotive.com': changed })(fakeJob(remotive.id));

    const titles = (await prisma.jobListing.findMany({ orderBy: { externalId: 'asc' } })).map(
      (l) => l.title,
    );
    expect(titles).toEqual(['Staff Node.js Engineer', 'Product Designer']);
  });

  it('records when the source was last fetched', async () => {
    const { remotive } = await seedSourcesAndUser(prisma);
    await processorWith({ 'remotive.com': fixture('remotive.json') })(fakeJob(remotive.id));
    const source = await prisma.source.findUniqueOrThrow({ where: { id: remotive.id } });
    expect(source.lastFetchedAt).not.toBeNull();
  });

  it('skips a disabled source without calling it', async () => {
    const { remotive } = await seedSourcesAndUser(prisma);
    await prisma.source.update({ where: { id: remotive.id }, data: { enabled: false } });
    const result = await processorWith({})(fakeJob(remotive.id));
    expect(result).toEqual({ status: 'skipped' });
    expect(calls).toEqual([]);
  });

  it('fails without retrying when retrying cannot help', async () => {
    const { remotive } = await seedSourcesAndUser(prisma);
    await expect(
      processorWith({ 'remotive.com': 404 })(fakeJob(remotive.id)),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(
      processorWith({ 'remotive.com': { unexpected: true } })(fakeJob(remotive.id)),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(
      processorWith({})(fakeJob('01a13ac6-0000-7000-8000-000000000000')),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('lets temporary failures through so BullMQ retries them', async () => {
    const { remotive } = await seedSourcesAndUser(prisma);
    const err = await processorWith({ 'remotive.com': 503 })(fakeJob(remotive.id)).catch(
      (e: unknown) => e,
    );
    expect(err).not.toBeInstanceOf(UnrecoverableError);
    expect(await prisma.jobListing.count()).toBe(0);
  });
});
