// Measures whether scoring blocks the event loop enough to justify
// worker_threads. Uses the TEST database (it is wiped) and Redis database 3.
//
//   pnpm --filter @jobpilot/worker bench:score-lag

import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { createPrismaClient } from '@jobpilot/db';
import { prepareTestDatabase, resetDatabase } from '@jobpilot/db/testing';
import { Queue, Worker } from 'bullmq';
import { loadRootEnvFile } from '../src/env-file.js';
import { createScoreListingProcessor } from '../src/jobs/score-listing.js';
import { createRedis, QUEUE, type ScoreListingData } from '../src/queues.js';
import { scoreListing, type ScoringProfile } from '../src/scoring/score.js';

const JOBS = 5_000;
const CONCURRENCY = 10;
const DESCRIPTION_BYTES = 24_000; // a typical Remotive description

loadRootEnvFile();
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is not set');

const profile: ScoringProfile = {
  skills: [
    'TypeScript',
    'React',
    'Next.js',
    'Node.js',
    'NestJS',
    'PostgreSQL',
    'Prisma',
    'Redis',
    'Docker',
  ],
  preferredRoles: ['Full-Stack Engineer', 'Backend Engineer', 'Node.js Developer'],
  minSalary: 60_000,
};

function fakeDescription(i: number): string {
  const paragraph =
    '<p>We are looking for an engineer to join our <strong>platform</strong> team. You will work ' +
    'with Kubernetes, Go, Python and PostgreSQL, write <em>clean</em> code &amp; review others&#39; ' +
    `changes, and mentor juniors. Ticket ${i}.</p>\n`;
  return paragraph.repeat(Math.ceil(DESCRIPTION_BYTES / paragraph.length));
}

const ms = (ns: number) => (ns / 1e6).toFixed(2);
const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;

// 1. Pure CPU cost of one call.
const samples: number[] = [];
for (let i = 0; i < 2_000; i++) {
  const listing = {
    title: `Senior Backend Engineer ${i}`,
    description: fakeDescription(i),
    salaryMax: 90_000,
  };
  const t0 = performance.now();
  scoreListing(listing, profile);
  samples.push(performance.now() - t0);
}
samples.sort((a, b) => a - b);
console.log(
  `scoreListing on ${DESCRIPTION_BYTES / 1000} KB: median ${percentile(samples, 50).toFixed(3)} ms, ` +
    `p99 ${percentile(samples, 99).toFixed(3)} ms, max ${samples.at(-1)?.toFixed(3)} ms`,
);

// 2. Event loop delay while the real processor works through a bulk run.
await prepareTestDatabase(databaseUrl);
const prisma = createPrismaClient({ connectionString: databaseUrl });
await resetDatabase(prisma);
const user = await prisma.user.create({
  data: {
    email: 'bench@example.com',
    passwordHash: 'x',
    skillProfile: {
      create: {
        ...profile,
        skills: [...profile.skills],
        preferredRoles: [...profile.preferredRoles],
      },
    },
  },
});
const source = await prisma.source.create({
  data: { name: 'bench', kind: 'API', url: 'http://bench' },
});
const company = await prisma.company.create({ data: { name: 'Bench' } });
await prisma.jobListing.createMany({
  data: Array.from({ length: JOBS }, (_, i) => ({
    sourceId: source.id,
    companyId: company.id,
    externalId: `bench-${i}`,
    title: i % 2 ? `Senior Backend Engineer ${i}` : `Data Engineer ${i}`,
    description: fakeDescription(i),
    url: `https://example.com/${i}`,
    location: 'Remote',
    remote: true,
    salaryMax: 50_000 + (i % 100) * 1_000,
    postedAt: new Date(),
  })),
});
const listingIds = (await prisma.jobListing.findMany({ select: { id: true } })).map((l) => l.id);

const connection = createRedis('redis://localhost:6379/3');
const queue = new Queue<ScoreListingData>(QUEUE.scoreListing, { connection, prefix: 'bench' });
await queue.obliterate({ force: true });

const idle = monitorEventLoopDelay({ resolution: 1 });
idle.enable();
await new Promise((r) => setTimeout(r, 2_000));
idle.disable();
console.log(
  `idle event loop delay: p50 ${ms(idle.percentile(50))} ms, p99 ${ms(idle.percentile(99))} ms, max ${ms(idle.max)} ms`,
);

await queue.addBulk(
  listingIds.map((jobListingId) => ({ name: 'score', data: { userId: user.id, jobListingId } })),
);

const busy = monitorEventLoopDelay({ resolution: 1 });
const started = performance.now();
busy.enable();
const worker = new Worker(QUEUE.scoreListing, createScoreListingProcessor(prisma), {
  connection,
  prefix: 'bench',
  concurrency: CONCURRENCY,
});
let done = 0;
await new Promise<void>((resolve) => {
  worker.on('completed', () => {
    done += 1;
    if (done === JOBS) resolve();
  });
});
busy.disable();
const seconds = (performance.now() - started) / 1000;
console.log(
  `bulk run: ${JOBS} jobs at concurrency ${CONCURRENCY} in ${seconds.toFixed(1)} s ` +
    `(${Math.round(JOBS / seconds)} jobs/s)`,
);
console.log(
  `busy event loop delay: p50 ${ms(busy.percentile(50))} ms, p99 ${ms(busy.percentile(99))} ms, max ${ms(busy.max)} ms`,
);

await worker.close();
await queue.obliterate({ force: true });
await queue.close();
await connection.quit();
await resetDatabase(prisma);
await prisma.$disconnect();
