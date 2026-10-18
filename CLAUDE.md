# JobPilot — Project Brief for Claude Code

This file is the standing brief for every Claude Code session in this repo. Section 9 records decisions made after the original brief; where they differ from earlier sections, section 9 wins.

## 1. Who I am and how I want you to work

I'm a frontend developer (5–6 years of React/Next.js) moving into full-stack Node.js backend work. I have already studied and practiced: the Node event loop, streams, Express, layered architecture, dependency injection, SQL (JOIN, GROUP BY, indexes, transactions), Prisma with real migrations and transactions, sessions vs JWT, caching and queues, and the basics of NestJS.

This project is for learning and for my portfolio. The code matters less than my understanding of it. So:

- **Teach as you build.** Before writing a non-trivial piece, say in 2–4 sentences what you are about to do and why. After it, tell me what I should be able to explain about it.
- **Work in small stages.** Do one stage at a time (see section 6). Stop at the end of each stage and wait for me to review and say "next". Never start the next stage on your own.
- **Ask before big decisions** (libraries, architecture changes, schema changes). Give me 2–3 options with tradeoffs and a recommendation.
- **Don't add technology for show.** If something (for example `worker_threads`) is not justified by a measured need, tell me instead of adding it. If I ask for something that is a bad idea, say so and explain.
- **Verify versions against current docs.** Prisma 7, NestJS, and Next.js have all changed recently. Do not rely on memory for setup steps. Check the official docs for the installed version.
- **Leave me tasks.** For each stage, add 2–3 small things to implement or break myself to `docs/TASKS.md` (for example "add an index and check the query plan", "kill the worker mid-job and see what happens"). I do them together at the end, so keep each task self-contained with exact files and commands.
- Keep explanations concrete: trace real examples with our actual data instead of abstract descriptions.

## 2. What we are building

JobPilot is a personal job-hunt command center:

- Aggregates remote job listings from public sources on a schedule.
- Scores each listing against my skill profile.
- Tracks my applications through stages (saved, applied, interview, offer, rejected) with notes and history.
- Generates a tailored CV PDF for a given listing.
- Exports my application history as CSV.

It is a single-user app first (me), but the code should have real auth and be written so multi-user would be a small change.

## 3. Tech stack

| Area          | Choice                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------- |
| Frontend      | Next.js (App Router), TypeScript, Tailwind. Everything goes through the API (see decisions log)     |
| API           | NestJS (TypeScript): modules, controllers, services, guards, DTO validation, exception filters      |
| Worker        | Separate Node process using BullMQ (plain Node or a Nest standalone app, to be proposed in stage 3) |
| Database      | PostgreSQL via Prisma 7 (driver adapter `@prisma/adapter-pg`, connection URL in `prisma.config.ts`) |
| Queue/cache   | Redis (BullMQ)                                                                                      |
| Files         | S3-compatible storage. Local server in Docker Compose, AWS S3 later                                 |
| Containers    | Docker, Docker Compose for local dev                                                                |
| Orchestration | Kubernetes (kind or minikube locally first)                                                         |
| Cloud         | AWS, introduced only in stage 6                                                                     |
| Shared        | `packages/shared` with Zod schemas and inferred types used by web and api                           |

Local environment: macOS, Node 24 LTS (installed with nvm; `.nvmrc` pins 24), Postgres.app installed locally on port 5432. The project database runs in Docker Compose on host port 5434.

## 4. Architecture

```
jobpilot/
  apps/
    web/        Next.js dashboard
    api/        NestJS REST API
    worker/     BullMQ workers (fetch, score, cv)
  packages/
    shared/     Zod schemas + types
    db/         Prisma schema, migrations, generated client (used by api, worker, web)
  infra/
    docker/     Dockerfiles
    k8s/        manifests (stage 5b)
  docker-compose.yml
```

