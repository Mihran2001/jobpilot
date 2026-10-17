import { listingDetailSchema, listingsPageSchema } from '@jobpilot/shared';
import request from 'supertest';
import { registerUser } from './auth.helpers.js';
import { createCatalog, createListing } from './fixtures.js';
import { createTestApp, resetDatabase, type TestApp } from './test-app.js';

describe('listings', () => {
  let t: TestApp;
  let cookie: string;
  let catalog: Awaited<ReturnType<typeof createCatalog>>;
  const get = (url: string) => request(t.app.getHttpServer()).get(url).set('Cookie', cookie);
  // Parsing with the shared schema types the body and checks the response contract.
  const page = async (url: string) => listingsPageSchema.parse((await get(url).expect(200)).body);

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    cookie = await registerUser(t.app.getHttpServer(), 'ada@example.com');
    catalog = await createCatalog(t.prisma);
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('requires a session', async () => {
    await request(t.app.getHttpServer()).get('/api/listings').expect(401);
  });

  it('pages newest first and visits every listing exactly once, ties included', async () => {
    // Three listings share one timestamp: only the id tie-breaker orders them.
    const sameInstant = new Date('2026-03-01T12:00:00Z');
    const created = [
      await createListing(t.prisma, catalog, { postedAt: new Date('2026-03-02T00:00:00Z') }),
      await createListing(t.prisma, catalog, { postedAt: sameInstant }),
      await createListing(t.prisma, catalog, { postedAt: sameInstant }),
      await createListing(t.prisma, catalog, { postedAt: sameInstant }),
      await createListing(t.prisma, catalog, { postedAt: new Date('2026-02-01T00:00:00Z') }),
    ];

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await page(`/api/listings?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
      seen.push(...res.items.map((l) => l.id));
      cursor = res.nextCursor;
      pages += 1;
    } while (cursor);

    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(5);
    expect(seen[0]).toBe(created[0]?.id);
    expect(seen[4]).toBe(created[4]?.id);
  });

  it('filters by remote, salary and text', async () => {
    await createListing(t.prisma, catalog, { title: 'Node.js Engineer', salaryMax: 90_000 });
    await createListing(t.prisma, catalog, { title: 'React Developer', remote: false });
    await createListing(t.prisma, catalog, { title: 'Go Developer', salaryMax: 50_000 });

    const titles = async (query: string) =>
      (await page(`/api/listings?${query}`)).items.map((l) => l.title);

    expect(await titles('remote=false')).toEqual(['React Developer']);
    expect(await titles('minSalary=60000')).toEqual(['Node.js Engineer']);
    expect(await titles('q=node')).toEqual(['Node.js Engineer']);
    expect(await titles('q=DEVELOPER&remote=true')).toEqual(['Go Developer']);
  });

  it('shows each user their own score and filters on it', async () => {
    const listing = await createListing(t.prisma, catalog);
    const ada = await t.prisma.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });
    await t.prisma.listingScore.create({
      data: { userId: ada.id, jobListingId: listing.id, score: 87 },
    });
    const bobCookie = await registerUser(t.app.getHttpServer(), 'bob@example.com');

    const forAda = await page('/api/listings');
    expect(forAda.items[0]?.score).toBe(87);

    const forBob = await request(t.app.getHttpServer())
      .get('/api/listings')
      .set('Cookie', bobCookie)
      .expect(200);
    expect(listingsPageSchema.parse(forBob.body).items[0]?.score).toBeNull();

    expect((await page('/api/listings?minScore=80')).items).toHaveLength(1);
    expect((await page('/api/listings?minScore=90')).items).toHaveLength(0);
  });

  it('rejects bad query parameters with 400', async () => {
    await get('/api/listings?limit=0').expect(400);
    await get('/api/listings?limit=101').expect(400);
    await get('/api/listings?remote=yes').expect(400);
    await get('/api/listings?cursor=not-a-cursor').expect(400);
  });

  it('returns one listing with its description, 404 if missing, 400 if not a uuid', async () => {
    const listing = await createListing(t.prisma, catalog, { description: 'Build things.' });
    const res = await get(`/api/listings/${listing.id}`).expect(200);
    expect(listingDetailSchema.parse(res.body).description).toBe('Build things.');

    await get('/api/listings/01a13ac6-0000-7000-8000-000000000000').expect(404);
    await get('/api/listings/123').expect(400);
  });

  it('lists sources', async () => {
    const res = await get('/api/sources').expect(200);
    expect(res.body).toEqual([
      expect.objectContaining({ name: 'test-source', kind: 'API', lastFetchedAt: null }),
    ]);
  });
});
