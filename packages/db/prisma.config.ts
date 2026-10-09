import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// One .env for the whole repo, at the root. In containers and CI the variables
// are already set and the file does not exist, which is fine.
config({ path: path.join(import.meta.dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Not env('DATABASE_URL'): that helper throws when the variable is missing,
    // and `prisma generate` (which never connects) must work without a database.
    url: process.env.DATABASE_URL ?? '',
  },
});
