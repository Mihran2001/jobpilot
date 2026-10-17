import { presignedUrlSchema } from '@jobpilot/shared';
import { NextResponse } from 'next/server';
import { ApiError, api } from '@/lib/api';

/**
 * Asks the API for a 5-minute storage URL and sends the browser there. The
 * PDF itself is served by storage, never by this server or the API.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<'/cv-versions/[id]/download'>,
) {
  const { id } = await params;
  try {
    const link = await api(`/cv-versions/${encodeURIComponent(id)}/download`, presignedUrlSchema);
    return NextResponse.redirect(link.url);
  } catch (err) {
    if (err instanceof ApiError) return new NextResponse(err.message, { status: err.status });
    throw err;
  }
}
