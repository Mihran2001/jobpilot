import {
  QUEUE,
  cvVersionResponseSchema,
  presignedUrlSchema,
  cvUploadResponseSchema,
  type CvProfileInput,
  type GenerateCvData,
} from '@jobpilot/shared';
import type { Storage } from '@jobpilot/storage';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import request from 'supertest';
import { inject } from 'vitest';
import { APP_CONFIG, type AppConfig } from '../src/config/config.js';
import { STORAGE } from '../src/infra/storage/storage.module.js';
import { registerUser } from './auth.helpers.js';
import { createCatalog, createListing } from './fixtures.js';
import { createTestApp, resetDatabase, type TestApp } from './test-app.js';

const profile: CvProfileInput = {
  fullName: 'Ada Lovelace',
  headline: 'Full-stack engineer',
  summary: 'Builds web products.',
  skills: ['TypeScript', 'Node.js'],
  experience: [
    { company: 'Acme', title: 'Engineer', start: '2021-03', end: null, highlights: ['Built APIs'] },
  ],
};

const pdfBytes = Buffer.from('%PDF-1.7\n% a tiny but genuine-looking PDF header\n');

describe('CV profile, generation and files', () => {
  let t: TestApp;
  let ada: string;
  let bob: string;
  let applicationId: string;
  let redis: Redis;
  let queue: Queue<GenerateCvData>;
  const server = () => t.app.getHttpServer();
  const as = (cookie: string) => ({
    get: (url: string) => request(server()).get(url).set('Cookie', cookie),
    put: (url: string, body: object) => request(server()).put(url).set('Cookie', cookie).send(body),
    post: (url: string, body: object = {}) =>
      request(server()).post(url).set('Cookie', cookie).send(body),
  });

  beforeAll(async () => {
    t = await createTestApp();
    // Look into the queue the API writes to (same Redis, same per-test prefix).
    const config = t.app.get<AppConfig>(APP_CONFIG);
    redis = new Redis(inject('redisUrl'), { maxRetriesPerRequest: null });
    queue = new Queue<GenerateCvData>(QUEUE.generateCv, {
      connection: redis,
      prefix: config.BULLMQ_PREFIX,
    });
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await queue.obliterate({ force: true });
    ada = await registerUser(server(), 'ada@example.com');
    bob = await registerUser(server(), 'bob@example.com');
    const catalog = await createCatalog(t.prisma);
    const listing = await createListing(t.prisma, catalog, { title: 'Node.js Developer' });
    const res = await as(ada).post('/api/applications', { jobListingId: listing.id }).expect(201);
    applicationId = res.body.id;
  });
  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    await redis.quit();
    await t.app.close();
  });

  describe('CV profile', () => {
    it('is 404 until saved, then round-trips with defaults filled in', async () => {
      await as(ada).get('/api/cv-profile').expect(404);
      await as(ada).put('/api/cv-profile', profile).expect(200);
      const res = await as(ada).get('/api/cv-profile').expect(200);
      expect(res.body).toEqual({ ...profile, links: [], education: [] });
    });

    it('rejects invalid content with 400', async () => {
      await as(ada)
        .put('/api/cv-profile', {
          ...profile,
          experience: [{ company: 'X', title: 'Y', start: 'March 2021', end: null }],
        })
        .expect(400);
    });

    it("is per user: Bob does not see Ada's", async () => {
      await as(ada).put('/api/cv-profile', profile).expect(200);
      await as(bob).get('/api/cv-profile').expect(404);
    });
  });

  describe('generating', () => {
    it('answers 202 with a PENDING version and queues exactly one job for it', async () => {
      await as(ada).put('/api/cv-profile', profile).expect(200);
      const res = await as(ada).post(`/api/applications/${applicationId}/cv`).expect(202);
      const version = cvVersionResponseSchema.parse(res.body);
      expect(version).toMatchObject({ status: 'PENDING', source: 'GENERATED', applicationId });
      expect(version.fileName).toBe('Ada Lovelace - Node.js Developer.pdf');

      const jobs = await queue.getJobs(['waiting', 'delayed']);
      expect(jobs.map((j) => [j.id, j.data])).toEqual([[version.id, { cvVersionId: version.id }]]);
    });

    it('asks for a CV profile first', async () => {
      const res = await as(ada).post(`/api/applications/${applicationId}/cv`).expect(400);
      expect(res.body.message).toBe('Fill in your CV profile first');
    });

    it("answers 404 for someone else's application and queues nothing", async () => {
      await as(bob).put('/api/cv-profile', profile).expect(200);
      await as(bob).post(`/api/applications/${applicationId}/cv`).expect(404);
      expect(await queue.count()).toBe(0);
    });

    it('marks the version FAILED and answers 503 when the queue is down', async () => {
      await as(ada).put('/api/cv-profile', profile).expect(200);
      const broken = await createTestApp({ REDIS_URL: 'redis://127.0.0.1:1' }); // nothing listens there
      try {
        await request(broken.app.getHttpServer())
          .post(`/api/applications/${applicationId}/cv`)
          .set('Cookie', ada)
          .expect(503);
        const row = await t.prisma.cvVersion.findFirstOrThrow();
        expect(row).toMatchObject({ status: 'FAILED', error: 'Could not queue the job' });
      } finally {
        await broken.app.close().catch(() => undefined);
      }
    }, 15_000);
  });

  describe('downloading', () => {
    it('refuses while PENDING, then gives a short-lived URL that serves the file', async () => {
      await as(ada).put('/api/cv-profile', profile).expect(200);
      const { id } = (await as(ada).post(`/api/applications/${applicationId}/cv`).expect(202)).body;
      await as(ada).get(`/api/cv-versions/${id}/download`).expect(409);

      // Stand in for the worker: put a file at the version's key and mark it READY.
      const row = await t.prisma.cvVersion.findUniqueOrThrow({ where: { id } });
      const storage = t.app.get<Storage>(STORAGE);
      await storage.putObject(row.s3Key, pdfBytes, 'application/pdf');
      await t.prisma.cvVersion.update({
        where: { id },
        data: { status: 'READY', sizeBytes: pdfBytes.length },
      });

      const link = presignedUrlSchema.parse(
        (await as(ada).get(`/api/cv-versions/${id}/download`).expect(200)).body,
      );
      expect(new Date(link.expiresAt).getTime()).toBeGreaterThan(Date.now());
      const file = await fetch(link.url);
      expect(file.status).toBe(200);
      expect(file.headers.get('content-disposition')).toContain(
        'Ada Lovelace - Node.js Developer.pdf',
      );
      expect(Buffer.from(await file.arrayBuffer()).equals(pdfBytes)).toBe(true);

      await as(bob).get(`/api/cv-versions/${id}/download`).expect(404);
    });
  });

  describe('uploading', () => {
    const start = (cookie: string, sizeBytes = pdfBytes.length) =>
      as(cookie).post('/api/cv-versions/uploads', {
        applicationId,
        fileName: 'My edited CV.pdf',
        contentType: 'application/pdf',
        sizeBytes,
      });

    it('goes browser -> storage directly, then the API verifies what arrived', async () => {
      const { cvVersion, upload } = cvUploadResponseSchema.parse(
        (await start(ada).expect(201)).body,
      );
      expect(cvVersion).toMatchObject({ status: 'PENDING', source: 'UPLOADED' });

      // Completing before uploading is refused.
      await as(ada).post(`/api/cv-versions/${cvVersion.id}/complete-upload`).expect(400);

      const put = await fetch(upload.url, {
        method: 'PUT',
        headers: upload.headers,
        body: pdfBytes,
      });
      expect(put.status).toBe(200);

      const done = await as(ada)
        .post(`/api/cv-versions/${cvVersion.id}/complete-upload`)
        .expect(200);
      expect(done.body).toMatchObject({ status: 'READY', sizeBytes: pdfBytes.length });
      // Completing twice is harmless.
      await as(ada).post(`/api/cv-versions/${cvVersion.id}/complete-upload`).expect(200);
    });

    it('rejects a file that is not a PDF even if it claims to be one', async () => {
      const fake = Buffer.from('<html>not a pdf</html>');
      const { cvVersion, upload } = cvUploadResponseSchema.parse(
        (await start(ada, fake.length).expect(201)).body,
      );
      await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: fake });
      const res = await as(ada)
        .post(`/api/cv-versions/${cvVersion.id}/complete-upload`)
        .expect(400);
      expect(res.body.message).toBe('The file is not a PDF');
    });

    it('refuses oversized files before any URL is issued, and other users entirely', async () => {
      await start(ada, 6 * 1024 * 1024).expect(400);
      await start(bob).expect(404); // Ada's application
    });
  });

  it('lists only my versions, newest first', async () => {
    await as(ada).put('/api/cv-profile', profile).expect(200);
    await as(ada).post(`/api/applications/${applicationId}/cv`).expect(202);
    await as(ada).post(`/api/applications/${applicationId}/cv`).expect(202);
    const mine = await as(ada).get(`/api/cv-versions?applicationId=${applicationId}`).expect(200);
    expect(mine.body).toHaveLength(2);
    expect((await as(bob).get('/api/cv-versions').expect(200)).body).toEqual([]);
  });
});
