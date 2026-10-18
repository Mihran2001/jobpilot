import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StorageConfig {
  /** Where the API and worker reach storage. Unset for real AWS S3. */
  endpoint?: string;
  /**
   * Where browsers reach storage; presigned URLs are signed for this host.
   * Differs from `endpoint` inside Kubernetes (service name vs public URL).
   */
  publicEndpoint?: string;
  region: string;
  /** Static keys (MinIO). Undefined: the SDK's default chain, e.g. an IAM role. */
  credentials?: { accessKeyId: string; secretAccessKey: string };
  bucket: string;
  /** MinIO needs path-style URLs (http://host/bucket/key). */
  forcePathStyle: boolean;
}

export interface PresignedRequest {
  url: string;
  expiresAt: string;
}

export interface PresignedUpload extends PresignedRequest {
  method: 'PUT';
  headers: Record<string, string>;
}

export interface ObjectInfo {
  sizeBytes: number;
  contentType: string | undefined;
}

export interface Storage {
  readonly bucket: string;
  putObject(key: string, body: Uint8Array, contentType: string): Promise<void>;
  headObject(key: string): Promise<ObjectInfo | null>;
  /** The first `length` bytes of an object (a ranged GET), e.g. to check a file signature. */
  readPrefix(key: string, length: number): Promise<Uint8Array>;
  presignDownload(
    key: string,
    fileName: string,
    expiresInSeconds?: number,
  ): Promise<PresignedRequest>;
  presignUpload(
    key: string,
    file: { contentType: string; sizeBytes: number },
    expiresInSeconds?: number,
  ): Promise<PresignedUpload>;
  /** Deletes every object whose key starts with `prefix`; returns how many. */
  deletePrefix(prefix: string): Promise<number>;
  /** Creates the bucket if missing. For local development and tests only. */
  ensureBucket(): Promise<void>;
  destroy(): void;
}

const DEFAULT_EXPIRY_SECONDS = 5 * 60;

function createClient(config: StorageConfig, endpoint: string | undefined): S3Client {
  return new S3Client({
    endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: config.credentials,
    // Every network call gets a timeout. The SDK also retries (3 attempts by
    // default), which is safe here: every call is idempotent.
    requestHandler: { connectionTimeout: 3_000, requestTimeout: 15_000 },
  });
}

const expiry = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

export function createStorage(config: StorageConfig): Storage {
  const client = createClient(config, config.endpoint);
  // Presigning is pure computation (no network): it only needs the host the
  // browser will use.
  const publicClient = createClient(config, config.publicEndpoint ?? config.endpoint);
  const { bucket } = config;

  return {
    bucket,

    async putObject(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },

    async headObject(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { sizeBytes: head.ContentLength ?? 0, contentType: head.ContentType };
      } catch (err) {
        if (err instanceof NotFound) return null;
        if (err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404) return null;
        throw err;
      }
    },

    async readPrefix(key, length) {
      const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${length - 1}` }),
      );
      return (await res.Body?.transformToByteArray()) ?? new Uint8Array();
    },

    async presignDownload(key, fileName, expiresInSeconds = DEFAULT_EXPIRY_SECONDS) {
      const url = await getSignedUrl(
        publicClient,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          // Makes the browser save the file under a readable name.
          ResponseContentDisposition: `attachment; filename="${fileName.replace(/["\\\r\n]/g, '')}"`,
        }),
        { expiresIn: expiresInSeconds },
      );
      return { url, expiresAt: expiry(expiresInSeconds) };
    },

    async presignUpload(key, file, expiresInSeconds = DEFAULT_EXPIRY_SECONDS) {
      const url = await getSignedUrl(
        publicClient,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: file.contentType,
          ContentLength: file.sizeBytes,
        }),
        {
          expiresIn: expiresInSeconds,
          // Content-Type and Content-Length become part of the signature: a
          // different type or size than the API approved is rejected by storage.
          signableHeaders: new Set(['content-type', 'content-length']),
          unhoistableHeaders: new Set(['content-type', 'content-length']),
        },
      );
      return {
        method: 'PUT',
        url,
        expiresAt: expiry(expiresInSeconds),
        headers: { 'content-type': file.contentType, 'content-length': String(file.sizeBytes) },
      };
    },

    async deletePrefix(prefix) {
      if (!prefix.endsWith('/'))
        throw new Error('deletePrefix needs a "folder" prefix ending in /');
      let deleted = 0;
      let token: string | undefined;
      do {
        // At most 1,000 keys per page, which is also DeleteObjects' limit.
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
        );
        const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
        if (keys.length > 0) {
          await client.send(
            new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }),
          );
          deleted += keys.length;
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return deleted;
    },

    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    },

    destroy() {
      client.destroy();
      publicClient.destroy();
    },
  };
}
export * from './env.js';
