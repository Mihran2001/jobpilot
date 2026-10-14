import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export interface CreatePrismaClientOptions {
  connectionString: string;
  /** Maximum connections in this process's pool. node-postgres defaults to 10. */
  maxConnections?: number;
}

/**
 * Builds a PrismaClient on top of a node-postgres pool.
 *
 * This package never reads process.env: each app validates its own
 * configuration at startup and passes the values in. Each process should
 * create one client and call `$disconnect()` on shutdown.
 */
export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: options.connectionString,
    max: options.maxConnections,
    // Prisma 7 leaves this at node-postgres's default of 0 (wait forever).
    // Fail after 5s instead of hanging when the database is unreachable.
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter });
}
