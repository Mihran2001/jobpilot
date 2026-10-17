import 'server-only';
import { parseEnv } from '@jobpilot/shared';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Where the Next.js server reaches the API. The browser never calls it. */
  API_INTERNAL_URL: z.url().default('http://localhost:3001'),
});

/** Validated once, on first use, on the server only. */
export const env = parseEnv(envSchema);
