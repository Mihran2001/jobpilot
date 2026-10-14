# JobPilot

A personal job-hunt command center: it aggregates remote job listings, scores them against a skill profile, tracks applications through their stages, generates a tailored CV PDF per listing, and exports application history as CSV.

This is a learning and portfolio project built in stages. **Current state: stage 2 (core API).** The NestJS API serves auth, listings and applications; the worker and web UI come in later stages.

## Requirements

- Node 24.15 or newer (`.nvmrc` pins 24; with nvm, `nvm use`)
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
pnpm dev:api            # API on http://localhost:3001/api, restarts on change
```

The seeded user is `dev@jobpilot.test` with the password from `SEED_USER_PASSWORD` in `.env`. Try it:

```bash
curl -c /tmp/jp.cookies -H 'content-type: application/json' \
  -d '{"email":"dev@jobpilot.test","password":"jobpilot-dev-password"}' \
  http://localhost:3001/api/auth/login
curl -b /tmp/jp.cookies 'http://localhost:3001/api/listings?limit=3'
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

## API

All routes are under `/api` and need a session cookie unless marked public.

| Method and path                  | What it does                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /health` (public)           | 200 if the database answers, 503 otherwise                                                                     |
| `POST /auth/register` (public)   | Create an account and start a session                                                                          |
| `POST /auth/login` (public)      | Start a session. Rate-limited per IP                                                                           |
| `POST /auth/logout`              | End this session                                                                                               |
| `GET /users/me`                  | The logged-in user                                                                                             |
| `GET /sources`                   | Listing sources                                                                                                |
| `GET /listings`                  | Newest first, keyset-paginated. Filters: `q`, `remote`, `minSalary`, `sourceId`, `minScore`; `limit`, `cursor` |
| `GET /listings/:id`              | One listing with its description and your score                                                                |
| `POST /applications`             | Save a listing as an application (status `SAVED`)                                                              |
| `GET /applications`              | Your applications plus a count per status; filter with `status`                                                |
| `GET /applications/:id`          | One application with its status history                                                                        |
| `PATCH /applications/:id/status` | Move to a new status; records an event in the same transaction                                                 |

Request and response shapes are the Zod schemas in `packages/shared`.

## Tests

`pnpm test` runs the API's integration tests against a separate `jobpilot_test` database (from `TEST_DATABASE_URL`). The test setup creates it if needed and applies migrations with `prisma migrate deploy`; every test starts from empty tables. Only third-party HTTP would ever be mocked.

## Layout

```
apps/
  api/              NestJS REST API: src/modules/<feature>/ (controller -> service -> repository)
                    web and worker arrive in later stages
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
| `pnpm test`                       | Integration tests against the test database            |
| `pnpm dev:api`                    | Run the API with restart on change                     |
| `pnpm lint` / `pnpm format`       | ESLint (type-aware) / Prettier                         |
| `pnpm db:migrate --name <change>` | Create and apply a migration from schema changes (dev) |
| `pnpm db:deploy`                  | Apply committed migrations only (CI, production)       |
| `pnpm db:seed`                    | Seed sample data                                       |
| `pnpm ignored-builds`             | Show dependency install scripts pnpm refused to run    |

## Decisions

- **pnpm workspaces, no Turborepo.** Two packages and three apps do not need a task cache. Revisit when CI time is measurable.
- **Packages are ESM compiled to `dist` with `tsc`.** Node 24 can `require()` ESM, so a CommonJS consumer still works.
- **TypeScript 6.0, not 7.** typescript-eslint supports TypeScript below 6.1 as of October 2026.
- **Prisma pinned to 7.x.** npm's `latest` tag currently points at an 8.0 release candidate.
- **Prisma lives in `packages/db`.** Prisma 7 generates the client into the source tree (`src/generated`, gitignored), so one package owns the schema and exports the client to every app.
- **The connection URL is in `prisma.config.ts`**, read from the root `.env`. `createPrismaClient()` takes the URL as an argument: library code never reads `process.env`.
- **Local S3 is MinIO from Chainguard's image, pinned by digest.** MinIO stopped publishing its own images and archived the repository; for a localhost-only dependency the frozen upstream is acceptable. Production uses AWS S3.
- **Scores are per user**: `listing_scores (user_id, job_listing_id)` rather than a column on `job_listings`, which is shared by all users.
- **UUIDv7 primary keys, `timestamptz` timestamps, snake_case tables and columns.**
- **Indexes are added only with evidence.** Each one comes with the query it serves and an `EXPLAIN ANALYZE` before and after; Postgres does not index foreign keys automatically. So far: `job_listings (posted_at DESC, id DESC)` for the listings feed, measured in [listings-feed.sql](packages/db/explain/listings-feed.sql).
- **Keyset pagination, written as a range.** The cursor condition is `posted_at <= x AND (posted_at < x OR id < y)`. The equivalent `posted_at < x OR (posted_at = x AND id < y)` cannot start the index scan at the cursor and was slower with the index than without it.
- **Enums are declared twice** (Prisma schema and `packages/shared`) because the browser cannot import Prisma. `packages/db/src/enum-check.ts` fails the build if they differ.
- **Sessions, not JWT.** A random 256-bit token in an `httpOnly`, `SameSite=Lax` cookie; Postgres stores only its SHA-256 hash. Logout and expiry take effect immediately. Every route needs a session unless it is marked `@Public()`.
- **Argon2id via `@node-rs/argon2`.** Prebuilt binaries, nothing to compile. Unknown emails still pay for one hash, so login timing does not reveal which accounts exist.
- **Validation with NestJS 12's built-in Standard Schema pipe** and the shared Zod schemas. Responses go through explicit mappers, never raw Prisma rows.
- **Ownership is part of every query** (`WHERE id = $1 AND user_id = $2`), so another user's data is a 404, indistinguishable from data that does not exist.
- **Status changes use optimistic concurrency.** The update only applies if the status is still the one just read; otherwise the API answers 409 rather than writing an event with a wrong `fromStatus`.
- **Login rate limit is in memory.** Correct for one API process; moves to Redis when there are replicas (stage 5b).

The full brief, stage plan and conventions are in [CLAUDE.md](CLAUDE.md).
