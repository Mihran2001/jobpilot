import { parseEnv } from '@jobpilot/shared';
import { storageEnvSchema } from '@jobpilot/storage';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    DATABASE_URL: z.url(),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    // Login and register attempts allowed per client IP per minute.
    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(5),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    REDIS_URL: z.url(),
    /** BullMQ key prefix. Tests use a unique one so they never see real jobs. */
    BULLMQ_PREFIX: z.string().min(1).default('bull'),
  })
  .extend(storageEnvSchema.shape);

export type AppConfig = z.infer<typeof envSchema>;

/** Injection token for the validated config object. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/** Validates the environment. Called once, in main.ts, before Nest starts. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return parseEnv(envSchema, env);
}
