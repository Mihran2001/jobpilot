import type { CvVersion } from '@jobpilot/db';
import type { CvVersionResponse } from '@jobpilot/shared';

/** The storage key stays inside the API: clients only ever get presigned URLs. */
export function toCvVersionResponse(v: CvVersion): CvVersionResponse {
  return {
    id: v.id,
    applicationId: v.applicationId,
    source: v.source,
    status: v.status,
    fileName: v.fileName,
    sizeBytes: v.sizeBytes,
    error: v.error,
    createdAt: v.createdAt.toISOString(),
  };
}
