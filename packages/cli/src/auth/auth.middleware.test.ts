import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { requireAuth, SESSION_COOKIE_NAME } from './auth.middleware.js';
import { signSessionToken } from './jwt.js';
import type { AuthenticatedRequest } from './auth.middleware.js';

const secret = new TextEncoder().encode('test-secret-at-least-32-bytes-long!');

function buildApp(publicPaths?: ReadonlySet<string>, publicPathPrefixes?: readonly string[]) {
  const app = express();
  app.use((req, res, next) => {
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const [, value] = cookieHeader.split('=');
      (req as unknown as { cookies: Record<string, string> }).cookies = { [SESSION_COOKIE_NAME]: value ?? '' };
    } else {
      (req as unknown as { cookies: Record<string, string> }).cookies = {};
    }
    next();
  });
  app.use(requireAuth(secret, publicPaths, publicPathPrefixes));
  app.get('/rest/auth/setup', (_req, res) => res.json({ public: true }));
  app.get('/rest/workflows', (req, res) => res.json({ user: (req as AuthenticatedRequest).user }));
  app.get('/webhook/my-hook', (_req, res) => res.json({ webhook: true }));
  return app;
}

describe('requireAuth', () => {
  it('rejects a request with no session cookie', async () => {
    const res = await request(buildApp()).get('/rest/workflows');
    expect(res.status).toBe(401);
  });

  it('rejects a request with an invalid session cookie', async () => {
    const res = await request(buildApp()).get('/rest/workflows').set('Cookie', `${SESSION_COOKIE_NAME}=garbage`);
    expect(res.status).toBe(401);
  });

  it('allows a request with a valid session and attaches req.user', async () => {
    const token = await signSessionToken({ sub: 'u1', email: 'a@example.com' }, secret);
    const res = await request(buildApp())
      .get('/rest/workflows')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 'u1', email: 'a@example.com' });
  });

  it('lets an allowlisted public path through without a session', async () => {
    const res = await request(buildApp(new Set(['/rest/auth/setup']))).get('/rest/auth/setup');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ public: true });
  });

  it('still guards a non-allowlisted path even when a publicPaths set is provided', async () => {
    const res = await request(buildApp(new Set(['/rest/auth/setup']))).get('/rest/workflows');
    expect(res.status).toBe(401);
  });

  it('lets a path under an allowlisted prefix through without a session', async () => {
    const res = await request(buildApp(undefined, ['/webhook/'])).get('/webhook/my-hook');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ webhook: true });
  });

  it('still guards paths that do not match any allowlisted prefix', async () => {
    const res = await request(buildApp(undefined, ['/webhook/'])).get('/rest/workflows');
    expect(res.status).toBe(401);
  });
});
