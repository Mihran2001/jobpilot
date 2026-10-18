import type { PrismaClient } from '@jobpilot/db';
import { resetDatabase } from '@jobpilot/db/testing';
import type { Job } from 'bullmq';
import { createRescoreUserProcessor } from '../src/jobs/rescore-user.js';
import { createScoreListingProcessor } from '../src/jobs/score-listing.js';
import type { RescoreUserData, ScoreListingData } from '../src/queues.js';
import { createTestPrisma } from './helpers.js';

const scoreJob = (userId: string, jobListingId: string) =>
  ({ data: { userId, jobListingId } }) as Job<ScoreListingData>;

describe('multi-user scoring and alerts', () => {
  let prisma: PrismaClient;
  let score: ReturnType<typeof createScoreListingProcessor>;

  beforeAll(() => {
    prisma = createTestPrisma();
    score = createScoreListingProcessor(prisma);
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function user(email: string, skills: string[], preferredRoles: string[]) {
    return prisma.user.create({
      data: {
        email,
        passwordHash: 'x',
        skillProfile: { create: { skills, preferredRoles, minSalary: null } },
      },
    });
  }

  async function listing(title: string, description: string, createdAt = new Date()) {
    const source = await prisma.source.upsert({
      where: { name: 'remotive' },
      update: {},
      create: { name: 'remotive', kind: 'API', url: 'https://remotive.com/api/remote-jobs' },
    });
    const company = await prisma.company.upsert({
      where: { name: 'Acme' },
      update: {},
      create: { name: 'Acme' },
    });
    return prisma.jobListing.create({
      data: {
        sourceId: source.id,
        companyId: company.id,
        externalId: crypto.randomUUID(),
        title,
        description,
        url: 'https://example.com/job',
        location: 'Remote',
        remote: true,
        postedAt: new Date(),
        createdAt,
      },
    });
  }

  it('gives two users with different skill profiles different scores for the same listing', async () => {
    const node = await user(
      'node@example.com',
      ['Node.js', 'TypeScript', 'PostgreSQL'],
      ['Backend Engineer'],
    );
    const data = await user('data@example.com', ['Python', 'Airflow', 'Spark'], ['Data Engineer']);
    const job = await listing(
      'Backend Engineer (Node.js)',
      '<p>TypeScript, PostgreSQL, Redis.</p>',
    );

    const forNode = await score(scoreJob(node.id, job.id));
    const forData = await score(scoreJob(data.id, job.id));

    expect(forNode.score).toBeGreaterThan(80);
    expect(forData.score).toBeLessThan(20);
    const stored = await prisma.listingScore.findMany({
      where: { jobListingId: job.id },
      orderBy: { score: 'desc' },
    });
    expect(stored.map((s) => s.userId)).toEqual([node.id, data.id]);
  });

  it("alerts only the listing owner's saved searches, only for new listings, once", async () => {
    const ada = await user('ada@example.com', ['Node.js'], []);
    const bob = await user('bob@example.com', ['Node.js'], []);
    const old = await listing('Node.js Engineer (old)', 'node', new Date(Date.now() - 60_000));
    const adaSearch = await prisma.savedSearch.create({
      data: { userId: ada.id, name: 'Node', filters: { q: 'node' } },
    });
    await prisma.savedSearch.create({
      data: { userId: bob.id, name: 'Python', filters: { q: 'python' } },
    });
    const fresh = await listing('Node.js Engineer (new)', 'node');

    await score(scoreJob(ada.id, old.id)); // existed before the search: no alert
    await score(scoreJob(ada.id, fresh.id));
    await score(scoreJob(ada.id, fresh.id)); // re-scoring: still one alert
    await score(scoreJob(bob.id, fresh.id)); // Bob's search does not match

    const matches = await prisma.searchMatch.findMany({ include: { savedSearch: true } });
    expect(matches.map((m) => [m.savedSearch.userId, m.jobListingId])).toEqual([
      [ada.id, fresh.id],
    ]);
    expect(matches[0]?.savedSearchId).toBe(adaSearch.id);
  });

  it("uses the user's own score for minScore", async () => {
    const strong = await user(
      'strong@example.com',
      ['Node.js', 'TypeScript', 'NestJS', 'PostgreSQL', 'Redis'],
      ['Backend Engineer'],
    );
    const weak = await user('weak@example.com', ['Python'], []);
    for (const u of [strong, weak]) {
      await prisma.savedSearch.create({
        data: { userId: u.id, name: 'Strong matches', filters: { minScore: 70 } },
      });
    }
    const job = await listing('Backend Engineer', 'Node.js, TypeScript, NestJS, PostgreSQL, Redis');

    await score(scoreJob(strong.id, job.id));
    await score(scoreJob(weak.id, job.id));

    const owners = (await prisma.searchMatch.findMany({ include: { savedSearch: true } })).map(
      (m) => m.savedSearch.userId,
    );
    expect(owners).toEqual([strong.id]);
  });

  it('rescoring a user queues one score job per listing for that user', async () => {
    const ada = await user('ada@example.com', ['Node.js'], []);
    await listing('A', 'a');
    await listing('B', 'b');
    const queued: ScoreListingData[] = [];
    const rescore = createRescoreUserProcessor({
      prisma,
      enqueueScores: (pairs) => {
        queued.push(...pairs);
        return Promise.resolve();
      },
    });

    const result = await rescore({ data: { userId: ada.id } } as Job<RescoreUserData>);
    expect(result).toEqual({ queued: 2 });
    expect(queued.every((p) => p.userId === ada.id)).toBe(true);
  });
});
