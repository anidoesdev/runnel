import { afterEach, describe, expect, it } from 'vitest';
import { HttpStatusError, httpRequest } from './http-client.js';
import { readRequestBody, startTestServer } from './test-server.js';
import type { TestServer } from './test-server.js';

let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('httpRequest — basic requests', () => {
  it('performs a GET and parses a JSON response', async () => {
    server = await startTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ hello: 'world' }));
    });

    const result = await httpRequest({ url: server.url });
    expect(result).toEqual({ hello: 'world' });
  });

  it('appends query-string parameters to the URL', async () => {
    let receivedUrl = '';
    server = await startTestServer((req, res) => {
      receivedUrl = req.url ?? '';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });

    await httpRequest({ url: server.url, qs: { foo: 'bar', n: 1 } });
    expect(receivedUrl).toBe('/?foo=bar&n=1');
  });

  it('sends a JSON body with method and defaults the content-type header', async () => {
    let receivedMethod = '';
    let receivedContentType = '';
    let receivedBody = '';
    server = await startTestServer((req, res) => {
      receivedMethod = req.method ?? '';
      receivedContentType = req.headers['content-type'] ?? '';
      readRequestBody(req).then((body) => {
        receivedBody = body;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      });
    });

    await httpRequest({ url: server.url, method: 'POST', body: { a: 1 } });
    expect(receivedMethod).toBe('POST');
    expect(receivedContentType).toBe('application/json');
    expect(receivedBody).toBe('{"a":1}');
  });

  it('does not override an explicitly provided content-type header', async () => {
    let receivedContentType = '';
    server = await startTestServer((req, res) => {
      receivedContentType = req.headers['content-type'] ?? '';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });

    await httpRequest({
      url: server.url,
      method: 'POST',
      body: { a: 1 },
      headers: { 'Content-Type': 'application/vnd.custom+json' },
    });
    expect(receivedContentType).toBe('application/vnd.custom+json');
  });

  it('sends custom headers', async () => {
    let receivedHeader = '';
    server = await startTestServer((req, res) => {
      receivedHeader = String(req.headers['x-api-key'] ?? '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });

    await httpRequest({ url: server.url, headers: { 'X-Api-Key': 'secret' } });
    expect(receivedHeader).toBe('secret');
  });
});

describe('httpRequest — response parsing', () => {
  it('parses a text response when content-type is not JSON', async () => {
    server = await startTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('plain text body');
    });

    expect(await httpRequest({ url: server.url })).toBe('plain text body');
  });

  it('forces JSON parsing when encoding is "json" regardless of content-type', async () => {
    server = await startTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('{"forced":true}');
    });

    expect(await httpRequest({ url: server.url, encoding: 'json' })).toEqual({ forced: true });
  });

  it('returns a Buffer when encoding is "arraybuffer"', async () => {
    server = await startTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(Buffer.from([1, 2, 3]));
    });

    const result = await httpRequest({ url: server.url, encoding: 'arraybuffer' });
    expect(Buffer.isBuffer(result)).toBe(true);
    expect([...(result as Buffer)]).toEqual([1, 2, 3]);
  });
});

describe('httpRequest — error handling', () => {
  it('throws HttpStatusError with the parsed body on a non-2xx response', async () => {
    server = await startTestServer((req, res) => {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });

    await expect(httpRequest({ url: server.url })).rejects.toMatchObject({
      statusCode: 404,
      body: { error: 'not found' },
    });
    await expect(httpRequest({ url: server.url })).rejects.toBeInstanceOf(HttpStatusError);
  });

  it('returnFullResponse suppresses the throw and returns statusCode/headers/body directly', async () => {
    server = await startTestServer((req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'boom' }));
    });

    const result = (await httpRequest({ url: server.url, returnFullResponse: true })) as {
      statusCode: number;
      body: unknown;
    };
    expect(result.statusCode).toBe(500);
    expect(result.body).toEqual({ error: 'boom' });
  });
});

describe('httpRequest — retries', () => {
  it('retries on a 5xx response and succeeds once the server recovers', async () => {
    let attempts = 0;
    server = await startTestServer((req, res) => {
      attempts++;
      if (attempts < 3) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end('{}');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });

    const result = await httpRequest(
      { url: server.url, retry: { maxRetries: 3, retryDelayMs: 0 } },
      { sleep: async () => {} },
    );
    expect(result).toEqual({ ok: true });
    expect(attempts).toBe(3);
  });

  it('gives up and throws after exhausting retries on a persistent 5xx', async () => {
    let attempts = 0;
    server = await startTestServer((req, res) => {
      attempts++;
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end('{}');
    });

    await expect(
      httpRequest({ url: server.url, retry: { maxRetries: 2, retryDelayMs: 0 } }, { sleep: async () => {} }),
    ).rejects.toBeInstanceOf(HttpStatusError);
    expect(attempts).toBe(3); // initial attempt + 2 retries
  });

  it('does not retry a non-5xx error status', async () => {
    let attempts = 0;
    server = await startTestServer((req, res) => {
      attempts++;
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end('{}');
    });

    await expect(
      httpRequest({ url: server.url, retry: { maxRetries: 3, retryDelayMs: 0 } }, { sleep: async () => {} }),
    ).rejects.toBeInstanceOf(HttpStatusError);
    expect(attempts).toBe(1);
  });

  it('retries a network-level failure (connection refused)', async () => {
    // Bind and immediately close to get a port nothing is listening on.
    const temp = await startTestServer(() => {});
    const deadUrl = temp.url;
    await temp.close();

    await expect(
      httpRequest({ url: deadUrl, retry: { maxRetries: 2, retryDelayMs: 0 } }, { sleep: async () => {} }),
    ).rejects.toThrow();
  });
});

describe('httpRequest — timeout', () => {
  it('aborts a request that exceeds the timeout', async () => {
    server = await startTestServer((req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      }, 200);
    });

    await expect(httpRequest({ url: server.url, timeout: 20 })).rejects.toThrow();
  });
});
