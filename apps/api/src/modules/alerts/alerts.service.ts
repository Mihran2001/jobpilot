import {
  savedSearchFiltersSchema,
  type AlertsSummary,
  type CreateSavedSearchInput,
  type SavedSearchResponse,
  type SearchMatch,
} from '@jobpilot/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { toListingSummary } from '../listings/listings.mapper.js';
import { AlertsRepository } from './alerts.repository.js';

/** A per-user quota: saved searches are re-checked on every scoring. */
export const MAX_SAVED_SEARCHES = 20;

@Injectable()
export class AlertsService {
  constructor(private readonly alerts: AlertsRepository) {}

  async create(userId: string, input: CreateSavedSearchInput): Promise<SavedSearchResponse> {
    if ((await this.alerts.countForUser(userId)) >= MAX_SAVED_SEARCHES) {
      throw new ConflictException(`You can keep at most ${MAX_SAVED_SEARCHES} saved searches`);
    }
    const row = await this.alerts.create(userId, input.name, input.filters);
    return {
      id: row.id,
      name: row.name,
      filters: input.filters,
      createdAt: row.createdAt.toISOString(),
      newMatches: 0,
    };
  }

  async list(userId: string): Promise<SavedSearchResponse[]> {
    const rows = await this.alerts.listForUser(userId);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      // Stored JSON is re-validated on the way out; a bad row shows no filters.
      filters: savedSearchFiltersSchema.catch({}).parse(row.filters),
      createdAt: row.createdAt.toISOString(),
      newMatches: row._count.matches,
    }));
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.alerts.deleteOwned(id, userId)))
      throw new NotFoundException('Saved search not found');
  }

  async matches(userId: string, id: string): Promise<SearchMatch[]> {
    if (!(await this.alerts.findOwned(id, userId)))
      throw new NotFoundException('Saved search not found');
    const rows = await this.alerts.matches(id, userId);
    return rows.map((m) => ({
      listing: toListingSummary(m.jobListing),
      matchedAt: m.createdAt.toISOString(),
      seen: m.seenAt !== null,
    }));
  }

  async markSeen(userId: string, id: string): Promise<{ marked: number }> {
    if (!(await this.alerts.findOwned(id, userId)))
      throw new NotFoundException('Saved search not found');
    return { marked: await this.alerts.markSeen(id, userId) };
  }

  async summary(userId: string): Promise<AlertsSummary> {
    return { unseen: await this.alerts.unseenForUser(userId) };
  }
}
