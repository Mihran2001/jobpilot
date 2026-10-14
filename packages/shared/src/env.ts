import { z } from 'zod';

/**
 * Validates environment variables against a schema once, at process start.
 * Throws with every problem listed, so a misconfigured process dies
 * immediately instead of failing on the first request that needs the value.
 */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  env: Record<string, string | undefined> = process.env,
): z.infer<T> {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
