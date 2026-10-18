import type { PrismaClient } from '@jobpilot/db';
import { resetDatabase } from '@jobpilot/db/testing';
import type { CvProfileInput } from '@jobpilot/shared';
import { createStorage, type Storage } from '@jobpilot/storage';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { UnrecoverableError, type Job } from 'bullmq';
import { inject } from 'vitest';
import { htmlToPdf } from '../src/cv/chrome.js';
import { createGenerateCvProcessor } from '../src/jobs/generate-cv.js';
import type { GenerateCvData } from '../src/queues.js';
import { createTestPrisma, seedSourcesAndUser, silentLogger } from './helpers.js';

const cvProfile: CvProfileInput = {
  fullName: 'Ada Lovelace',
  headline: 'Full-stack engineer',
  summary: 'Builds web products with TypeScript.',
  skills: ['TypeScript', 'Node.js', 'React'],
  experience: [
    {
      company: 'Acme',
      title: 'Engineer',
      start: '2021-03',
      end: null,
      highlights: ['Built APIs in Node.js'],
    },
  ],
};

const job = (cvVersionId: string, attemptsMade = 0, attempts = 2) =>
  ({
    id: '1',
    queueName: 'generate-cv',
    attemptsMade,
    opts: { attempts },
    data: { cvVersionId },
  }) as Job<GenerateCvData>;

describe('generate-cv', () => {
  let prisma: PrismaClient;
  let storage: Storage;
  let rendered: string[];

  const processorWith = (renderPdf: (html: string) => Promise<Buffer>) =>
    createGenerateCvProcessor({ prisma, storage, logger: silentLogger, renderPdf });
  const fakePdf = (html: string) => {
    rendered.push(html);
    return Promise.resolve(Buffer.from('%PDF-1.7 fake'));
  };

  async function readObject(key: string): Promise<string> {
    const config = inject('storage');
    const s3 = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: config.credentials,
    });
    const res = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    const body = await res.Body?.transformToString('latin1');
    s3.destroy();
    return body ?? '';
  }

  /** A user with a CV profile, an application, and a PENDING generated CV for it. */
  async function setup(withProfile = true) {
    const { remotive, user } = await seedSourcesAndUser(prisma);
    if (withProfile) await prisma.cvProfile.create({ data: { userId: user.id, data: cvProfile } });
    const company = await prisma.company.create({ data: { name: 'Northwind' } });
    const listing = await prisma.jobListing.create({
      data: {
        sourceId: remotive.id,
        companyId: company.id,
        externalId: 'cv-1',
        title: 'Node.js Developer',
        description: '<p>Node.js and TypeScript.</p>',
        url: 'https://example.com/cv-1',
        location: 'Remote',
        remote: true,
        postedAt: new Date(),
      },
    });
    const application = await prisma.application.create({
      data: { userId: user.id, jobListingId: listing.id },
    });
    const version = await prisma.cvVersion.create({
      data: {
        userId: user.id,
        applicationId: application.id,
        source: 'GENERATED',
        s3Key: `test/${crypto.randomUUID()}.pdf`,
        fileName: 'Ada Lovelace - Node.js Developer.pdf',
      },
    });
    return { version };
  }

  beforeAll(() => {
    prisma = createTestPrisma();
    storage = createStorage(inject('storage'));
  });
  beforeEach(async () => {
    await resetDatabase(prisma);
    rendered = [];
  });
  afterAll(async () => {
    storage.destroy();
    await prisma.$disconnect();
  });

  it('renders the tailored CV, uploads it, and marks the version READY', async () => {
    const { version } = await setup();
    const result = await processorWith(fakePdf)(job(version.id));

    expect(result).toEqual({ status: 'ready', sizeBytes: 13 });
    expect(rendered[0]).toContain('<title>Ada Lovelace – Node.js Developer at Northwind</title>');
    expect(await readObject(version.s3Key)).toBe('%PDF-1.7 fake');
    const row = await prisma.cvVersion.findUniqueOrThrow({ where: { id: version.id } });
    expect(row).toMatchObject({ status: 'READY', sizeBytes: 13, error: null });
  });

  it('does nothing the second time (idempotent re-run)', async () => {
    const { version } = await setup();
    await processorWith(fakePdf)(job(version.id));
    expect(await processorWith(fakePdf)(job(version.id))).toEqual({ status: 'already-ready' });
    expect(rendered).toHaveLength(1);
  });

  it('fails for good, with a readable error, when there is no CV profile', async () => {
    const { version } = await setup(false);
    await expect(processorWith(fakePdf)(job(version.id))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    const row = await prisma.cvVersion.findUniqueOrThrow({ where: { id: version.id } });
    expect(row).toMatchObject({
      status: 'FAILED',
      error: 'No valid CV profile: fill in your CV profile first',
    });
  });

  it('stays PENDING after a failed attempt that will be retried, FAILED after the last', async () => {
    const { version } = await setup();
    const broken = () => Promise.reject(new Error('Chrome exited with code 1'));

    await expect(processorWith(broken)(job(version.id, 0, 2))).rejects.toThrow();
    expect((await prisma.cvVersion.findUniqueOrThrow({ where: { id: version.id } })).status).toBe(
      'PENDING',
    );

    await expect(processorWith(broken)(job(version.id, 1, 2))).rejects.toThrow();
    expect(await prisma.cvVersion.findUniqueOrThrow({ where: { id: version.id } })).toMatchObject({
      status: 'FAILED',
      error: 'Chrome exited with code 1',
    });
  });

  it.skipIf(!inject('chromePath'))('produces a real PDF end to end with Chrome', async () => {
    const { version } = await setup();
    await processorWith((html) =>
      htmlToPdf(html, {
        chromePath: inject('chromePath'),
        timeoutMs: 30_000,
        noSandbox: process.env.CHROME_NO_SANDBOX === 'true',
      }),
    )(job(version.id));
    const pdf = await readObject(version.s3Key);
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf.length).toBeGreaterThan(5_000);
  });
});
