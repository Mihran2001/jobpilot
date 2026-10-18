import type { Queue } from 'bullmq';
import type { Logger } from 'pino';
import type { FetchSourceData } from './queues.js';

/**
 * Scheduled fetching is triggered by a Kubernetes CronJob running
 * `fetch:now` (infra/k8s/base/fetch-cronjob.yaml), and only by that: two
 * schedulers would fetch twice. BullMQ job schedulers from stage 3 may still
 * exist in Redis, so the worker removes them on start.
 */
export async function removeFetchSchedulers(
  queue: Queue<FetchSourceData>,
  logger: Logger,
): Promise<void> {
  const schedulers = await queue.getJobSchedulers();
  for (const scheduler of schedulers) await queue.removeJobScheduler(scheduler.key);
  if (schedulers.length > 0) {
    logger.info(
      { removed: schedulers.map((s) => s.key) },
      'Removed BullMQ fetch schedulers (the CronJob schedules fetches)',
    );
  }
}
