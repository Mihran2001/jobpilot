import request from 'supertest';
import { createTestApp, type TestApp } from './test-app.js';

describe('GET /api/health', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('reports ok when the database answers', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns a generated request id', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a well-formed incoming request id and replaces a malformed one', async () => {
    const server = t.app.getHttpServer();
    const kept = await request(server).get('/api/health').set('x-request-id', 'web-abc-123');
    expect(kept.headers['x-request-id']).toBe('web-abc-123');

    const replaced = await request(server).get('/api/health').set('x-request-id', 'bad id;drop');
    expect(replaced.headers['x-request-id']).not.toBe('bad id;drop');
  });
});
