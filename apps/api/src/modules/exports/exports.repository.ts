import type { Readable } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import QueryStream from 'pg-query-stream';
import { PG_POOL } from '../../infra/pg/pg.module.js';

export interface HistoryRow {
  application_id: string;
  listing_title: string;
  company: string;
  source: string;
  listing_url: string;
  current_status: string;
  applied_at: Date | null;
  event_at: Date;
  from_status: string | null;
  to_status: string;
  note: string | null;
}

// One row per status change. $1 is a bind parameter: the user id is never
// part of the SQL text.
const HISTORY_SQL = `
  SELECT a.id          AS application_id,
         l.title       AS listing_title,
         c.name        AS company,
         s.name        AS source,
         l.url         AS listing_url,
         a.status      AS current_status,
         a.applied_at,
         e.created_at  AS event_at,
         e.from_status,
         e.to_status,
         e.note
  FROM application_events e
  JOIN applications a ON a.id = e.application_id
  JOIN job_listings l ON l.id = a.job_listing_id
  JOIN companies c    ON c.id = l.company_id
  JOIN sources s      ON s.id = l.source_id
  WHERE a.user_id = $1
  ORDER BY a.created_at, a.id, e.created_at, e.id`;

@Injectable()
export class ExportsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  /**
   * Streams rows through a server-side cursor: Postgres hands them over
   * `batchSize` at a time, and the next batch is only fetched when the
   * consumer (ultimately the HTTP response) has room for it. Memory stays at
   * about one batch, however many rows there are.
   */
  async streamHistory(userId: string): Promise<Readable> {
    const client = await this.pool.connect();
    const rows = client.query(new QueryStream(HISTORY_SQL, [userId], { batchSize: 500 }));

    // Return the connection exactly once: on success, error, or the client
    // going away mid-download (pipeline destroys the stream; 'close' fires).
    let released = false;
    const release = (err?: Error) => {
      if (released) return;
      released = true;
      client.release(err);
    };
    rows.once('error', release);
    rows.once('close', () => release());
    return rows;
  }
}
