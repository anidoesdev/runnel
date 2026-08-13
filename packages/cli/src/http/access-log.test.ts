import { Writable } from 'node:stream';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildAccessLogMiddleware } from './access-log.js';
import { createLogger } from '../logging/logger.js';

function buildTestApp(): express.Express {
  const app = express();
  app.use(buildAccessLogMiddleware(createLogger({ level: 'silent' })));
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  return app;
}

function captureStream(): { stream: Writable; output: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { stream, output: () => chunks.join('') };
}

describe('buildAccessLogMiddleware', () => {
  it('does not interfere with the normal request/response cycle', async () => {
    const res = await request(buildTestApp()).get('/ping');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('generates and echoes back an X-Request-Id response header', async () => {
    const res = await request(buildTestApp()).get('/ping');
    const requestId = res.headers['x-request-id'] as string | undefined;
    expect(requestId).toEqual(expect.any(String));
    expect(requestId?.length).toBeGreaterThan(0);
  });

  it('reuses an incoming X-Request-Id instead of generating a new one', async () => {
    const res = await request(buildTestApp()).get('/ping').set('X-Request-Id', 'client-supplied-id');
    expect(res.headers['x-request-id']).toBe('client-supplied-id');
  });

  it('logs the real response status code, and never logs the raw session cookie', async () => {
    const { stream, output } = captureStream();
    const app = express();
    app.use(buildAccessLogMiddleware(createLogger({ destination: stream })));
    app.get('/ping', (_req, res) => res.json({ ok: true }));

    await request(app).get('/ping').set('Cookie', 'n8n-clone-auth=super-secret-session-token');

    const lines = output()
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const completedLine = lines.find((line) => line.msg === 'request completed') as
      | { res: { statusCode: number }; req: { headers: { cookie?: string } } }
      | undefined;

    expect(completedLine?.res.statusCode).toBe(200);
    expect(completedLine?.req.headers.cookie).toBe('[Redacted]');
    expect(output()).not.toContain('super-secret-session-token');
  });
});
