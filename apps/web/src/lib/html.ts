/**
 * Listing descriptions are HTML from third-party sites. Instead of injecting
 * that HTML (dangerouslySetInnerHTML would need a sanitiser), it is reduced
 * to plain text blocks that React renders as text, so nothing in it can run.
 */
export type Block = { kind: 'paragraph'; text: string } | { kind: 'bullet'; text: string };

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, e: string) => {
    if (/^#x/i.test(e)) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? match;
  });
}

export function htmlToBlocks(html: string): Block[] {
  const marked = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/ul|\/ol)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  return decode(marked)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && line !== '•')
    .map((line) =>
      line.startsWith('• ')
        ? { kind: 'bullet' as const, text: line.slice(2) }
        : { kind: 'paragraph' as const, text: line },
    );
}
