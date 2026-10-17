// Development seed. Run with `pnpm db:seed` from the repo root.
//
// Every write is an upsert on a unique key (or guarded by a lookup), so running
// this twice leaves the same rows as running it once.

import { parseEnv, type ApplicationStatus } from '@jobpilot/shared';
import { hash } from '@node-rs/argon2';
import { z } from 'zod';
import { createPrismaClient } from '../src/index.js';

const env = parseEnv(
  z.object({
    DATABASE_URL: z.url(),
    SEED_USER_PASSWORD: z.string().min(12),
  }),
);
const prisma = createPrismaClient({ connectionString: env.DATABASE_URL });

const SEED_USER_EMAIL = 'dev@jobpilot.test';

// Real sources, fetched by the worker. Their terms (checked in stage 3) ask
// for attribution: show the source name and link to the listing's url.
const realSources = [
  {
    name: 'remotive',
    kind: 'API',
    // The whole public feed (it is small); scoring ranks what matters.
    url: 'https://remotive.com/api/remote-jobs',
    enabled: true,
  },
  {
    name: 'jobicy',
    kind: 'API',
    url: 'https://jobicy.com/api/v2/remote-jobs?industry=engineering&count=100',
    enabled: true,
  },
] as const;

// Placeholders that own the hand-written sample listings below. Disabled, so
// the worker never tries to fetch them.
const sources = [
  { name: 'example-api', kind: 'API', url: 'https://jobs.example.com/api/remote', enabled: false },
  { name: 'example-rss', kind: 'RSS', url: 'https://jobs.example.org/remote.rss', enabled: false },
] as const;

interface SeedListing {
  source: (typeof sources)[number]['name'];
  externalId: string;
  company: string;
  title: string;
  description: string;
  location: string;
  remote: boolean;
  salaryMin?: number;
  salaryMax?: number;
  postedDaysAgo: number;
  score?: number;
}

const listings: SeedListing[] = [
  {
    source: 'example-api',
    externalId: 'api-1001',
    company: 'Northwind Labs',
    title: 'Senior Full-Stack Engineer (Node.js, React)',
    description:
      'Build our logistics platform with TypeScript, NestJS, PostgreSQL and Next.js. You will own features from the database schema to the UI.',
    location: 'Remote (Europe)',
    remote: true,
    salaryMin: 70000,
    salaryMax: 95000,
    postedDaysAgo: 1,
    score: 92,
  },
  {
    source: 'example-api',
    externalId: 'api-1002',
    company: 'Northwind Labs',
    title: 'Backend Engineer (Node.js)',
    description:
      'Design REST APIs and background workers with Node.js, Redis queues and PostgreSQL. Docker and Kubernetes experience is a plus.',
    location: 'Remote (Worldwide)',
    remote: true,
    salaryMin: 60000,
    salaryMax: 85000,
    postedDaysAgo: 2,
    score: 81,
  },
  {
    source: 'example-api',
    externalId: 'api-1003',
    company: 'Halcyon Health',
    title: 'Frontend Engineer (React, Next.js)',
    description:
      'Ship patient-facing dashboards in React and Next.js with TypeScript. Strong accessibility and testing habits required.',
    location: 'Remote (Europe)',
    remote: true,
    salaryMin: 55000,
    salaryMax: 75000,
    postedDaysAgo: 3,
    score: 74,
  },
  {
    source: 'example-api',
    externalId: 'api-1004',
    company: 'Halcyon Health',
    title: 'Data Engineer (Python, Airflow)',
    description:
      'Maintain ETL pipelines in Python and Airflow on AWS. SQL fluency and experience with dbt expected.',
    location: 'Berlin, Germany',
    remote: false,
    postedDaysAgo: 5,
    score: 18,
  },
  {
    source: 'example-rss',
    externalId: 'rss-77-a',
    company: 'Tidewater Software',
    title: 'Full-Stack TypeScript Developer',
    description:
      'Small product team building a B2B SaaS with Next.js, tRPC, Prisma and PostgreSQL. You deploy what you build with Docker.',
    location: 'Remote (Worldwide)',
    remote: true,
    salaryMin: 65000,
    salaryMax: 90000,
    postedDaysAgo: 1,
    score: 88,
  },
  {
    source: 'example-rss',
    externalId: 'rss-77-b',
    company: 'Tidewater Software',
    title: 'Platform Engineer (Kubernetes, AWS)',
    description:
      'Run our Kubernetes clusters on AWS, improve CI/CD and observability. Go or Node.js scripting.',
    location: 'Remote (Americas)',
    remote: true,
    salaryMin: 90000,
    salaryMax: 120000,
    postedDaysAgo: 7,
    score: 41,
  },
  {
    source: 'example-rss',
    externalId: 'rss-78-a',
    company: 'Northwind Labs',
    title: 'Engineering Manager, Web',
    description:
      'Lead a team of six engineers working in React and Node.js. People management experience required.',
    location: 'Remote (Europe)',
    remote: true,
    postedDaysAgo: 10,
    // No score: the scoring job has not reached this listing yet.
  },
  {
    source: 'example-rss',
    externalId: 'rss-78-b',
    company: 'Halcyon Health',
    title: 'Node.js Developer (NestJS, PostgreSQL)',
    description:
      'Extend a NestJS monolith: modules, guards, Prisma, BullMQ workers and Redis caching. Integration testing against real Postgres.',
    location: 'Remote (Europe)',
    remote: true,
    salaryMin: 58000,
    salaryMax: 80000,
    postedDaysAgo: 4,
    score: 95,
  },
];

