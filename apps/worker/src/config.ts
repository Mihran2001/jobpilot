import { parseEnv } from '@jobpilot/shared';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Remotive asks for at most 4 requests a day, so 6 hours is the floor.
  FETCH_INTERVAL_HOURS: z.coerce.number().int().min(6).max(168).default(6),
  SCORE_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(10),
  // Bull Board, bound to 127.0.0.1 only. 0 turns it off.
  BULL_BOARD_PORT: z.coerce.number().int().min(0).max(65_535).default(3002),
});

export type WorkerConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return parseEnv(envSchema, env);
}
