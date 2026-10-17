// Does the CSV export keep memory flat? Streams 100,000 rows through the real
// API and samples the heap, then does the same export the naive way (load
// everything, build one string) for comparison. Uses the TEST database
// (wiped) and the test bucket.
//
//   pnpm --filter @jobpilot/api bench:export-memory
//
// Plain JavaScript run by plain node on purpose: under a TypeScript loader
// (tsx), CommonJS packages such as @nestjs/throttler can end up with a second
// copy of @nestjs/core, and dependency injection breaks.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { hash } from '@node-rs/argon2';
import { prepareTestDatabase, resetDatabase } from '@jobpilot/db/testing';
import { PrismaClient } from '@jobpilot/db';
import { NestFactory } from '@nestjs/core';
import { stringify } from 'csv-stringify/sync';
// The compiled app (`nest build` runs first): tsc emits the decorator
// metadata Nest's dependency injection needs.
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/app.setup.js';
import { loadConfig } from '../dist/config/config.js';

// Override with BENCH_APPLICATIONS to check that memory does not grow with size.
const APPLICATIONS = Number(process.env.BENCH_APPLICATIONS ?? 10_000);
const EVENTS_PER_APPLICATION = 10; // 100,000 CSV rows

const rootEnv = path.resolve(import.meta.dirname, '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const databaseUrl = process.env.TEST_DATABASE_URL ?? '';
const gc = globalThis.gc ?? (() => undefined);
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Runs `work` and reports two peaks above the starting point:
 * - heap: heapUsed sampled every 20 ms, including garbage not yet collected
 *   (what the process actually holds, but noisy and GC-timing dependent);
 * - live: heapUsed right after a forced GC every 100 ms, i.e. memory that is
 *   really still referenced. "Flat" is about this one.
 */
async function measure(work) {
  gc();
  const start = process.memoryUsage().heapUsed;
  let heap = start;
  let live = start;
  const sampler = setInterval(() => {
    heap = Math.max(heap, process.memoryUsage().heapUsed);
  }, 20);
  const liveSampler = setInterval(() => {
    gc();
    live = Math.max(live, process.memoryUsage().heapUsed);
  }, 100);
  const t0 = performance.now();
  const result = await work();
  clearInterval(sampler);
  clearInterval(liveSampler);
  heap = Math.max(heap, process.memoryUsage().heapUsed);
  return {
    result,
    heap: heap - start,
    live: live - start,
    seconds: (performance.now() - t0) / 1000,
  };
}

await prepareTestDatabase(databaseUrl);
const config = loadConfig({
  ...process.env,
  DATABASE_URL: databaseUrl,
  LOG_LEVEL: 'silent',
  BULLMQ_PREFIX: 'bench',
  S3_BUCKET: process.env.TEST_S3_BUCKET,
});
const app = await NestFactory.create(AppModule.register(config), {
  // Errors only: with the logger fully off, Nest exits on a startup error
  // without saying why.
  logger: ['error'],
});
configureApp(app);
await app.listen(0);
const port = app.getHttpServer().address().port;
const prisma = app.get(PrismaClient);

// --- Seed 100,000 history rows with set-based SQL (seconds, not minutes) ---
await resetDatabase(prisma);
const password = 'bench-password-123';
const user = await prisma.user.create({
  data: { email: 'bench@example.com', passwordHash: await hash(password) },
});
const source = await prisma.source.create({
  data: { name: 'bench', kind: 'API', url: 'http://bench' },
});
const company = await prisma.company.create({ data: { name: 'Bench Co' } });
await prisma.$executeRaw`
  INSERT INTO job_listings (id, source_id, external_id, company_id, title, description, url, location, remote, posted_at)
  SELECT gen_random_uuid(), ${source.id}::uuid, 'bench-' || g, ${company.id}::uuid,
         'Engineer ' || g, 'x', 'https://example.com/' || g, 'Remote', true, now()
  FROM generate_series(1, ${APPLICATIONS}) AS g`;
await prisma.$executeRaw`
  INSERT INTO applications (id, user_id, job_listing_id, status)
  SELECT gen_random_uuid(), ${user.id}::uuid, id, 'APPLIED' FROM job_listings`;
await prisma.$executeRaw`
  INSERT INTO application_events (id, application_id, from_status, to_status, note, created_at)
  SELECT gen_random_uuid(), a.id, 'SAVED', 'APPLIED', 'Follow-up number ' || n, now() - (n || ' days')::interval
  FROM applications a CROSS JOIN generate_series(1, ${EVENTS_PER_APPLICATION}) AS n`;
console.log(`seeded ${await prisma.applicationEvent.count()} history rows`);

const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'bench@example.com', password }),
});
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

// --- 1. The real endpoint: cursor -> CSV -> HTTP, read as a stream and discarded ---
const streamed = await measure(async () => {
  const res = await fetch(`http://127.0.0.1:${port}/api/exports/applications.csv`, {
    headers: { cookie },
  });
  let bytes = 0;
  let lines = 0;
  for await (const chunk of res.body ?? []) {
    bytes += chunk.length;
    for (const b of chunk) if (b === 10) lines += 1;
  }
  return { bytes, rows: lines - 1 };
});
console.log(
  `streamed export: ${streamed.result.rows} rows, ${mb(streamed.result.bytes)} in ${streamed.seconds.toFixed(1)} s, ` +
    `peak heap +${mb(streamed.heap)}, peak live +${mb(streamed.live)}`,
);

// --- 2. The naive way: everything in memory, one big string ---
const naive = await measure(async () => {
  const events = await prisma.applicationEvent.findMany({
    where: { application: { userId: user.id } },
    include: {
      application: { include: { jobListing: { include: { company: true, source: true } } } },
    },
  });
  const csv = stringify(
    events.map((e) => [
      e.applicationId,
      e.application.jobListing.title,
      e.application.jobListing.company.name,
      e.toStatus,
      e.note,
    ]),
  );
  return { rows: events.length, bytes: csv.length };
});
console.log(
  `naive export:    ${naive.result.rows} rows in ${naive.seconds.toFixed(1)} s, ` +
    `peak heap +${mb(naive.heap)}, peak live +${mb(naive.live)}`,
);

await resetDatabase(prisma);
await app.close();
