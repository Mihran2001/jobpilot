import {
  applicationDetailSchema,
  applicationListSchema,
  type ApplicationStatus,
} from '@jobpilot/shared';
import request from 'supertest';
import { registerUser } from './auth.helpers.js';
import { createCatalog, createListing } from './fixtures.js';
import { createTestApp, resetDatabase, type TestApp } from './test-app.js';

describe('applications', () => {
  let t: TestApp;
  let ada: string; // session cookies
  let bob: string;
  let listingId: string;
  const server = () => t.app.getHttpServer();

  const create = (cookie: string, jobListingId = listingId) =>
    request(server()).post('/api/applications').set('Cookie', cookie).send({ jobListingId });
  const changeStatus = (cookie: string, id: string, status: ApplicationStatus, note?: string) =>
    request(server())
      .patch(`/api/applications/${id}/status`)
      .set('Cookie', cookie)
      .send({ status, note });

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    ada = await registerUser(server(), 'ada@example.com');
    bob = await registerUser(server(), 'bob@example.com');
    const catalog = await createCatalog(t.prisma);
    listingId = (await createListing(t.prisma, catalog, { title: 'Node.js Engineer' })).id;
  });
  afterAll(async () => {
    await t.app.close();
  });

  describe('create', () => {
    it('starts as SAVED with a first event from nothing to SAVED', async () => {
      const res = await create(ada).expect(201);
      const app = applicationDetailSchema.parse(res.body);
      expect(app.status).toBe('SAVED');
      expect(app.listing.title).toBe('Node.js Engineer');
      expect(app.events).toEqual([
        expect.objectContaining({ fromStatus: null, toStatus: 'SAVED' }),
      ]);
    });

    it('rejects a second application for the same listing with 409', async () => {
      await create(ada).expect(201);
      await create(ada).expect(409);
    });

    it('lets two users apply to the same listing', async () => {
      await create(ada).expect(201);
      await create(bob).expect(201);
    });

    it('answers 404 for an unknown listing and 400 for a malformed id', async () => {
      await create(ada, '01a13ac6-0000-7000-8000-000000000000').expect(404);
      await create(ada, 'nope').expect(400);
    });
  });

  describe('change status', () => {
    it('writes an event per change and keeps the first appliedAt', async () => {
      const { id } = applicationDetailSchema.parse((await create(ada).expect(201)).body);

      const applied = applicationDetailSchema.parse(
        (await changeStatus(ada, id, 'APPLIED', 'Sent CV').expect(200)).body,
      );
      expect(applied.appliedAt).not.toBeNull();

      const interview = applicationDetailSchema.parse(
        (await changeStatus(ada, id, 'INTERVIEW').expect(200)).body,
      );
      expect(interview.appliedAt).toBe(applied.appliedAt);
      expect(interview.events.map((e) => [e.fromStatus, e.toStatus, e.note])).toEqual([
        [null, 'SAVED', null],
        ['SAVED', 'APPLIED', 'Sent CV'],
        ['APPLIED', 'INTERVIEW', null],
      ]);
    });

    it('rejects a change to the current status with 400 and writes no event', async () => {
      const { id } = applicationDetailSchema.parse((await create(ada).expect(201)).body);
      await changeStatus(ada, id, 'SAVED').expect(400);
      expect(await t.prisma.applicationEvent.count()).toBe(1);
    });

    it('keeps the event history consistent under parallel changes', async () => {
      const { id } = applicationDetailSchema.parse((await create(ada).expect(201)).body);
      const targets: ApplicationStatus[] = ['APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED'];

      const results = await Promise.all(
        [...targets, ...targets].map((status) => changeStatus(ada, id, status)),
      );
      // Each request either succeeded or was told to retry / was a no-op.
      for (const res of results) expect([200, 400, 409]).toContain(res.status);

      const events = await t.prisma.applicationEvent.findMany({
        where: { applicationId: id },
        orderBy: { createdAt: 'asc' },
      });
      // Every event starts where the previous one ended: no lost update.
      for (let i = 1; i < events.length; i++) {
        expect(events[i]?.fromStatus).toBe(events[i - 1]?.toStatus);
      }
      const final = await t.prisma.application.findUniqueOrThrow({ where: { id } });
      expect(final.status).toBe(events.at(-1)?.toStatus);
    });
  });

  describe('edit notes', () => {
    const editNotes = (cookie: string, id: string, notes: unknown) =>
      request(server()).patch(`/api/applications/${id}`).set('Cookie', cookie).send({ notes });

    it('replaces the notes, and null clears them', async () => {
      const { id } = applicationDetailSchema.parse((await create(ada).expect(201)).body);

      const updated = applicationDetailSchema.parse(
        (await editNotes(ada, id, '  Ask about the team size  ').expect(200)).body,
      );
      expect(updated.notes).toBe('Ask about the team size'); // trimmed by the schema

      const cleared = applicationDetailSchema.parse(
        (await editNotes(ada, id, null).expect(200)).body,
      );
      expect(cleared.notes).toBeNull();
    });

    it('does not touch the status history', async () => {
      const { id } = applicationDetailSchema.parse((await create(ada).expect(201)).body);
      await editNotes(ada, id, 'Some notes').expect(200);
      expect(await t.prisma.applicationEvent.count({ where: { applicationId: id } })).toBe(1);
    });

    it("answers 404 when user B edits user A's notes, and changes nothing", async () => {
      const { id } = applicationDetailSchema.parse((await create(ada).expect(201)).body);
      await editNotes(ada, id, 'Ada wrote this').expect(200);

      const res = await editNotes(bob, id, 'Bob was here').expect(404);
      expect(res.body.message).toBe('Application not found');

      const row = await t.prisma.application.findUniqueOrThrow({ where: { id } });
      expect(row.notes).toBe('Ada wrote this');
    });

    it('rejects a missing or too long notes field with 400', async () => {
      const { id } = applicationDetailSchema.parse((await create(ada).expect(201)).body);
      await request(server())
        .patch(`/api/applications/${id}`)
        .set('Cookie', ada)
        .send({})
        .expect(400);
      await editNotes(ada, id, 'x'.repeat(5001)).expect(400);
    });
  });

  describe('list', () => {
    it('returns only my applications, filtered by status, with counts for every status', async () => {
      const catalog = await t.prisma.source.findFirstOrThrow();
      const company = await t.prisma.company.findFirstOrThrow();
      const second = await createListing(t.prisma, { source: catalog, company });

      const first = applicationDetailSchema.parse((await create(ada).expect(201)).body);
      await create(ada, second.id).expect(201);
      await changeStatus(ada, first.id, 'APPLIED').expect(200);
      await create(bob).expect(201);

      const all = applicationListSchema.parse(
        (await request(server()).get('/api/applications').set('Cookie', ada).expect(200)).body,
      );
      expect(all.items).toHaveLength(2);
      expect(all.counts).toEqual({ SAVED: 1, APPLIED: 1, INTERVIEW: 0, OFFER: 0, REJECTED: 0 });

      const applied = applicationListSchema.parse(
        (
          await request(server())
            .get('/api/applications?status=APPLIED')
            .set('Cookie', ada)
            .expect(200)
        ).body,
      );
      expect(applied.items.map((a) => a.id)).toEqual([first.id]);
    });
  });

  describe('ownership', () => {
    it("answers 404 when user B reads user A's application", async () => {
      const { id } = applicationDetailSchema.parse((await create(ada).expect(201)).body);

      await request(server()).get(`/api/applications/${id}`).set('Cookie', ada).expect(200);
      const res = await request(server())
        .get(`/api/applications/${id}`)
        .set('Cookie', bob)
        .expect(404);
      // Same answer as for an id that does not exist at all.
      expect(res.body.message).toBe('Application not found');
    });

    it("answers 404 when user B changes user A's application, and changes nothing", async () => {
      const { id } = applicationDetailSchema.parse((await create(ada).expect(201)).body);
      await changeStatus(bob, id, 'REJECTED').expect(404);

      const unchanged = await t.prisma.application.findUniqueOrThrow({ where: { id } });
      expect(unchanged.status).toBe('SAVED');
      expect(await t.prisma.applicationEvent.count({ where: { applicationId: id } })).toBe(1);
    });
  });
});
