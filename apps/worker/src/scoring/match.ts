// Term matching shared by scoring and CV tailoring.

/**
 * Lower-cases, turns "-", "_" and "/" into spaces, and drops dots inside
 * words, so "Full-Stack" matches "full stack" and "Node.js" matches "nodejs".
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-_/]/g, ' ')
    .replace(/\.(?=[a-z0-9])/g, '');
}

/** Whole-term match; "+" and "#" count as word characters so "C++" and "C#" work. */
export function containsTerm(text: string, term: string): boolean {
  if (!term) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#])${escaped}($|[^a-z0-9+#])`).test(text);
}
