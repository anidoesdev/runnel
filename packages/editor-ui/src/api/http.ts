/**
 * A thin fetch wrapper, not a generated client: the backend is small enough (packages/cli's
 * REST controllers) that hand-typing each call's request/response shape is cheaper than
 * introducing codegen. `credentials: 'include'` sends the httpOnly session cookie set by
 * /rest/auth/login; there's no Authorization header to manage.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface IErrorBody {
  message?: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/rest${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  const body: unknown = contentType.includes('application/json') ? await res.json() : undefined;

  if (!res.ok) {
    const message = body && typeof body === 'object' && 'message' in body ? String((body as IErrorBody).message) : res.statusText;
    throw new ApiError(res.status, message);
  }

  return body as T;
}

function withBody(method: string, body?: unknown): RequestInit {
  return { method, body: body === undefined ? undefined : JSON.stringify(body) };
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, withBody('POST', body)),
  patch: <T>(path: string, body?: unknown): Promise<T> => request<T>(path, withBody('PATCH', body)),
  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
};
