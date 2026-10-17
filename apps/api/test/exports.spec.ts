import request from 'supertest';
import { registerUser } from './auth.helpers.js';
import { createCatalog, createListing } from './fixtures.js';
import { createTestApp, resetDatabase, type TestApp } from './test-app.js';
import { neutralizeFormula } from '../src/modules/exports/exports.service.js';

describe('GET /api/exports/applications.csv', () => {
  let t: TestApp;
  let ada: string;
  let bob: string;
  const server = () => t.app.getHttpServer();

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    ada = await registerUser(server(), 'ada@example.com');
    bob = await registerUser(server(), 'bob@example.com');
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('streams one row per status change, as a CSV download', async () => {
    const catalog = await createCatalog(t.prisma);
    const listing = await createListing(t.prisma, catalog, { title: 'Engineer, "Platform"' });
    const app = await request(server())
      .post('/api/applications')
      .set('Cookie', ada)
      .send({ jobListingId: listing.id });
    await request(server())
      .patch(`/api/applications/${app.body.id}/status`)
      .set('Cookie', ada)
      .send({ status: 'APPLIED', note: '=HYPERLINK("http://evil")' });

    const res = await request(server())
      .get('/api/exports/applications.csv')
      .set('Cookie', ada)
      .expect(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="jobpilot-applications-\d{4}-\d{2}-\d{2}\.csv"$/,
    );

    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe(
      'application_id,listing_title,company,source,listing_url,current_status,applied_at,event_at,from_status,to_status,note',
    );
    expect(lines).toHaveLength(3); // header + SAVED + APPLIED
    expect(lines[1]).toContain('"Engineer, ""Platform"""'); // CSV quoting
    expect(lines[2]).toContain(`"'=HYPERLINK(""http://evil"")"`); // formula neutralised
  });

  it("contains only the caller's rows", async () => {
    const catalog = await createCatalog(t.prisma);
    const listing = await createListing(t.prisma, catalog);
    await request(server())
      .post('/api/applications')
      .set('Cookie', ada)
      .send({ jobListingId: listing.id });

    const forBob = await request(server())
      .get('/api/exports/applications.csv')
      .set('Cookie', bob)
      .expect(200);
    expect(forBob.text.trim().split('\n')).toHaveLength(1); // header only
  });

  it('requires a session', async () => {
    await request(server()).get('/api/exports/applications.csv').expect(401);
  });

  it('neutralises every formula trigger character', () => {
    expect(['=1', '+1', '-1', '@1', '\t1', 'ok'].map(neutralizeFormula)).toEqual([
      "'=1",
      "'+1",
      "'-1",
      "'@1",
      "'\t1",
      'ok',
    ]);
  });
});
