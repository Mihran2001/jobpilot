import 'server-only';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { env } from './env';
import { SESSION_COOKIE } from './session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/**
 * The only way the web app talks to the API. Runs on the server: forwards the
 * session cookie, tags the request with an id that shows up in the API's
 * logs, and turns a 401 into a redirect to the login page.
 */
export async function apiRequest(path: string, req: ApiRequest = {}): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-request-id': `web-${randomUUID()}`,
  };
  if (token) headers.cookie = `${SESSION_COOKIE}=${token}`;
  if (req.body !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(`${env.API_INTERNAL_URL}/api${path}`, {
    method: req.method ?? 'GET',
    headers,
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000), // every outbound call has a timeout
  });

  if (res.status === 401) redirect('/login');
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join('; ')
      : typeof body?.message === 'string'
        ? body.message
        : `API answered ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return res;
}

/** GET/POST/... and validate the JSON with a shared schema: the API's contract, checked. */
export async function api<S extends z.ZodType>(
  path: string,
  schema: S,
  req: ApiRequest = {},
): Promise<z.infer<S>> {
  const res = await apiRequest(path, req);
  return schema.parse(await res.json());
}

/** For endpoints that answer 204 or whose body we do not need. */
export async function apiVoid(path: string, req: ApiRequest = {}): Promise<void> {
  await apiRequest(path, req);
}

/** Turns an ApiError into a message for a form; rethrows anything else (redirects included). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  throw err;
}
