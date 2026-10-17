import type { SourceResponse } from '@jobpilot/shared';
import { Injectable } from '@nestjs/common';
import { SourcesRepository } from './sources.repository.js';

/**
 * Read-only for now: sources are shared by all users, so changing them is an
 * admin action, and there is no admin role yet.
 */
@Injectable()
export class SourcesService {
  constructor(private readonly sources: SourcesRepository) {}

  async list(): Promise<SourceResponse[]> {
    const rows = await this.sources.findAll();
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      url: s.url,
      enabled: s.enabled,
      lastFetchedAt: s.lastFetchedAt?.toISOString() ?? null,
    }));
  }
}
