// BullMQ waits for Redis to be reachable, potentially forever, so every
// enqueue from a request is capped.

/** How long a request may wait for Redis before answering 503. */
export const ENQUEUE_TIMEOUT_MS = 3_000;

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}
