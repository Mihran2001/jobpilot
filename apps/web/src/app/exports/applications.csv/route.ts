import { apiRequest } from '@/lib/api';

/**
 * Passes the API's CSV stream straight through: the body is never buffered
 * here, so memory stays flat however long the history is.
 */
export async function GET() {
  const res = await apiRequest('/exports/applications.csv');
  return new Response(res.body, {
    headers: {
      'content-type': res.headers.get('content-type') ?? 'text/csv; charset=utf-8',
      'content-disposition':
        res.headers.get('content-disposition') ?? 'attachment; filename="applications.csv"',
    },
  });
}
