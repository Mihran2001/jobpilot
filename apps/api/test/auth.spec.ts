import request from 'supertest';
import { PASSWORD, registerUser, sessionCookie } from './auth.helpers.js';
import { createTestApp, resetDatabase, type TestApp } from './test-app.js';

describe('auth', () => {
  let t: TestApp;
  const server = () => t.app.getHttpServer();

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t.app.close();
  });

  describe('POST /api/auth/register', () => {
    it('creates the user, stores an Argon2id hash and starts a session', async () => {
      const res = await request(server())
        .post('/api/auth/register')
        .send({ email: '  Ada@Example.com ', password: PASSWORD })
        .expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        email: 'ada@example.com', // trimmed and lower-cased by the shared schema
        createdAt: expect.any(String),
      });
      expect(res.body).not.toHaveProperty('passwordHash');

      const [setCookie] = res.headers['set-cookie'] as unknown as string[];
      expect(setCookie).toMatch(/^jp_session=[\w-]{43};/);
      expect(setCookie).toMatch(/HttpOnly/);
      expect(setCookie).toMatch(/SameSite=Lax/);

      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('stores only a hash of the session token', async () => {
      const cookie = await registerUser(server(), 'ada@example.com');
      const token = cookie.split('=')[1];
      const sessions = await t.prisma.session.findMany();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.tokenHash).not.toBe(token);
      expect(sessions[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('rejects a duplicate email with 409 (Prisma P2002 through the filter)', async () => {
      await registerUser(server(), 'ada@example.com');
      const res = await request(server())
        .post('/api/auth/register')
        .send({ email: 'ADA@example.com', password: PASSWORD })
        .expect(409);
      expect(res.body.message).toBe('Resource already exists');
    });

    it('rejects an invalid body with 400 and says what is wrong', async () => {
      const res = await request(server())
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'short' })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain('email');
      expect(JSON.stringify(res.body.message)).toContain('at least 12 characters');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await registerUser(server(), 'ada@example.com');
    });

    it('logs in with the right password', async () => {
      const res = await request(server())
        .post('/api/auth/login')
        .send({ email: 'ada@example.com', password: PASSWORD })
        .expect(200);
      expect(sessionCookie(res.headers['set-cookie'])).toMatch(/^jp_session=/);
    });

    it('gives the same 401 for a wrong password and an unknown email', async () => {
      const wrongPassword = await request(server())
        .post('/api/auth/login')
        .send({ email: 'ada@example.com', password: 'wrong password!!' })
        .expect(401);
      const unknownEmail = await request(server())
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: PASSWORD })
        .expect(401);
      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });
  });

  describe('sessions', () => {
    it('lets a session cookie reach a protected route, and nothing else', async () => {
      const cookie = await registerUser(server(), 'ada@example.com');
      const me = await request(server()).get('/api/users/me').set('Cookie', cookie).expect(200);
      expect(me.body.email).toBe('ada@example.com');

      await request(server()).get('/api/users/me').expect(401);
      await request(server()).get('/api/users/me').set('Cookie', 'jp_session=forged').expect(401);
    });

    it('logout deletes the session, so the old cookie stops working', async () => {
      const cookie = await registerUser(server(), 'ada@example.com');
      await request(server()).post('/api/auth/logout').set('Cookie', cookie).expect(204);
      expect(await t.prisma.session.count()).toBe(0);
      await request(server()).get('/api/users/me').set('Cookie', cookie).expect(401);
    });

    it('rejects and deletes an expired session', async () => {
      const cookie = await registerUser(server(), 'ada@example.com');
      await t.prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      await request(server()).get('/api/users/me').set('Cookie', cookie).expect(401);
      expect(await t.prisma.session.count()).toBe(0);
    });
  });
});

describe('login rate limit', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ AUTH_RATE_LIMIT_PER_MINUTE: 3 });
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('answers 429 once the per-minute limit is used up', async () => {
    const attempt = () =>
      request(t.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'ada@example.com', password: 'guessing-passwords' });

    for (let i = 0; i < 3; i++) await attempt().expect(401);
    await attempt().expect(429);
  });
});
