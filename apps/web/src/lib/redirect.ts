/**
 * Where to go after login. Only same-site paths are allowed: otherwise a
 * crafted link like /login?next=https://evil.example would send a freshly
 * signed-in user to another site (an "open redirect").
 */
export function safeNextPath(value: unknown, fallback = '/listings'): string {
  if (typeof value !== 'string') return fallback;
  // "//evil.example" and "/\\evil.example" are treated by browsers as other hosts.
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}
