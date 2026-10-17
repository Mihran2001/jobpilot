import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';

export const PG_POOL = Symbol('PG_POOL');

/**
 * A small raw node-postgres pool, next to Prisma's, for the one thing Prisma
 * cannot do: stream rows through a server-side cursor (CSV export).
 * Queries on it are always parameterised ($1, $2, ...).
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new pg.Pool({
          connectionString: config.DATABASE_URL,
          max: 4, // each export holds one connection for its whole duration
          connectionTimeoutMillis: 5_000,
        }),
    },
  ],
  exports: [PG_POOL],
})
export class PgModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
