import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/**
 * A keyset cursor: the sort key of the last row on the previous page. The
 * next page asks for rows that sort after it, so it costs the same on page
 * 1 and page 1000, unlike OFFSET which reads and discards every earlier row.
 */
export interface ListingCursor {
  postedAt: Date;
  id: string;
}

const payloadSchema = z.object({ p: z.iso.datetime(), i: z.uuid() });

/** Base64url JSON: opaque to clients, so the format can change later. */
export function encodeCursor(cursor: ListingCursor): string {
  const payload = { p: cursor.postedAt.toISOString(), i: cursor.id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor(raw: string): ListingCursor {
  try {
    const json: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const { p, i } = payloadSchema.parse(json);
    return { postedAt: new Date(p), id: i };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}
