import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './http.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('api http client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GET prefixes the path with /rest, sends credentials, and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { hello: 'world' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.get<{ hello: string }>('/workflows');
    expect(result).toEqual({ hello: 'world' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/rest/workflows');
    expect(init.credentials).toBe('include');
    expect(init.method).toBe('GET');
  });

  it('POST serializes the body as JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: '1' }));
    vi.stubGlobal('fetch', fetchMock);

    await api.post('/workflows', { name: 'My WF' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'My WF' }));
  });

  it('returns undefined for a 204 No Content response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api.delete('/workflows/1');
    expect(result).toBeUndefined();
  });

  it('throws an ApiError with the backend message on a non-2xx JSON response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { message: 'Workflow "x" not found' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/workflows/x')).rejects.toMatchObject(
      new ApiError(404, 'Workflow "x" not found'),
    );
  });

  it('falls back to the status text when the error response has no JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500, statusText: 'Internal Server Error' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.get('/workflows')).rejects.toMatchObject({ status: 500, message: 'Internal Server Error' });
  });
});
