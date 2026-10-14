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
export async function createTestApp(): Promise<TestApp> {
  const config: AppConfig = {
    NODE_ENV: 'test',
    API_PORT: 0,
    DATABASE_URL: inject('databaseUrl'),
    LOG_LEVEL: 'silent',
  };
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(config)],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaClient) };
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
