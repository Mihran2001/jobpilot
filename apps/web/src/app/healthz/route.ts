/**
 * Kubernetes probes. Deliberately does not call the API: if the API is down
 * the web pods are still alive and should keep serving the login page.
 */
export function GET() {
  return Response.json({ status: 'ok' });
}
