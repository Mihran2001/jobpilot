// Runs once before all test files, in the main Vitest process. Prepares the
// test database and hands its URL to the tests through `inject('databaseUrl')`.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { prepareTestDatabase } from '@jobpilot/db/testing';
import type { TestProject } from 'vitest/node';

const ROOT_ENV = path.resolve(import.meta.dirname, '../../../.env');

export default async function setup(project: TestProject): Promise<void> {
  if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL is not set (see .env.example)');

  await prepareTestDatabase(testUrl);
  project.provide('databaseUrl', testUrl);
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
