import request from 'supertest';
import { createTestApp, type TestApp } from './test-app.js';

describe('health endpoints', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('reports ready when the database answers, and live without asking it', async () => {
    const ready = await request(t.app.getHttpServer()).get('/api/health/ready').expect(200);
    expect(ready.body).toEqual({ status: 'ok' });
    const live = await request(t.app.getHttpServer()).get('/api/health/live').expect(200);
    expect(live.body).toEqual({ status: 'ok' });
  });

  it('returns a generated request id', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/health/live');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a well-formed incoming request id and replaces a malformed one', async () => {
    const server = t.app.getHttpServer();
    const kept = await request(server).get('/api/health/live').set('x-request-id', 'web-abc-123');
    expect(kept.headers['x-request-id']).toBe('web-abc-123');

    const replaced = await request(server)
      .get('/api/health/live')
      .set('x-request-id', 'bad id;drop');
    expect(replaced.headers['x-request-id']).not.toBe('bad id;drop');
  });
});
