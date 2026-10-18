import {
  QUEUE,
  alertsSummarySchema,
  savedSearchResponseSchema,
  searchMatchSchema,
  type CvProfileInput,
  type RescoreUserData,
} from '@jobpilot/shared';
import type { Storage } from '@jobpilot/storage';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import request from 'supertest';
import { inject } from 'vitest';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../src/config/config.js';
import { STORAGE } from '../src/infra/storage/storage.module.js';
import { PASSWORD, registerUser } from './auth.helpers.js';
import { createCatalog, createListing } from './fixtures.js';
import { createTestApp, resetDatabase, type TestApp } from './test-app.js';

describe('multi-user: profiles, saved searches, alerts, quotas, deletion', () => {
  let t: TestApp;
  let ada: string;
  let bob: string;
  let adaId: string;
  const server = () => t.app.getHttpServer();
  const as = (cookie: string) => ({
    get: (url: string) => request(server()).get(url).set('Cookie', cookie),
    put: (url: string, body: object) => request(server()).put(url).set('Cookie', cookie).send(body),
    post: (url: string, body: object = {}) =>
      request(server()).post(url).set('Cookie', cookie).send(body),
    delete: (url: string, body: object = {}) =>
      request(server()).delete(url).set('Cookie', cookie).send(body),
  });

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    ada = await registerUser(server(), 'ada@example.com');
    bob = await registerUser(server(), 'bob@example.com');
    adaId = (await t.prisma.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } })).id;
  });
  afterAll(async () => {
    await t.app.close();
  });

  describe('skill profile', () => {
    const profile = {
      skills: ['Node.js', 'TypeScript'],
      preferredRoles: ['Backend Engineer'],
      minSalary: 60_000,
    };

    it('is 404 until saved, then round-trips and queues a rescore for that user', async () => {
      await as(ada).get('/api/skill-profile').expect(404);
      await as(ada).put('/api/skill-profile', profile).expect(200);
      expect((await as(ada).get('/api/skill-profile').expect(200)).body).toEqual(profile);
      await as(bob).get('/api/skill-profile').expect(404); // per user

      const config = t.app.get<AppConfig>(APP_CONFIG);
      const redis = new Redis(inject('redisUrl'), { maxRetriesPerRequest: null });
      const queue = new Queue<RescoreUserData>(QUEUE.rescoreUser, {
        connection: redis,
        prefix: config.BULLMQ_PREFIX,
      });
      try {
        const jobs = await queue.getJobs(['waiting']);
        expect(jobs.map((j) => j.data)).toEqual([{ userId: adaId }]);
      } finally {
        await queue.obliterate({ force: true });
        await queue.close();
        await redis.quit();
      }
    });

    it('rejects invalid input', async () => {
      await as(ada)
        .put('/api/skill-profile', { ...profile, minSalary: -5 })
        .expect(400);
    });
  });

  describe('saved searches and alerts', () => {
    const create = (
      cookie: string,
      name = 'Node remote',
      filters: object = { q: 'node', remote: true },
    ) => as(cookie).post('/api/saved-searches', { name, filters });

    it('creates and lists per user, and shows new matches until marked seen', async () => {
      const search = savedSearchResponseSchema.parse((await create(ada).expect(201)).body);
      expect(search).toMatchObject({
        name: 'Node remote',
        filters: { q: 'node', remote: true },
        newMatches: 0,
      });

      // What the worker does when a new listing matches (tested in the worker).
      const listing = await createListing(t.prisma, await createCatalog(t.prisma), {
        title: 'Node.js Engineer',
      });
      await t.prisma.listingScore.create({
        data: { userId: adaId, jobListingId: listing.id, score: 77 },
      });
      await t.prisma.searchMatch.create({
        data: { savedSearchId: search.id, jobListingId: listing.id },
      });

      expect(
        alertsSummarySchema.parse((await as(ada).get('/api/alerts/summary').expect(200)).body)
          .unseen,
      ).toBe(1);
      expect((await as(bob).get('/api/alerts/summary').expect(200)).body.unseen).toBe(0);
      const list = z
        .array(savedSearchResponseSchema)
        .parse((await as(ada).get('/api/saved-searches').expect(200)).body);
      expect(list[0]?.newMatches).toBe(1);

      const matches = z
        .array(searchMatchSchema)
        .parse((await as(ada).get(`/api/saved-searches/${search.id}/matches`).expect(200)).body);
      expect(matches).toEqual([
        expect.objectContaining({
          seen: false,
          listing: expect.objectContaining({ title: 'Node.js Engineer', score: 77 }),
        }),
      ]);

      expect(
        (await as(ada).post(`/api/saved-searches/${search.id}/seen`).expect(200)).body,
      ).toEqual({ marked: 1 });
      expect((await as(ada).get('/api/alerts/summary').expect(200)).body.unseen).toBe(0);
    });

    it("answers 404 for everything about another user's saved search", async () => {
      const { id } = savedSearchResponseSchema.parse((await create(ada).expect(201)).body);
      await as(bob).get(`/api/saved-searches/${id}/matches`).expect(404);
      await as(bob).post(`/api/saved-searches/${id}/seen`).expect(404);
      await as(bob).delete(`/api/saved-searches/${id}`).expect(404);
      expect((await as(bob).get('/api/saved-searches').expect(200)).body).toEqual([]);
      expect(await t.prisma.savedSearch.count()).toBe(1); // still there

      await as(ada).delete(`/api/saved-searches/${id}`).expect(204);
      expect(await t.prisma.savedSearch.count()).toBe(0);
    });

    it('caps saved searches per user', async () => {
      for (let i = 0; i < 20; i++) await create(ada, `Search ${i}`).expect(201);
      const res = await create(ada, 'One too many').expect(409);
      expect(res.body.message).toBe('You can keep at most 20 saved searches');
      await create(bob).expect(201); // the quota is per user
    });

    it('validates filters', async () => {
      await create(ada, 'Bad', { minScore: 101 }).expect(400);
      await create(ada, '', {}).expect(400);
    });
  });

  describe('CV quota', () => {
    it('allows CV_DAILY_LIMIT generated CVs per user per day, then answers 429', async () => {
      const limited = await createTestApp({ CV_DAILY_LIMIT: 2 });
      try {
        const srv = limited.app.getHttpServer();
        const cookie = await registerUser(srv, 'carol@example.com');
        const profile: CvProfileInput = {
          fullName: 'Carol',
          headline: 'Engineer',
          summary: 'Builds things.',
        };
        await request(srv).put('/api/cv-profile').set('Cookie', cookie).send(profile).expect(200);
        const listing = await createListing(limited.prisma, await createCatalog(limited.prisma));
        const app = await request(srv)
          .post('/api/applications')
          .set('Cookie', cookie)
          .send({ jobListingId: listing.id });
        const generate = () =>
          request(srv).post(`/api/applications/${app.body.id}/cv`).set('Cookie', cookie);

        await generate().expect(202);
        await generate().expect(202);
        const res = await generate().expect(429);
        expect(res.body.message).toBe('Daily limit of 2 generated CVs reached; try again tomorrow');
      } finally {
        await limited.app.close();
      }
    });
  });

  describe('account deletion', () => {
    it('needs the password', async () => {
      await as(ada).delete('/api/users/me', { password: 'wrong password!!' }).expect(401);
      expect(await t.prisma.user.count({ where: { id: adaId } })).toBe(1);
    });

    it("removes the user's data and files, keeps shared data and other users", async () => {
      const listing = await createListing(t.prisma, await createCatalog(t.prisma));
      await as(ada).post('/api/applications', { jobListingId: listing.id }).expect(201);
      await as(bob).post('/api/applications', { jobListingId: listing.id }).expect(201);
      await as(ada).post('/api/saved-searches', { name: 'Mine', filters: {} }).expect(201);
      const storage = t.app.get<Storage>(STORAGE);
      await storage.putObject(
        `users/${adaId}/cv/test.pdf`,
        Buffer.from('%PDF-1.7'),
        'application/pdf',
      );

      const res = await as(ada).delete('/api/users/me', { password: PASSWORD }).expect(204);
      expect(String(res.headers['set-cookie'])).toMatch(/jp_session=;/); // cookie cleared

      expect(await t.prisma.user.count({ where: { id: adaId } })).toBe(0);
      expect(await t.prisma.application.count({ where: { userId: adaId } })).toBe(0);
      expect(await t.prisma.session.count({ where: { userId: adaId } })).toBe(0);
      expect(await t.prisma.savedSearch.count({ where: { userId: adaId } })).toBe(0);
      expect(await storage.headObject(`users/${adaId}/cv/test.pdf`)).toBeNull();

      expect(await t.prisma.jobListing.count()).toBe(1); // shared, stays
      await as(bob).get('/api/applications').expect(200);
      await as(ada).get('/api/users/me').expect(401); // the old session is gone
    });
  });
});
