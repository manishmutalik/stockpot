/**
 * apiClient.ts
 *
 * Thin wrapper around fetch() for calling our own /api/* routes.
 *
 * The server (see server.ts, lib/auth.ts, lib/csrf.ts) now requires:
 *  - A Firebase ID token on every request, as `Authorization: Bearer <token>`.
 *  - An `X-CSRF-Token` header matching the `csrf_token` cookie on every
 *    state-changing (non-GET) request.
 *
 * This helper takes care of both so call sites (e.g. useIntegrations) don't
 * have to think about it.
 */
import { auth } from '../firebase';

let cachedCsrfToken: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken;
  const res = await fetch('/api/session/csrf');
  if (!res.ok) throw new Error('Failed to obtain CSRF token');
  const data = await res.json();
  cachedCsrfToken = data.csrfToken;
  return cachedCsrfToken!;
}

/**
 * Fetch wrapper that attaches the current Firebase user's ID token and,
 * for non-GET requests, a valid CSRF token. Use this for every call to our
 * own /api/* routes.
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);

  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    headers.set('Authorization', `Bearer ${token}`);
  }

  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const csrfToken = await getCsrfToken();
    headers.set('X-CSRF-Token', csrfToken);
  }

  return fetch(url, { ...options, headers, credentials: 'include' });
}