interface SeedApplication {
  listingExternalId: string;
  notes: string;
  /** Statuses in the order they happened; the last one is the current status. */
  history: [ApplicationStatus, ...ApplicationStatus[]];
}

const applications: SeedApplication[] = [
  {
    listingExternalId: 'rss-78-b',
    notes: 'Recruiter replied within a day. Technical interview scheduled.',
    history: ['SAVED', 'APPLIED', 'INTERVIEW'],
  },
  {
    listingExternalId: 'api-1001',
    notes: 'Good match. Tailor the CV towards NestJS before applying.',
    history: ['SAVED'],
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

async function main() {
  // Same Argon2id defaults as the API, so this user can log in through it.
  // Re-hashed on every run, so changing SEED_USER_PASSWORD takes effect.
  const passwordHash = await hash(env.SEED_USER_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: SEED_USER_EMAIL },
    update: { passwordHash },
    create: { email: SEED_USER_EMAIL, passwordHash },
  });

  const profile = {
    skills: [
      'TypeScript',
      'React',
      'Next.js',
      'Node.js',
      'NestJS',
      'PostgreSQL',
      'Prisma',
      'Redis',
      'Docker',
    ],
    preferredRoles: ['Full-Stack Engineer', 'Backend Engineer', 'Node.js Developer'],
    minSalary: 60000,
  };
  await prisma.skillProfile.upsert({
    where: { userId: user.id },
    update: profile,
    create: { userId: user.id, ...profile },
  });

  const sourceIds = new Map<string, string>();
  for (const source of [...realSources, ...sources]) {
    const row = await prisma.source.upsert({
      where: { name: source.name },
      update: { kind: source.kind, url: source.url, enabled: source.enabled },
      create: source,
    });
    sourceIds.set(row.name, row.id);
  }

  const listingIds = new Map<string, string>();
  for (const listing of listings) {
    const { source, externalId, company, postedDaysAgo, score, ...fields } = listing;
    const sourceId = sourceIds.get(source);
    if (!sourceId) throw new Error(`Unknown source "${source}" for listing ${externalId}`);

    const companyRow = await prisma.company.upsert({
      where: { name: company },
      update: {},
      create: { name: company },
    });

    // The same upsert-on-(sourceId, externalId) the fetch job will use in stage 3.
    const row = await prisma.jobListing.upsert({
      where: { sourceId_externalId: { sourceId, externalId } },
      update: { ...fields, companyId: companyRow.id },
      create: {
        ...fields,
        sourceId,
        externalId,
        companyId: companyRow.id,
        url: `https://jobs.example.com/listings/${externalId}`,
        postedAt: daysAgo(postedDaysAgo),
      },
    });
    listingIds.set(externalId, row.id);

    if (score !== undefined) {
      await prisma.listingScore.upsert({
        where: { userId_jobListingId: { userId: user.id, jobListingId: row.id } },
        update: { score },
        create: { userId: user.id, jobListingId: row.id, score },
      });
    }
  }

  for (const application of applications) {
    const jobListingId = listingIds.get(application.listingExternalId);
    if (!jobListingId) throw new Error(`Unknown listing ${application.listingExternalId}`);

    const existing = await prisma.application.findUnique({
      where: { userId_jobListingId: { userId: user.id, jobListingId } },
    });
    // Events are append-only, so they are written only when the application is.
    if (existing) continue;

    const { history } = application;
    const current = history[history.length - 1] ?? history[0];
    const firstEventAt = daysAgo(history.length);

    // A nested create is one transaction: the application and its events are
    // all written, or none are.
    await prisma.application.create({
      data: {
        userId: user.id,
        jobListingId,
        status: current,
        notes: application.notes,
        appliedAt: history.includes('APPLIED') ? daysAgo(history.length - 1) : null,
        createdAt: firstEventAt,
        events: {
          create: history.map((toStatus, i) => ({
            fromStatus: history[i - 1] ?? null,
            toStatus,
            createdAt: new Date(firstEventAt.getTime() + i * DAY_MS),
          })),
        },
      },
    });
  }

  const [users, sourceCount, companies, listingCount, scores, applicationCount, events] =
    await Promise.all([
      prisma.user.count(),
      prisma.source.count(),
      prisma.company.count(),
      prisma.jobListing.count(),
      prisma.listingScore.count(),
      prisma.application.count(),
      prisma.applicationEvent.count(),
    ]);
  console.log('Seed complete:', {
    users,
    sources: sourceCount,
    companies,
    listings: listingCount,
    scores,
    applications: applicationCount,
    events,
  });
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