Request flow: browser → Next.js → NestJS API → Postgres/Redis. The only exception is Server Components reading shared, non-user-scoped data (listings) straight from Postgres. The API never does heavy work itself; it enqueues jobs. The worker consumes jobs.

Queues (BullMQ):

- `fetch-source`: repeatable job per source. Fetches listings and upserts them. Must be idempotent.
- `score-listing`: scores one listing against a user's skills.
- `generate-cv`: produces a PDF and uploads it to S3.

Where the Node concepts are used (only where justified):

- Queues and workers: ingestion, scoring, CV generation (the API must stay responsive).
- `worker_threads`: scoring, only if measurements show it blocks the event loop. Measure event loop lag first and report the numbers to me.
- `child_process`: CV PDF generation by running headless Chromium or LibreOffice as a separate program.
- Streams: CSV export of application history using `pipeline` and a database cursor, so memory stays flat.
- Graceful shutdown in api and worker (SIGTERM handling, finish current job, close pools).

## 5. Data model

The schema of record is `packages/db/prisma/schema.prisma`. Propose changes before applying them.

```
User             id, email (unique), passwordHash, createdAt
SkillProfile     id, userId (unique), skills String[], preferredRoles String[], minSalary Int?
Source           id, name (unique), kind (API | RSS), url, enabled, lastFetchedAt?
Company          id, name (unique)
JobListing       id, sourceId, externalId, companyId, title, description,
                 url, location, remote Boolean, salaryMin Int?, salaryMax Int?,
                 postedAt, createdAt
                 UNIQUE (sourceId, externalId)
ListingScore     userId, jobListingId, score Int, scoredAt
                 PRIMARY KEY (userId, jobListingId)
Application      id, userId, jobListingId, status, appliedAt?, notes?, createdAt
                 UNIQUE (userId, jobListingId)
ApplicationEvent id, applicationId, fromStatus?, toStatus, note?, createdAt
CvVersion        id, userId, applicationId?, s3Key, createdAt
```

Index decisions are part of the exercise. For each index, I want you to show me the query it serves and the `EXPLAIN ANALYZE` before and after. Until then the schema has only the indexes that primary keys and unique constraints create.

## 6. Stages

Stop after each stage. Each has acceptance criteria that I will check.

### Stage 1: Foundation

- Monorepo setup, TypeScript config, lint, `packages/shared`.
- Docker Compose with Postgres, Redis, and S3-compatible storage.
- Prisma 7 schema and first migration. Seed script.
- **Done when:** `docker compose up` starts the dependencies, migrations apply cleanly, and the seed script fills the database.

### Stage 2: Core API (NestJS)

- Modules: auth, users, sources, listings, applications.
- Auth: register/login with Argon2id password hashing; sessions or short-lived JWT plus refresh token (propose one, explain why).
- DTO validation using shared Zod schemas; a global exception filter that maps Prisma errors (P2002, P2025) to clean HTTP errors.
- Listings endpoint with cursor pagination and filters.
- Applications: create, change status (writes an ApplicationEvent in the same transaction), list with counts.
- Every resource-by-id endpoint checks ownership. Add tests proving user A cannot read user B's application (expects 404).
- **Done when:** integration tests pass against a real test database and I can walk through every layer.

### Stage 3: The pipeline (worker)

