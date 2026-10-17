// Runs once before all test files. Prepares the test database and hands the
// database and Redis URLs to the tests through inject().

import { existsSync } from 'node:fs';
import path from 'node:path';
import { prepareTestDatabase } from '@jobpilot/db/testing';
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
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
  }
}
