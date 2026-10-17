import type { FetchFn } from './http.js';
import { createJobicyAdapter } from './jobicy.js';
import { createRemotiveAdapter } from './remotive.js';
import type { SourceAdapter } from './types.js';

/**
 * Maps a sources.name to the code that understands that site. The URL to
 * fetch lives in the database row, so filters can change without a deploy.
 */
export function createAdapterRegistry(fetchFn: FetchFn): ReadonlyMap<string, SourceAdapter> {
  return new Map([
    ['remotive', createRemotiveAdapter(fetchFn)],
    ['jobicy', createJobicyAdapter(fetchFn)],
  ]);
}
