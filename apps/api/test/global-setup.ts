// Runs once before all test files, in the main Vitest process.
//
// Creates the test database if it does not exist and applies migrations to
// it with `prisma migrate deploy`, exactly as CI and production will. Tests
// then receive its URL through `inject('databaseUrl')`.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createPrismaClient } from '@jobpilot/db';
import type { TestProject } from 'vitest/node';

const ROOT_ENV = path.resolve(import.meta.dirname, '../../../.env');

export default async function setup(project: TestProject): Promise<void> {
  if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);

  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL is not set (see .env.example)');

  const url = new URL(testUrl);
  const dbName = url.pathname.slice(1);
  // CREATE DATABASE cannot take a bind parameter, so the name is checked
  // against a strict pattern before it is placed in the SQL text.
  if (!/^[a-z_][a-z0-9_]*_test$/.test(dbName)) {
    throw new Error(`Refusing to use "${dbName}" as a test database: name must end in _test`);
  }

  // Connect to the default "postgres" database to create the test one.
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';
  const admin = createPrismaClient({ connectionString: adminUrl.toString() });
  try {
    const rows = await admin.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (rows.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.$disconnect();
  }

  execFileSync('pnpm', ['--filter', '@jobpilot/db', 'exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });

  project.provide('databaseUrl', testUrl);
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
