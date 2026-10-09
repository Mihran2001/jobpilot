# JobPilot

A personal job-hunt command center: it aggregates remote job listings, scores them against a skill profile, tracks applications through their stages, generates a tailored CV PDF per listing, and exports application history as CSV.

This is a learning and portfolio project built in stages. **Current state: stage 1 (foundation).** There are no apps yet, only the workspace, the local infrastructure, and the database.

## Requirements

- Node 22.13 or newer (`.nvmrc` pins 22)
- pnpm 10 (`corepack enable` picks up the version pinned in `package.json`)
- Docker with Compose

## Run it

```bash
cp .env.example .env    # local-only values, safe defaults
pnpm install
pnpm infra:up           # Postgres, Redis, MinIO; returns when all are healthy
pnpm build              # generates the Prisma client, compiles packages
pnpm db:deploy          # applies migrations
pnpm db:seed            # sample data; safe to run repeatedly
```

Look at the data:

```bash
docker compose exec postgres psql -U jobpilot -d jobpilot
pnpm --filter @jobpilot/db studio
```

Stop everything with `pnpm infra:down`. Data lives in named Docker volumes and survives that; `docker compose down -v` deletes it.

| Service  | Host address     | Notes                                                                         |
| -------- | ---------------- | ----------------------------------------------------------------------------- |
| Postgres | `localhost:5434` | 5432 is left free for a locally installed Postgres                            |
| Redis    | `localhost:6379` | AOF persistence on, `noeviction` policy (required by BullMQ)                  |
| MinIO    | `localhost:9000` | S3 API. Web console on `localhost:9001`, login is the S3 key pair from `.env` |

## Layout

```
apps/               web, api, worker (from stage 2 on)
packages/
  shared/           Zod schemas and inferred types; no Node- or database-specific code
  db/               Prisma schema, migrations, seed, and the generated client
infra/docker/       Dockerfiles (stage 5b)
docker-compose.yml  local Postgres, Redis and MinIO
```

Dependencies point one way: `apps → db → shared`. `shared` must stay importable from the browser, so it never imports `db`.

## Everyday commands

| Command                           | What it does                                           |
| --------------------------------- | ------------------------------------------------------ |
| `pnpm build`                      | Build every package in dependency order                |
| `pnpm typecheck`                  | Typecheck every package                                |
| `pnpm lint` / `pnpm format`       | ESLint (type-aware) / Prettier                         |
| `pnpm db:migrate --name <change>` | Create and apply a migration from schema changes (dev) |
| `pnpm db:deploy`                  | Apply committed migrations only (CI, production)       |
| `pnpm db:seed`                    | Seed sample data                                       |
| `pnpm ignored-builds`             | Show dependency install scripts pnpm refused to run    |

## Decisions

- **pnpm workspaces, no Turborepo.** Two packages and three apps do not need a task cache. Revisit when CI time is measurable.
- **Packages are ESM compiled to `dist` with `tsc`.** Node 22 can `require()` ESM, so a CommonJS consumer still works.
- **TypeScript 6.0, not 7.** typescript-eslint supports TypeScript below 6.1 as of October 2026.
- **Prisma pinned to 7.x.** npm's `latest` tag currently points at an 8.0 release candidate.
- **Prisma lives in `packages/db`.** Prisma 7 generates the client into the source tree (`src/generated`, gitignored), so one package owns the schema and exports the client to every app.
- **The connection URL is in `prisma.config.ts`**, read from the root `.env`. `createPrismaClient()` takes the URL as an argument: library code never reads `process.env`.
- **Local S3 is MinIO from Chainguard's image, pinned by digest.** MinIO stopped publishing its own images and archived the repository; for a localhost-only dependency the frozen upstream is acceptable. Production uses AWS S3.
- **Scores are per user**: `listing_scores (user_id, job_listing_id)` rather than a column on `job_listings`, which is shared by all users.
- **UUIDv7 primary keys, `timestamptz` timestamps, snake_case tables and columns.**
- **No secondary indexes yet.** Each index is added with the query it serves and an `EXPLAIN ANALYZE` before and after. Postgres does not index foreign keys automatically.
- **Enums are declared twice** (Prisma schema and `packages/shared`) because the browser cannot import Prisma. `packages/db/src/enum-check.ts` fails the build if they differ.
- **The seeded user cannot log in.** Its password hash is a placeholder until stage 2 adds Argon2id.

The full brief, stage plan and conventions are in [CLAUDE.md](CLAUDE.md).
