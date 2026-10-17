// Runs once before all test files. Prepares the test database and hands the
// database and Redis URLs to the tests through inject().

import { existsSync } from 'node:fs';
import path from 'node:path';
import { prepareTestDatabase } from '@jobpilot/db/testing';
import { createStorage } from '@jobpilot/storage';
import type { TestProject } from 'vitest/node';

const ROOT_ENV = path.resolve(import.meta.dirname, '../../../.env');

export default async function setup(project: TestProject): Promise<void> {
  if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);

  const databaseUrl = process.env.TEST_DATABASE_URL;
  const redisUrl = process.env.TEST_REDIS_URL;
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is not set (see .env.example)');
  if (!redisUrl) throw new Error('TEST_REDIS_URL is not set (see .env.example)');

  await prepareTestDatabase(databaseUrl);
  project.provide('databaseUrl', databaseUrl);
  project.provide('redisUrl', redisUrl);

  const bucket = process.env.TEST_S3_BUCKET;
  if (!bucket) throw new Error('TEST_S3_BUCKET is not set (see .env.example)');
  const storage = createStorage(testStorageConfig(bucket));
  await storage.ensureBucket();
  storage.destroy();
  project.provide('storage', testStorageConfig(bucket));
  project.provide('chromePath', process.env.CHROME_PATH ?? '');
}

function testStorageConfig(bucket: string) {
  return {
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    bucket,
    forcePathStyle: true,
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
    storage: import('@jobpilot/storage').StorageConfig;
    /** Empty when Chrome is not available; real-Chrome tests are then skipped. */
    chromePath: string;
  }
}
