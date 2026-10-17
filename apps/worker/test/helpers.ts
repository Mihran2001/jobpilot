import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createPrismaClient, type PrismaClient } from '@jobpilot/db';
import { pino } from 'pino';
import { inject } from 'vitest';
import type { FetchFn } from '../src/sources/http.js';

export const silentLogger = pino({ level: 'silent' });

export function createTestPrisma(): PrismaClient {
  return createPrismaClient({ connectionString: inject('databaseUrl') });
}

/** A unique BullMQ key prefix per test file, so tests never see each other's jobs. */
export function uniquePrefix(): string {
  return `test-${randomUUID()}`;
}

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8'));
}

/**
 * Stands in for global fetch: answers by hostname from the fixtures, or with
 * a given status. Only third-party HTTP is faked; Postgres and Redis are real.
 */
export function fakeFetch(
  responses: Record<string, unknown>, // a JSON body, or a status code
  calls: string[] = [],
): FetchFn {
  return (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    const answer = responses[new URL(url).hostname];
    if (answer === undefined) return Promise.reject(new Error(`No fake response for ${url}`));
    if (typeof answer === 'number') return Promise.resolve(new Response('', { status: answer }));
    return Promise.resolve(Response.json(answer));
  };
}

/** The two real sources plus a user with a skill profile, like the seed. */
export async function seedSourcesAndUser(prisma: PrismaClient) {
  const remotive = await prisma.source.create({
    data: { name: 'remotive', kind: 'API', url: 'https://remotive.com/api/remote-jobs' },
  });
  const jobicy = await prisma.source.create({
    data: { name: 'jobicy', kind: 'API', url: 'https://jobicy.com/api/v2/remote-jobs' },
  });
  const user = await prisma.user.create({
    data: {
      email: 'ada@example.com',
      passwordHash: 'not-used-here',
      skillProfile: {
        create: {
          skills: ['TypeScript', 'Node.js', 'NestJS', 'PostgreSQL', 'React', 'Redis'],
          preferredRoles: ['Full-Stack Engineer', 'Node.js Developer'],
          minSalary: 100_000,
        },
      },
    },
  });
  return { remotive, jobicy, user };
}
