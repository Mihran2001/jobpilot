import type { ListingDetail, ListingsPage, ListingsQuery } from '@jobpilot/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from './listing-cursor.js';
import { toListingDetail, toListingSummary } from './listings.mapper.js';
import { ListingsRepository } from './listings.repository.js';

@Injectable()
export class ListingsService {
  constructor(private readonly listings: ListingsRepository) {}

  async getPage(userId: string, query: ListingsQuery): Promise<ListingsPage> {
    const { cursor, limit, ...filters } = query;
    // One extra row tells us whether another page exists, without a COUNT(*).
    const rows = await this.listings.findPage({
      userId,
      filters,
      after: cursor ? decodeCursor(cursor) : undefined,
      take: limit + 1,
    });

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toListingSummary),
      nextCursor:
        rows.length > limit && last ? encodeCursor({ postedAt: last.postedAt, id: last.id }) : null,
    };
  }

  async getById(userId: string, id: string): Promise<ListingDetail> {
    const row = await this.listings.findById(id, userId);
    if (!row) throw new NotFoundException('Listing not found');
    return toListingDetail(row);
  }
}
