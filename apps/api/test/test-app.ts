import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@jobpilot/db';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { inject } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { AppConfig } from '../src/config/config.js';

export interface TestApp {
  app: NestExpressApplication;
  prisma: PrismaClient;
}

/** Boots the real AppModule against the test database. */
export async function createTestApp(overrides: Partial<AppConfig> = {}): Promise<TestApp> {
  const config: AppConfig = {
    NODE_ENV: 'test',
    API_PORT: 0,
    DATABASE_URL: inject('databaseUrl'),
    SESSION_TTL_DAYS: 7,
    // High by default so ordinary tests never trip it; the rate-limit test lowers it.
    AUTH_RATE_LIMIT_PER_MINUTE: 1000,
    LOG_LEVEL: 'silent',
    REDIS_URL: inject('redisUrl'),
    // A fresh prefix per app: this test's jobs are invisible to anything else.
    BULLMQ_PREFIX: `test-${randomUUID()}`,
    ...inject('storageEnv'),
    ...overrides,
  };
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(config)],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaClient) };
}

export { resetDatabase } from '@jobpilot/db/testing';
