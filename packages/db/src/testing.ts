// Helpers for integration tests in the apps. Imported as '@jobpilot/db/testing',
// never from application code.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createPrismaClient } from './client.js';
import type { PrismaClient } from './generated/prisma/client.js';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');

/**
 * Creates the test database if it does not exist and applies migrations to
 * it with `prisma migrate deploy`, exactly as CI and production will.
 */
export async function prepareTestDatabase(testUrl: string): Promise<void> {
  const dbName = new URL(testUrl).pathname.slice(1);
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
    const rows = await admin.$queryRaw<unknown[]>`
      SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (rows.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.$disconnect();
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });
}

/** Empties every table except Prisma's migration history. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  // Table names come from the catalog, not from user input.
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
