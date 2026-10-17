// Queues an immediate fetch of every enabled source (or just the named one),
// without waiting for the schedule. Mind the sources' limits: Remotive allows
// about 4 requests a day, Jobicy one automated pass an hour.
//
//   pnpm fetch:now
//   pnpm fetch:now remotive

import { createPrismaClient } from '@jobpilot/db';
import { loadConfig } from '../config.js';
import { loadRootEnvFile } from '../env-file.js';
import { createQueues, createRedis } from '../queues.js';

loadRootEnvFile();
const config = loadConfig();
const prisma = createPrismaClient({ connectionString: config.DATABASE_URL });
const connection = createRedis(config.REDIS_URL);
const { fetchSource, scoreListing } = createQueues(connection);

try {
  const only = process.argv[2];
  const sources = await prisma.source.findMany({
    where: { enabled: true, ...(only ? { name: only } : {}) },
  });
  for (const source of sources) {
    const job = await fetchSource.add(
      'fetch',
      { sourceId: source.id },
      // A second fetch:now while the first is still queued adds nothing.
      { deduplication: { id: `fetch-now-${source.id}` } },
    );
    console.log(`Queued fetch of ${source.name} (job ${job.id})`);
  }
  if (sources.length === 0) {
    console.log(
      only ? `No enabled source named "${only}".` : 'No enabled sources. Did you run pnpm db:seed?',
    );
  }
} finally {
  await fetchSource.close();
  await scoreListing.close();
  await connection.quit();
  await prisma.$disconnect();
}
