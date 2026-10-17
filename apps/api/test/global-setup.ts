// Runs once before all test files, in the main Vitest process. Prepares the
// test database and hands its URL to the tests through `inject('databaseUrl')`.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { prepareTestDatabase } from '@jobpilot/db/testing';
import {
  createStorage,
  storageConfigFromEnv,
  storageEnvSchema,
  type StorageEnv,
} from '@jobpilot/storage';
import type { TestProject } from 'vitest/node';

const ROOT_ENV = path.resolve(import.meta.dirname, '../../../.env');

export default async function setup(project: TestProject): Promise<void> {
  if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL is not set (see .env.example)');

  await prepareTestDatabase(testUrl);
  project.provide('databaseUrl', testUrl);

  const redisUrl = process.env.TEST_REDIS_URL;
  if (!redisUrl) throw new Error('TEST_REDIS_URL is not set (see .env.example)');
  project.provide('redisUrl', redisUrl);

  // The real storage settings, but the test bucket, created if missing.
  const storageEnv = storageEnvSchema.parse({
    ...process.env,
    S3_BUCKET: process.env.TEST_S3_BUCKET,
  });
  const storage = createStorage(storageConfigFromEnv(storageEnv));
  await storage.ensureBucket();
  storage.destroy();
  project.provide('storageEnv', storageEnv);
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
    storageEnv: StorageEnv;
  }
}
