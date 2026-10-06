/**
 * api.ts
 *
 * Talking to the Stockpot server's phone endpoints (`/api/mobile/*`). A plain function over `fetch`, with the base address
 * and the sign-in token passed in, so it is tested without a phone. Every failure becomes an `ApiError` the screens can show:
 * `status` 0 means the phone could not reach the server at all.
 */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public body?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiDeps {
  /** The server's address, such as https://stockpot.example.com (a trailing slash is ignored). */
  baseUrl: string;
  /** The signed-in owner's Firebase ID token, or null when nobody is signed in. */
  getToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  /** How long to wait for an answer, in milliseconds. */
  timeoutMs?: number;
}

export interface Api {
  get<T>(path: string): Promise<T>;
  /** Saves need an idempotency key: a fresh unique id for each tap of Save, kept for a retry of the same save. */
  post<T>(path: string, body?: unknown, opts?: { idempotencyKey?: string }): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
}

export const DEFAULT_TIMEOUT_MS = 20_000;

export function createApi(deps: ApiDeps): Api {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const doFetch = deps.fetchImpl ?? fetch;

  async function request<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const token = await deps.getToken();
    if (!token) throw new ApiError(401, 'not_signed_in', 'Please sign in again.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch (err: any) {
      throw new ApiError(0, err?.name === 'AbortError' ? 'timeout' : 'offline', 'No connection.');
    } finally {
      clearTimeout(timer);
    }

    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      throw new ApiError(res.status, typeof json?.code === 'string' ? json.code : 'error', typeof json?.error === 'string' ? json.error : 'Something went wrong.', json);
    }
    return json as T;
  }

  return {
    get: path => request('GET', path),
    post: (path, body, opts) => request('POST', path, body ?? {}, opts?.idempotencyKey),
    put: (path, body) => request('PUT', path, body),
  };
}

/** What to tell the owner about a failed request. */
export function describeApiError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (err.status === 0) return 'No connection. Check your internet and try again.';
  if (err.status === 401) return 'Please sign in again.';
  if (err.status === 402) return 'Your Stockpot plan has ended or has not started. Manage it from your account on the Stockpot website.';
  if (err.status === 403 && err.code === 'demo_account') return 'This is not available in the demo kitchen.';
  if (err.status >= 500) return 'Stockpot had a problem. Please try again in a moment.';
  return err.message || 'Something went wrong. Please try again.';
}
