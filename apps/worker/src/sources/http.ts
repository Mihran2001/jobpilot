export type FetchFn = typeof fetch;

const USER_AGENT = 'JobPilot (personal job tracker)';
const DEFAULT_TIMEOUT_MS = 15_000;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`GET ${url} answered ${status}`);
    this.name = 'HttpError';
  }

  /** 429 and 5xx can succeed later; any other 4xx will fail the same way again. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

/**
 * GET a JSON document with a hard timeout. A timeout rejects with a
 * TimeoutError, which the job treats as retryable like any network error.
 */
export async function getJson(
  fetchFn: FetchFn,
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  const res = await fetchFn(url, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new HttpError(res.status, url);
  return res.json();
}
