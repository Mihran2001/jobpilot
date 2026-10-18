import { parseEnv } from '@jobpilot/shared';
import { storageEnvSchema } from '@jobpilot/storage';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SCORE_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(10),
    // HTTP port for Kubernetes probes (/live, /ready). 0 turns it off.
    WORKER_HEALTH_PORT: z.coerce.number().int().min(0).max(65_535).default(0),
    // Bull Board, bound to 127.0.0.1 only. 0 turns it off.
    BULL_BOARD_PORT: z.coerce.number().int().min(0).max(65_535).default(3002),
    // Headless Chrome for CV PDFs: your Chrome locally, chromium in Docker.
    CHROME_PATH: z.string().min(1),
    CHROME_NO_SANDBOX: z.stringbool().default(false),
    CV_RENDER_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
    // Chrome is memory-hungry: a few PDFs at a time.
    CV_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  })
  .extend(storageEnvSchema.shape);

export type WorkerConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return parseEnv(envSchema, env);
}
