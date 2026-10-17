import { z } from 'zod';
import type { StorageConfig } from './index.js';

/** The storage variables, shared by every app that touches object storage. */
export const storageEnvSchema = z.object({
  /** Unset for real AWS S3; http://localhost:9000 for local MinIO. */
  S3_ENDPOINT: z.url().optional(),
  /** Host the browser uses for presigned URLs; defaults to S3_ENDPOINT. */
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
  /** Create the bucket on start. Local development only. */
  S3_CREATE_BUCKET: z.stringbool().default(false),
});

export type StorageEnv = z.infer<typeof storageEnvSchema>;

export function storageConfigFromEnv(env: StorageEnv): StorageConfig {
  return {
    endpoint: env.S3_ENDPOINT,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    bucket: env.S3_BUCKET,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  };
}
