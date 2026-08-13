import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildAuthRateLimiter } from './rate-limit.js';

function buildTestApp(max: number): express.Express {
  const app = express();
  app.use(buildAuthRateLimiter({ windowMs: 60_000, max }));
  app.post('/rest/auth/login', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('buildAuthRateLimiter', () => {
  it('allows requests up to the configured limit', async () => {
    const app = buildTestApp(2);
    expect((await request(app).post('/rest/auth/login')).status).toBe(200);
    expect((await request(app).post('/rest/auth/login')).status).toBe(200);
  });

  it('rejects the request after the limit is exceeded, with a 429 and a clear JSON message', async () => {
    const app = buildTestApp(2);
    await request(app).post('/rest/auth/login');
    await request(app).post('/rest/auth/login');

    const res = await request(app).post('/rest/auth/login');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ message: 'Too many requests — try again later.' });
  });

  it('sets standard rate-limit response headers', async () => {
    const app = buildTestApp(5);
    const res = await request(app).post('/rest/auth/login');
    expect(res.headers['ratelimit-limit']).toBe('5');
  });
});
