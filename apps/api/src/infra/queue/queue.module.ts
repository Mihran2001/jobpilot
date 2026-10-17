import { QUEUE, type GenerateCvData } from '@jobpilot/shared';
import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';

export const REDIS = Symbol('REDIS');
export const GENERATE_CV_QUEUE = Symbol('GENERATE_CV_QUEUE');

/**
 * The API only adds jobs; it never processes them. As a producer it should
 * fail fast when Redis is down rather than hang the request, hence
 * maxRetriesPerRequest: 1 (workers need null instead).
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        const redis = new Redis(config.REDIS_URL, {
          maxRetriesPerRequest: 1,
          connectTimeout: 3_000,
        });
        // ioredis keeps reconnecting on its own; without a listener every
        // failed attempt would be an unhandled 'error' event.
        const logger = new Logger('Redis');
        redis.on('error', (err) => logger.warn({ err }, 'Redis connection error'));
        return redis;
      },
    },
    {
      provide: GENERATE_CV_QUEUE,
      inject: [REDIS, APP_CONFIG],
      useFactory: (connection: Redis, config: AppConfig) =>
        new Queue<GenerateCvData>(QUEUE.generateCv, {
          connection,
          prefix: config.BULLMQ_PREFIX,
          defaultJobOptions: {
            attempts: 2, // a Chrome failure is rarely fixed by waiting
            backoff: { type: 'fixed', delay: 10_000 },
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 500 },
          },
        }),
    },
  ],
  exports: [GENERATE_CV_QUEUE],
})
export class QueueModule implements OnApplicationShutdown {
  constructor(
    @Inject(GENERATE_CV_QUEUE) private readonly generateCv: Queue<GenerateCvData>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.generateCv.close();
    await this.redis.quit();
  }
}
