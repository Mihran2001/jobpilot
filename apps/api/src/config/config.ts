import { parseEnv } from '@jobpilot/shared';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z.url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type AppConfig = z.infer<typeof envSchema>;

/** Injection token for the validated config object. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/** Validates the environment. Called once, in main.ts, before Nest starts. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return parseEnv(envSchema, env);
}
