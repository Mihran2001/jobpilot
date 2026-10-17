import { createPrismaClient } from '@jobpilot/db';
import { Worker } from 'bullmq';
import { startBoard, type Board } from './board.js';
import { loadConfig } from './config.js';
import { loadRootEnvFile } from './env-file.js';
import { createFetchSourceProcessor } from './jobs/fetch-source.js';
import { createScoreListingProcessor } from './jobs/score-listing.js';
import { createLogger } from './logger.js';
import { allQueues, createQueues, createRedis, enqueueScores, QUEUE } from './queues.js';
import { syncFetchSchedulers } from './schedule.js';
import { createAdapterRegistry } from './sources/registry.js';

loadRootEnvFile();
const config = loadConfig(); // fails here if the environment is invalid
const logger = createLogger(config);

const prisma = createPrismaClient({ connectionString: config.DATABASE_URL });
const connection = createRedis(config.REDIS_URL);
const queues = createQueues(connection);
const adapters = createAdapterRegistry(fetch);

const workers = [
  // One fetch at a time: these are other people's servers.
  new Worker(
    QUEUE.fetchSource,
    createFetchSourceProcessor({
      prisma,
      logger,
      adapters,
      enqueueScores: (pairs) => enqueueScores(queues.scoreListing, pairs),
    }),
    { connection, concurrency: 1 },
  ),
  new Worker(QUEUE.scoreListing, createScoreListingProcessor(prisma), {
    connection,
    concurrency: config.SCORE_CONCURRENCY,
  }),
];

for (const worker of workers) {
  worker.on('failed', (job, err) => {
    logger.warn(
      { queue: worker.name, jobId: job?.id, attempts: job?.attemptsMade, err },
      'Job failed',
    );
  });
  // Connection-level problems (Redis down, ...). Without a listener Node
  // would treat them as unhandled.
  worker.on('error', (err) => logger.error({ queue: worker.name, err }, 'Worker error'));
}

await syncFetchSchedulers({
  prisma,
  queue: queues.fetchSource,
  adapterNames: new Set(adapters.keys()),
  everyMs: config.FETCH_INTERVAL_HOURS * 3_600_000,
  logger,
});

let board: Board | undefined;
if (config.BULL_BOARD_PORT > 0) {
  board = await startBoard(allQueues(queues), config.BULL_BOARD_PORT);
  logger.info({ url: board.url }, 'Bull Board listening');
}
logger.info({ scoreConcurrency: config.SCORE_CONCURRENCY }, 'Worker started');

// --- Graceful shutdown -------------------------------------------------------
// SIGTERM (Kubernetes, docker stop) or SIGINT (Ctrl-C): stop taking new jobs,
// let running jobs finish, then close connections in reverse order of use.
// A job cut off by a hard kill is not lost: its lock expires and BullMQ's
// stalled-job check hands it to the next worker.

const SHUTDOWN_TIMEOUT_MS = 25_000; // under Kubernetes' default 30 s grace period
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down: finishing active jobs');

  const timer = setTimeout(() => {
    logger.error('Shutdown took too long; exiting. Unfinished jobs will be retried.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timer.unref();

  await board?.close();
  await Promise.all(workers.map((w) => w.close())); // waits for active jobs
  await Promise.all(allQueues(queues).map((q) => q.close()));
  await connection.quit();
  await prisma.$disconnect();
  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
