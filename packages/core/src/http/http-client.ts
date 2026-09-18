import type { IDataObject, IHttpRequestOptions, IHttpResponse } from '@runnel/workflow';

/**
 * The real HTTP client behind IExecuteFunctions.helpers.httpRequest, built on Node's global
 * fetch (no new HTTP-client dependency). Supports methods, headers, query string, JSON/text
 * bodies, redirect control, retries with backoff, and both parsed-body and full-response
 * shapes. `proxy` is accepted on IHttpRequestOptions for forward compatibility but not
 * wired to a dispatcher yet — routing fetch through a proxy needs the `undici` package's
 * ProxyAgent, which is a deliberate M5 scope cut, not an oversight.
 */
export interface IHttpClientOptions {
  /** Injectable delay for retry backoff — tests pass a no-op to stay fast. */
  sleep?: (ms: number) => Promise<void>;
}

export class HttpStatusError extends Error {
  constructor(
    public statusCode: number,
    public body: unknown,
  ) {
    super(`Request failed with status ${statusCode}`);
    this.name = 'HttpStatusError';
  }
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function buildUrl(url: string, qs?: IDataObject): string {
  if (!qs || Object.keys(qs).length === 0) return url;
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(qs)) {
    if (value !== undefined && value !== null) parsed.searchParams.set(key, String(value));
  }
  return parsed.toString();
}

function buildRequestHeaders(options: IHttpRequestOptions): Record<string, string> {
  const headers: Record<string, string> = { ...options.headers };
  const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === 'content-type');
  if (!hasContentType && typeof options.body === 'object' && options.body !== null) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

function buildBody(options: IHttpRequestOptions): string | undefined {
  if (options.body === undefined) return undefined;
  return typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
}

async function parseBody(response: Response, encoding: IHttpRequestOptions['encoding']): Promise<unknown> {
  if (encoding === 'arraybuffer') return Buffer.from(await response.arrayBuffer());
  if (encoding === 'text') return response.text();
  if (encoding === 'json') return response.json();

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const text = await response.text();
    return text.length > 0 ? (JSON.parse(text) as unknown) : undefined;
  }
  return response.text();
}

async function performRequest(options: IHttpRequestOptions): Promise<Response> {
  const controller = options.timeout ? new AbortController() : undefined;
  const timer = options.timeout ? setTimeout(() => controller!.abort(), options.timeout) : undefined;
  try {
    return await fetch(buildUrl(options.url, options.qs), {
      method: options.method ?? 'GET',
      headers: buildRequestHeaders(options),
      body: buildBody(options),
      redirect: options.followRedirect === false ? 'manual' : 'follow',
      signal: controller?.signal,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toHeaderRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

/**
 * A response is retried on a 5xx status or a network-level failure (fetch throwing — DNS,
 * connection refused, timeout/abort). A non-5xx error status is not retried: retrying a 404
 * or a 401 endlessly wouldn't help, and HttpStatusError carries the parsed body so a caller
 * (or a node's continueOnFail handling) can still inspect why it failed.
 */
export async function httpRequest(
  options: IHttpRequestOptions,
  clientOptions: IHttpClientOptions = {},
): Promise<unknown> {
  const sleep = clientOptions.sleep ?? defaultSleep;
  const maxRetries = options.retry?.maxRetries ?? 0;
  const retryDelayMs = options.retry?.retryDelayMs ?? 0;

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await performRequest(options);
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      await sleep(retryDelayMs);
      continue;
    }

    if (response.status >= 500 && attempt < maxRetries) {
      await sleep(retryDelayMs);
      continue;
    }

    const body = await parseBody(response, options.encoding);

    if (options.returnFullResponse) {
      return { statusCode: response.status, headers: toHeaderRecord(response.headers), body } satisfies IHttpResponse;
    }

    if (!response.ok) {
      throw new HttpStatusError(response.status, body);
    }

    return body;
  }
}
