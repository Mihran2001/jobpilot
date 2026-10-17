import type { Readable, Transform } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { stringify } from 'csv-stringify';
import { ExportsRepository, type HistoryRow } from './exports.repository.js';

const COLUMNS: (keyof HistoryRow)[] = [
  'application_id',
  'listing_title',
  'company',
  'source',
  'listing_url',
  'current_status',
  'applied_at',
  'event_at',
  'from_status',
  'to_status',
  'note',
];

/**
 * Spreadsheet apps run a cell that starts with = + - @ (or a tab/CR) as a
 * formula. Text in this export comes from job sites and from the user, so
 * such cells get a leading apostrophe ("CSV injection").
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

@Injectable()
export class ExportsService {
  constructor(private readonly exportsRepo: ExportsRepository) {}

  async applicationHistory(userId: string): Promise<{ rows: Readable; toCsv: () => Transform }> {
    return {
      rows: await this.exportsRepo.streamHistory(userId),
      toCsv: () =>
        stringify({
          header: true,
          columns: COLUMNS,
          cast: {
            date: (d) => d.toISOString(),
            string: (s) => neutralizeFormula(s),
          },
        }),
    };
  }
}
