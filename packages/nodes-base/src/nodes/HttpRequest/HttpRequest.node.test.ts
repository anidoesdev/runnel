import { afterEach, describe, expect, it } from 'vitest';
import { MapCredentialTypes } from '@n8n-clone/core';
import { httpRequestNode } from './HttpRequest.node.js';
import { httpBearerAuth } from '../../credentials/HttpBearerAuth.credentials.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';
import { readRequestBody, startTestServer } from '../../test-server.js';
import type { TestServer } from '../../test-server.js';

let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('HTTP Request node — basic requests', () => {
  it('performs a GET and wraps a JSON object response as one item', async () => {
    server = await startTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ hello: 'world' }));
    });

    const node = makeNode({ name: 'HTTP', type: 'httpRequest', parameters: { url: server.url } });
    const ctx = makeExecuteFunctions([{ json: {} }], { node });
    const result = await httpRequestNode.execute!.call(ctx);

    expect(result[0]).toEqual([{ json: { hello: 'world' }, pairedItem: { item: 0 } }]);
  });

  it('wraps a JSON array response as one item per array entry', async () => {
    server = await startTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify([{ id: 1 }, { id: 2 }]));
    });

    const node = makeNode({ name: 'HTTP', type: 'httpRequest', parameters: { url: server.url } });
    const ctx = makeExecuteFunctions([{ json: {} }], { node });
    const result = await httpRequestNode.execute!.call(ctx);

    expect(result[0]).toEqual([
      { json: { id: 1 }, pairedItem: { item: 0 } },
      { json: { id: 2 }, pairedItem: { item: 0 } },
    ]);
  });

  it('treats a null entry in an array response as an empty item rather than crashing', async () => {
    server = await startTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify([null, { id: 2 }]));
    });

    const node = makeNode({ name: 'HTTP', type: 'httpRequest', parameters: { url: server.url } });
    const ctx = makeExecuteFunctions([{ json: {} }], { node });
    const result = await httpRequestNode.execute!.call(ctx);

    expect(result[0]).toEqual([
      { json: {}, pairedItem: { item: 0 } },
      { json: { id: 2 }, pairedItem: { item: 0 } },
    ]);
  });

  it('wraps a primitive/text response under a "data" key', async () => {
    server = await startTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('plain text');
    });

    const node = makeNode({ name: 'HTTP', type: 'httpRequest', parameters: { url: server.url } });
    const ctx = makeExecuteFunctions([{ json: {} }], { node });
    const result = await httpRequestNode.execute!.call(ctx);

    expect(result[0]).toEqual([{ json: { data: 'plain text' }, pairedItem: { item: 0 } }]);
  });

  it('runs once per input item, calling the server once per item', async () => {
    let requestCount = 0;
    server = await startTestServer((req, res) => {
      requestCount++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });

    const node = makeNode({ name: 'HTTP', type: 'httpRequest', parameters: { url: server.url } });
    const ctx = makeExecuteFunctions([{ json: {} }, { json: {} }, { json: {} }], { node });
    await httpRequestNode.execute!.call(ctx);

    expect(requestCount).toBe(3);
  });

  it('sends the configured method, query parameters, headers, and JSON body', async () => {
    let method = '';
    let url = '';
    let headerValue = '';
    let bodyText = '';
    server = await startTestServer((req, res) => {
      method = req.method ?? '';
      url = req.url ?? '';
      headerValue = String(req.headers['x-custom'] ?? '');
      readRequestBody(req).then((text) => {
        bodyText = text;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      });
    });

    const node = makeNode({
      name: 'HTTP',
      type: 'httpRequest',
      parameters: {
        url: server.url,
        method: 'POST',
        sendQuery: true,
        queryParameters: { values: [{ name: 'q', value: '1' }] },
        sendHeaders: true,
        headerParameters: { values: [{ name: 'X-Custom', value: 'abc' }] },
        sendBody: true,
        jsonBody: '{"a": 1}',
      },
    });
    const ctx = makeExecuteFunctions([{ json: {} }], { node });
    await httpRequestNode.execute!.call(ctx);

    expect(method).toBe('POST');
    expect(url).toBe('/?q=1');
    expect(headerValue).toBe('abc');
    expect(bodyText).toBe('{"a":1}');
  });

  it('propagates an error for a non-2xx response', async () => {
    server = await startTestServer((req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{}');
    });

    const node = makeNode({ name: 'HTTP', type: 'httpRequest', parameters: { url: server.url } });
    const ctx = makeExecuteFunctions([{ json: {} }], { node });
    await expect(httpRequestNode.execute!.call(ctx)).rejects.toThrow();
  });
});

describe('HTTP Request node — authentication', () => {
  it('httpBasicAuth sends a correctly encoded Authorization header', async () => {
    let authHeader = '';
    server = await startTestServer((req, res) => {
      authHeader = String(req.headers.authorization ?? '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });

    const node = makeNode({
      name: 'HTTP',
      type: 'httpRequest',
      parameters: { url: server.url, authentication: 'httpBasicAuth' },
    });
    const ctx = makeExecuteFunctions([{ json: {} }], {
      node,
      credentialsResolver: async () => ({ user: 'alice', password: 'secret' }),
    });
    await httpRequestNode.execute!.call(ctx);

    expect(authHeader).toBe(`Basic ${Buffer.from('alice:secret').toString('base64')}`);
  });

  it('httpHeaderAuth sends the credential-defined header name and value', async () => {
    let headerValue = '';
    server = await startTestServer((req, res) => {
      headerValue = String(req.headers['x-api-key'] ?? '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });

    const node = makeNode({
      name: 'HTTP',
      type: 'httpRequest',
      parameters: { url: server.url, authentication: 'httpHeaderAuth' },
    });
    const ctx = makeExecuteFunctions([{ json: {} }], {
      node,
      credentialsResolver: async () => ({ name: 'X-Api-Key', value: 'sk-123' }),
    });
    await httpRequestNode.execute!.call(ctx);

    expect(headerValue).toBe('sk-123');
  });

  it('httpQueryAuth sends the credential-defined query parameter', async () => {
    let receivedUrl = '';
    server = await startTestServer((req, res) => {
      receivedUrl = req.url ?? '';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });

    const node = makeNode({
      name: 'HTTP',
      type: 'httpRequest',
      parameters: { url: server.url, authentication: 'httpQueryAuth' },
    });
    const ctx = makeExecuteFunctions([{ json: {} }], {
      node,
      credentialsResolver: async () => ({ name: 'api_key', value: 'sk-456' }),
    });
    await httpRequestNode.execute!.call(ctx);

    expect(receivedUrl).toBe('/?api_key=sk-456');
  });

  it('httpBearerAuth goes through the generic declarative helper', async () => {
    let authHeader = '';
    server = await startTestServer((req, res) => {
      authHeader = String(req.headers.authorization ?? '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });

    const node = makeNode({
      name: 'HTTP',
      type: 'httpRequest',
      parameters: { url: server.url, authentication: 'httpBearerAuth' },
    });
    const credentialTypes = new MapCredentialTypes().register(httpBearerAuth);
    const ctx = makeExecuteFunctions([{ json: {} }], {
      node,
      credentialTypes,
      credentialsResolver: async () => ({ token: 'tok-789' }),
    });
    await httpRequestNode.execute!.call(ctx);

    expect(authHeader).toBe('Bearer tok-789');
  });
});