- BullMQ setup, separate worker process, graceful shutdown.
- `fetch-source` for 2 public sources (propose candidates, check each one's terms and attribution requirements first; no scraping of sites that forbid it).
- Idempotent upserts via the unique constraint. Retries with exponential backoff. Failed jobs visible somewhere.
- `score-listing`: simple keyword/skill matching. Measure event loop lag under a bulk run and tell me whether `worker_threads` is justified. If yes, add them with a small pool.
- **Done when:** running the fetch twice creates no duplicates, and killing the worker mid-job loses nothing.

### Stage 4: CV generation and files

- Presigned S3 upload/download URLs; files never pass through the API process.
- `generate-cv` job renders an HTML template with listing-specific content and produces a PDF through a child process. Handle timeouts, exit codes, and stderr.
- CSV export of application history using streams and a DB cursor.
- **Done when:** a PDF appears for a listing, and exporting 100k seeded rows keeps memory flat.

### Stage 5a: Web UI

- Next.js: login, listings (cursor pagination, filters, score), application pipeline board, CV download.
- **Done when:** every flow above works in the browser against the local stack.

### Stage 5b: Containers and Kubernetes

- Dockerfiles for web, api, worker (multi-stage, non-root user, frozen lockfile install, proper signal handling).
- Local Kubernetes (kind/minikube): Deployments for web/api/worker, Services, Ingress, a Secret and ConfigMap, a CronJob for scheduled fetching, readiness and liveness probes, and a migration Job.
- Only one scheduler may trigger `fetch-source`: decide here between the CronJob enqueuing and the BullMQ repeatable job, and remove the other.
- **Done when:** the whole app runs in the local cluster, and rolling out a new api version causes no dropped requests.

### Stage 6: AWS

- Push images to ECR, use real S3, run the database on RDS or a small managed Postgres. Redis also needs a home; include it in the cost estimate.
- Propose the cheapest reasonable way to run the containers for a learning project (for example a small EC2 with k3s, or ECS). Tell me the cost before creating any resource, and list how to tear everything down.
- GitHub Actions CI: typecheck, lint, tests against a service container, build images.
- **Done when:** the app is reachable on a public URL and CI is green.

### Stage 7 (optional, later): Multi-user

- `score-listing` runs per user and listing (the `ListingScore` table already exists).
- Registration + onboarding form for skills and requirements; per-user filters and alerts.
- Rate limits, per-user quotas, privacy/data-deletion basics, source attribution.
- **Done when:** two test users with different skill profiles see different scores for the same listings, and neither can read the other's data.
- Do NOT build this earlier. In stages 1–6, just avoid assumptions that would block it (always scope by `userId`, never hard-code "the one user", keep listings shared and scoring/applications per-user in the API design).

## 7. Conventions and rules

- Repository: one monorepo (pnpm workspaces), one branch per stage merged via pull request into `main`. Keep a README current with run instructions, architecture and decisions.
- TypeScript strict mode, `noUncheckedIndexedAccess` on.
- Feature-first folders in the API (`modules/<feature>/`), controller → service → repository. Services never import Express/Nest request types.
- Validate all external input at the boundary. Never return Prisma entities directly; use explicit DTO mappers (no password hashes ever leave the API).
- Config: validate environment variables once at startup with Zod and fail fast. Never commit `.env`; keep `.env.example` current.
- All outbound HTTP calls have timeouts. Retries only for idempotent operations.
- Structured logging with Pino, with a request id on every log line, and secrets redacted.
- Git: small commits with clear messages, one branch per stage. Don't commit generated files or secrets.
- Tests: integration tests against a real Postgres for anything touching the database. Mock only third-party HTTP.
- Security: parameterized queries only; no `$queryRawUnsafe` with user input; rate-limit login.
- Don't create cloud resources, spend money, or run destructive commands without asking me first.

## 8. Commands

```
pnpm install          install all workspaces
pnpm infra:up         start Postgres, Redis and object storage (waits until healthy)
pnpm infra:down       stop them (data volumes are kept)
pnpm db:migrate       create/apply migrations in development
pnpm db:deploy        apply existing migrations only (CI, production)
pnpm db:seed          fill the database with sample data (safe to re-run)
pnpm build            build every package in dependency order
pnpm typecheck        typecheck every package
pnpm lint             ESLint over the whole repo
```

## 9. Decisions log

- **Monorepo tooling:** pnpm workspaces only. Turborepo is reconsidered in stage 6 if CI time shows a need.
- **Web data access:** Server Components may read only shared data (listings) directly. Anything user-scoped goes through the API so ownership checks live in one place.
- **Scores:** `ListingScore(userId, jobListingId)` from the start instead of `JobListing.score`.
- **Prisma location:** `packages/db` owns the schema, migrations and generated client; apps import `@jobpilot/db`.
- **Stage 5 split** into 5a (web UI) and 5b (containers and Kubernetes).
- **Packages are ESM** and compile to `dist` with `tsc`.
- **TypeScript 6.0.x**, not 7: typescript-eslint supports `<6.1.0` as of October 2026.
- **Prisma is pinned to 7.x**: the npm `latest` tag points at an 8.0 release candidate.
- **Local S3 storage:** MinIO via `cgr.dev/chainguard/minio`, pinned by digest. The official `minio/minio` images can no longer be pulled.
- **Host ports:** Postgres 5434, Redis 6379, MinIO 9000 (API) and 9001 (console).
- **Node 24 LTS** (from stage 2): the NestJS 12 CLI needs Node 22.22.3+ or 24.15+, and Node 22 reaches end of life in April 2027.
- **Auth:** server-side sessions stored in Postgres. A random token goes in an `httpOnly` cookie; only its SHA-256 hash is stored in a `sessions` table. Chosen over Redis sessions (library hides the mechanism) and JWT + refresh tokens (revocation needs a token store anyway).
- **Password hashing:** Argon2id via `@node-rs/argon2` (prebuilt binaries, no install script).
- **API validation:** NestJS 12's built-in `StandardSchemaValidationPipe` with the Zod schemas from `packages/shared`; no `nestjs-zod`.
- **API tests:** Vitest + supertest (NestJS 12's default for ESM projects), against a separate `jobpilot_test` database.
- **Sources (stage 3):** Remotive (whole public feed, at most 4 requests/day) and Jobicy (`industry=engineering`, at most one pass/hour). Both require visible attribution: source name plus a link to the listing URL. RemoteOK rejected (demands a public followed backlink); Himalayas deferred (more rules). Fetch every 6 h; `FETCH_INTERVAL_HOURS` cannot go below 6.
- **Salaries:** only USD per year is stored; other currencies and hourly/monthly rates become null.
- **Worker:** plain Node + BullMQ 6 (ioredis connection), no Nest. Failed jobs visible in Bull Board on 127.0.0.1:3002.
- **No worker_threads:** scoring measured at 0.15 ms per 24 KB listing; event loop p99 2.5 ms under a 5,000-job run (idle 1.9 ms).
- **Working mode (from stage 4):** stages run back to back without waiting for "next"; tasks collect in `docs/TASKS.md`; each stage is merged into `main` once every check is green. Still stop for decisions (libraries, schema) and always before anything that costs money (stage 6).
- **Stage 4:** CV PDFs are rendered by running headless Chrome directly as a child process (`CHROME_PATH`); the base CV lives in a `cv_profiles` table as JSON validated by a shared Zod schema; the CSV export reads through a Postgres server-side cursor (`pg-query-stream`).
- **Stage 5a (web):** Next.js 16.4 with Cache Components and Partial Prefetching, Tailwind 4. Everything, listings included, goes through the API (listings carry per-user scores); this supersedes "Server Components read listings from the database". The web server holds the session cookie on its own domain and forwards it; the browser never calls the API. Board status changes use a status menu with optimistic update, no drag-and-drop library.
- **Stage 5b:** kind 0.33 with Kubernetes pinned to 1.35.8 (kubectl skew); Gateway API with Envoy Gateway v1.9.2 instead of the retired ingress-nginx; Postgres/Redis/MinIO stay in Docker Compose, reached via host.docker.internal; Kustomize base + overlays; images built by `infra/k8s/up.sh`, tagged per commit and loaded with `kind load`; the migration Job completes before Deployments roll; the `fetch-sources` CronJob is the only fetch scheduler (BullMQ schedulers removed). The API trusts X-Forwarded-For only from `TRUST_PROXY` hops so the login rate limit is per client.
