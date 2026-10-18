import type { Queue } from 'bullmq';
import type { Logger } from 'pino';
import type { FetchSourceData } from './queues.js';

/**
 * Scheduled fetching is triggered by a Kubernetes CronJob running
 * `fetch:now` (infra/k8s/base/fetch-cronjob.yaml), and only by that: two
 * schedulers would fetch twice. BullMQ job schedulers from stage 3 may still
 * exist in Redis, so the worker removes them on start, BEFORE any worker
 * runs.
 *
 * Removing a scheduler does not remove the job it has already queued for its
 * next run (checked against BullMQ 6.3), so that job is removed too.
 * Otherwise a job due while no worker was running would still fire once.
 */
export async function removeFetchSchedulers(
  queue: Queue<FetchSourceData>,
  logger: Logger,
): Promise<void> {
  const schedulers = await queue.getJobSchedulers();
  if (schedulers.length === 0) return;

  const keys = new Set(schedulers.map((s) => s.key));
  for (const key of keys) await queue.removeJobScheduler(key);

  const queued = await queue.getJobs(['waiting', 'delayed', 'prioritized']);
  const leftovers = queued.filter((job) => job.repeatJobKey && keys.has(job.repeatJobKey));
  for (const job of leftovers) await job.remove();

  logger.info(
    { removed: [...keys], queuedJobsRemoved: leftovers.length },
    'Removed BullMQ fetch schedulers (the CronJob schedules fetches)',
  );
}
