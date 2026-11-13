import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '@uno-ultimate/database';
import { env } from '../../src/config/env';

describe('Guest Identity API Integration Tests', () => {
  const app = createApp();

  beforeAll(async () => {
    await prisma.guestSession.deleteMany({
      where: { username: { startsWith: 'ApiTest_' } },
    });
  });

  afterAll(async () => {
    await prisma.guestSession.deleteMany({
      where: { username: { startsWith: 'ApiTest_' } },
    });
    await prisma.$disconnect();
  });

  describe('POST /api/guest', () => {
    it('creates a new guest session and returns 201 with cookie', async () => {
      const res = await request(app)
        .post('/api/guest')
        .send({ username: 'ApiTest_Player1' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.guest.username).toBe('ApiTest_Player1');
      expect(res.body.data.guest.id).toBeDefined();
      expect(res.body.data.sessionToken).toHaveLength(64);

      // Verify HttpOnly cookie header
      const rawCookies = res.headers['set-cookie'];
      expect(rawCookies).toBeDefined();
      const cookieList = Array.isArray(rawCookies) ? rawCookies : [rawCookies as string];
      const sessionCookie = cookieList.find((c: string) => c.startsWith(`${env.COOKIE_NAME}=`));
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain('HttpOnly');
    });

    it('trims leading and trailing whitespace from username', async () => {
      const res = await request(app)
        .post('/api/guest')
        .send({ username: '   ApiTest_Trimmed   ' });

      expect(res.status).toBe(201);
      expect(res.body.data.guest.username).toBe('ApiTest_Trimmed');
    });

    it('rejects empty username with 400', async () => {
      const res = await request(app).post('/api/guest').send({ username: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects username shorter than minimum length with 400', async () => {
      const res = await request(app).post('/api/guest').send({ username: 'A' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects username exceeding maximum length (20 chars) with 400', async () => {
      const res = await request(app)
        .post('/api/guest')
        .send({ username: 'ThisIsAVeryLongUsernameThatExceedsLimit' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects control characters in username with 400', async () => {
      const res = await request(app)
        .post('/api/guest')
        .send({ username: 'Player\u0000Name' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/guest/resume', () => {
    it('resumes session using HttpOnly cookie', async () => {
      const createRes = await request(app)
        .post('/api/guest')
        .send({ username: 'ApiTest_CookieUser' });

      const cookie = createRes.headers['set-cookie'];

      const resumeRes = await request(app)
        .post('/api/guest/resume')
        .set('Cookie', cookie)
        .send({});

      expect(resumeRes.status).toBe(200);
      expect(resumeRes.body.success).toBe(true);
      expect(resumeRes.body.data.guest.username).toBe('ApiTest_CookieUser');
      expect(resumeRes.body.data.guest.id).toBe(createRes.body.data.guest.id);
    });

    it('resumes session using Authorization Bearer token header', async () => {
      const createRes = await request(app)
        .post('/api/guest')
        .send({ username: 'ApiTest_BearerUser' });

      const token = createRes.body.data.sessionToken;

      const resumeRes = await request(app)
        .post('/api/guest/resume')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(resumeRes.status).toBe(200);
      expect(resumeRes.body.success).toBe(true);
      expect(resumeRes.body.data.guest.username).toBe('ApiTest_BearerUser');
    });

    it('resumes session using body sessionToken', async () => {
      const createRes = await request(app)
        .post('/api/guest')
        .send({ username: 'ApiTest_BodyUser' });

      const token = createRes.body.data.sessionToken;

      const resumeRes = await request(app)
        .post('/api/guest/resume')
        .send({ sessionToken: token });

      expect(resumeRes.status).toBe(200);
      expect(resumeRes.body.success).toBe(true);
      expect(resumeRes.body.data.guest.username).toBe('ApiTest_BodyUser');
    });

    it('returns 401 when no token is provided', async () => {
      const res = await request(app).post('/api/guest/resume').send({});

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SESSION_INVALID');
    });

    it('returns 401 for an invalid session token', async () => {
      const res = await request(app)
        .post('/api/guest/resume')
        .send({ sessionToken: '0123456789abcdef0123456789abcdef0123456789abcdef' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
    });

    it('rejects impersonation attempt when client provides mismatched guestId', async () => {
      const userA = await request(app).post('/api/guest').send({ username: 'ApiTest_UserA' });
      const userB = await request(app).post('/api/guest').send({ username: 'ApiTest_UserB' });

      // User A tries to use User A's token with User B's guest ID
      const res = await request(app)
        .post('/api/guest/resume')
        .send({
          sessionToken: userA.body.data.sessionToken,
          guestId: userB.body.data.guest.id,
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SESSION_IMPERSONATION');
    });
  });
});
