# JobPilot

A personal job-hunt command center: it aggregates remote job listings, scores them against a skill profile, tracks applications through their stages, generates a tailored CV PDF per listing, and exports application history as CSV.

This is a learning and portfolio project built in stages. **Current state: stage 6 (AWS).** A Next.js dashboard on top of a NestJS API and a BullMQ worker. It runs locally with `pnpm dev:*`, in a local Kubernetes cluster with `pnpm k8s:up`, and on AWS (one EC2 instance running k3s, RDS, S3, ECR) with OpenTofu and `pnpm aws:deploy`. CI on GitHub Actions typechecks, lints, tests and builds the ARM images.

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
pnpm dev:worker         # fetch, score and CV workers; Bull Board on http://127.0.0.1:3002
pnpm dev:web            # the dashboard on http://localhost:3000
```

Open http://localhost:3000 and sign in as `dev@jobpilot.test` with the password from `SEED_USER_PASSWORD` in `.env`. Or talk to the API directly:

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

## Run it in Kubernetes

Needs Docker, [kind](https://kind.sigs.k8s.io/) (`brew install kind`) and kubectl. Postgres, Redis and MinIO keep running in Docker Compose (`pnpm infra:up`); the pods reach them through `host.docker.internal`.

```bash
pnpm k8s:up             # cluster + Envoy Gateway if missing, build and load images, migrate, roll out
```

Then open http://localhost:8080. `pnpm k8s:down` deletes the whole cluster.

| Piece                                | What it is                                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `infra/k8s/kind.yaml`                | One-node cluster, Kubernetes 1.35.8 (pinned: within one minor version of Docker Desktop's kubectl 1.34). Port 30080 in the cluster is `127.0.0.1:8080` on the Mac.    |
| `infra/docker/*.Dockerfile`          | Multi-stage images for api, worker (with Chromium), web (Next.js standalone) and migrate. Frozen-lockfile installs, non-root `node` user, `tini` as PID 1.            |
| `infra/k8s/base`                     | Deployments (api ×2, web ×2, worker ×1), Services, the migration Job, the fetch CronJob, and the Gateway API resources.                                               |
| `infra/k8s/overlays/local`           | Config (`config.env`), secrets (`secrets.env`, gitignored, generated from the example), and the NodePort for the gateway.                                             |
| `infra/k8s/up.sh`                    | Builds images tagged with the commit (`-dirty-<time>` if uncommitted), loads them into kind, runs the migration Job and waits for it, then rolls out the Deployments. |
| `infra/k8s/rollout-test.sh api\|web` | Sends ~50 requests/s from inside the cluster during a rolling restart and counts the answers.                                                                         |

**Traffic:** browser → Envoy Gateway (Gateway API; `ingress-nginx` was retired in March 2026) → `web` Service → web pods → `api` Service → api pods. The API has no route from outside.

**Zero-downtime rollouts**, measured with `rollout-test.sh`: 1,645 of 1,645 requests answered during an API rollout and 1,643 of 1,643 through the gateway during a web rollout. With `preStop` removed and `maxUnavailable: 1`, the same test lost 3 requests. What makes the difference:

- `maxUnavailable: 0, maxSurge: 1`: a new pod must be ready before an old one goes.
- Readiness probes (`/api/health/ready`, `/healthz`): traffic only to pods that can serve it.
- `preStop: sleep 5s`: endpoint removal reaches Envoy and kube-proxy asynchronously, so a terminating pod keeps serving for 5 s before it gets `SIGTERM`; then the app's own graceful shutdown finishes in-flight requests.
- Liveness probes never check the database, so a database outage does not restart healthy pods.

**Scheduled fetching** is the `fetch-sources` CronJob (every 6 h, UTC): it runs `fetch:now`, which enqueues one job per enabled source; the worker fetches with retries. It is the only scheduler. On start the worker removes any BullMQ fetch schedulers from earlier versions, and the jobs they had already queued, before it starts processing. To fetch now: `kubectl create job --from=cronjob/fetch-sources fetch-now -n jobpilot`.

**Hardening:** every container runs as uid 1000 with a read-only root filesystem, no privilege escalation and all capabilities dropped; only `/tmp` (and Next.js's cache) are writable `emptyDir` volumes.

## Deploy to AWS

One EC2 instance (`t4g.small`, ARM, 2 GB) runs k3s with the same manifests as the local cluster, plus RDS PostgreSQL, S3 for CVs and ECR for images, in Stockholm (`eu-north-1`). Everything is defined with OpenTofu in `infra/aws/`.

**Cost while running: about $34/month** (on-demand, Stockholm, October 2026 price list), paid from the free plan's credits:

| Item                                     | $/month                 |
| ---------------------------------------- | ----------------------- |
| EC2 `t4g.small` (2 vCPU, 2 GB)           | 12.56                   |
| 30 GB gp3 disk                           | ~3.00                   |
| Public IPv4 address                      | 3.65                    |
| RDS PostgreSQL `db.t4g.micro` + 20 GB    | 14.08                   |
| ECR (~10 GB, 5 images kept per app) + S3 | ~1.10                   |
| Redis                                    | 0 (a pod on the server) |

**Free plan limits, found on the first apply:** only Free Tier eligible instance types may run (`t4g.medium`, the original choice, was refused), and a service control policy denies creating the GitHub OIDC provider. So the server is a `t4g.small` with 2 GB of swap, the AWS overlay runs one api and one web pod, and images are pushed by `pnpm aws:deploy` instead of CI. On a paid plan, `t4g.medium` (~$47/month total) and CI pushes via OIDC would be the natural upgrade.

Stopping the instance and the database when unused brings it to about $6/month (storage only; AWS restarts a stopped RDS instance after 7 days). Rejected alternatives: ECS Fargate (~$105/month, new task definitions instead of these manifests) and EKS (~$195/month: the control plane alone is $73).

### One-time account setup (you, in the AWS console)

1. Create an AWS account at https://aws.amazon.com (free plan: $100 in credits, up to $200, for 6 months).
2. Turn on MFA for the root user. Do not use the root user for anything else.
3. IAM Identity Center: enable it, create a user for yourself, and give it the `AdministratorAccess` permission set on your account.
4. On your Mac: `aws login --profile jobpilot --region eu-north-1` (browser sign-in; credentials last 12 hours and renew for up to 90 days), then `aws sts get-caller-identity --profile jobpilot` to check. No access keys are stored.

### Create, deploy, check

```bash
cd infra/aws && cp terraform.tfvars.example terraform.tfvars   # set notification_email
tofu init
tofu plan          # read it: every resource that will be created
tofu apply         # about 10 minutes, mostly RDS
cd ../.. && pnpm aws:deploy --seed                             # first deploy, creates your user
tofu -chdir=infra/aws output url                               # https://<ip>.sslip.io
tofu -chdir=infra/aws output -raw app_password                 # log in as dev@jobpilot.test
```

Later deploys: push to GitHub, then `pnpm aws:deploy`.

How a deploy works: `deploy.sh` (your Mac) builds and pushes any missing images, then sends `server-deploy.sh` to the server through SSM Run Command. The server downloads that commit from GitHub, installs or updates Envoy Gateway and cert-manager, pulls the images from ECR with its IAM role, writes config and secrets (from SSM Parameter Store), and runs the same `infra/k8s/apply.sh` as the local cluster. No SSH port is open; for a shell use `aws ssm start-session --target $(tofu -chdir=infra/aws output -raw instance_id) --profile jobpilot`.

### Tear everything down

```bash
cd infra/aws && tofu destroy
```

That deletes the instance and its disk, the IP address, the database (no final snapshot unless `keep_final_db_snapshot = true`), the S3 bucket with all CVs, the ECR repositories with all images, the SSM parameters, the IAM role, the budget, and the VPC. Then check nothing is left: AWS console, Resource Groups and Tag Editor, search all regions for tag `Project = jobpilot`; and Billing, Bills, for the current month.

## Web app

`apps/web` is Next.js 16 (App Router) with Tailwind. The browser only ever talks to the web app; the web app's server talks to the API.

```
browser ──> Next.js server ──> NestJS API ──> Postgres / Redis / storage
   └──────────── presigned URL ────────────────> storage (CV download/upload only)
```

- **Session.** The login Server Action calls `POST /api/auth/login`, takes the token from the API's `Set-Cookie`, and sets the same `httpOnly` cookie on the web app's domain. Every Server Component and Server Action calls the API through `src/lib/api.ts`, which forwards that cookie, adds an `x-request-id`, applies a 15 s timeout, and turns a 401 into a redirect to `/login`. `src/proxy.ts` (Next.js 16's name for middleware) only does the optimistic "no cookie at all, go to login" check.
- **Cache Components.** Pages prerender a static shell (navigation) and stream the per-user content in behind `<Suspense>` (`loading.tsx`), as Next.js 16 requires for anything reading cookies.
- **Pages.** `/listings` (filters in the URL, cursor pagination, score, attribution link), `/listings/[id]`, `/applications` (board, status menu with optimistic update and rollback on 409), `/applications/[id]` (history, notes, CVs: generate, upload, download), `/cv-profile`.
- **Route handlers.** `/cv-versions/[id]/download` redirects to a 5-minute storage URL; `/exports/applications.csv` passes the API's stream through without buffering.
- **Third-party HTML** (listing descriptions) is reduced to text blocks and rendered as text, never injected.

## API

All routes are under `/api` and need a session cookie unless marked public.

| Method and path                            | What it does                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `GET /health` (public)                     | 200 if the database answers, 503 otherwise                                                                     |
| `POST /auth/register` (public)             | Create an account and start a session                                                                          |
| `POST /auth/login` (public)                | Start a session. Rate-limited per IP                                                                           |
| `POST /auth/logout`                        | End this session                                                                                               |
| `GET /users/me`                            | The logged-in user                                                                                             |
| `GET /sources`                             | Listing sources                                                                                                |
| `GET /listings`                            | Newest first, keyset-paginated. Filters: `q`, `remote`, `minSalary`, `sourceId`, `minScore`; `limit`, `cursor` |
| `GET /listings/:id`                        | One listing with its description and your score                                                                |
| `POST /applications`                       | Save a listing as an application (status `SAVED`)                                                              |
| `GET /applications`                        | Your applications plus a count per status; filter with `status`                                                |
| `GET /applications/:id`                    | One application with its status history                                                                        |
| `PATCH /applications/:id`                  | Edit notes (`null` clears them)                                                                                |
| `GET /cv-profile`, `PUT /cv-profile`       | Your base CV (JSON, validated by `cvProfileSchema`)                                                            |
| `POST /applications/:id/cv`                | Queue a CV tailored to that listing; answers 202 with a `PENDING` version                                      |
| `GET /cv-versions`, `GET /cv-versions/:id` | Your CVs and their status (`PENDING`, `READY`, `FAILED`)                                                       |
| `GET /cv-versions/:id/download`            | A 5-minute presigned URL straight to storage                                                                   |
| `POST /cv-versions/uploads`                | Start an upload: returns a presigned PUT for exactly this type and size                                        |
| `POST /cv-versions/:id/complete-upload`    | Verify the uploaded object (size, `%PDF-` signature) and mark it `READY`                                       |
| `GET /exports/applications.csv`            | Your application history, streamed through a database cursor                                                   |
| `PATCH /applications/:id/status`           | Move to a new status; records an event in the same transaction                                                 |

Request and response shapes are the Zod schemas in `packages/shared`.

## Worker

`apps/worker` is a plain Node process (no Nest) running two BullMQ queues:

| Queue           | What a job does                                                                                       | Retries                                      |
| --------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `fetch-source`  | Fetches one source, upserts every listing on `(source_id, external_id)`, queues scoring for the batch | 5 attempts, 1/2/4/8 min backoff              |
| `score-listing` | Scores one listing for one user and upserts `listing_scores`                                          | 3 attempts; deduplicated per (user, listing) |

- **Schedule.** In Kubernetes, the `fetch-sources` CronJob enqueues fetches every 6 hours (see below). Locally, run `pnpm fetch:now` when you want fresh listings.
- **Fetch now.** `pnpm fetch:now` or `pnpm fetch:now remotive`. Mind the limits below.
- **Failed jobs.** Bull Board on http://127.0.0.1:3002 lists failed jobs, their errors and attempts, and can retry them. 4xx responses (except 429) and malformed responses fail immediately instead of using up retries.
- **Kill-safety.** A job cut off by a crash keeps its lock until it expires (30 s); the next stalled check (every 30 s) moves it back to waiting, so it is re-run within about a minute. Every job is idempotent, so running it twice is harmless.
- **Graceful shutdown.** `SIGTERM`/`SIGINT` stop new work, let running jobs finish (up to 25 s), then close queues, Redis and Prisma.

### CV generation

`generate-cv` reads the version's application, listing and your CV profile, then:

1. **Tailors** without inventing: skills and experience highlights the listing mentions move to the front (`src/cv/tailor.ts`).
2. **Renders** an HTML page in which every value is escaped (`src/cv/template.ts`).
3. **Runs Chrome** as a separate program: `chrome --headless --print-to-pdf=... file:///.../cv.html` (`src/cv/chrome.ts`). Chrome gets its own process group, a 30 s timeout (the whole group is killed on timeout), a throwaway profile directory, and its stderr tail is kept for the logs. Exit code 0 without a valid PDF still counts as a failure.
4. **Uploads** the PDF to object storage and marks the version `READY`. Only the last failed attempt marks it `FAILED`, with a readable error.

Locally `CHROME_PATH` points at your Google Chrome; in Docker it will be Debian's `chromium` with `CHROME_NO_SANDBOX=true`.

### Sources and their terms

| Source   | What we fetch                               | Limits we respect                  | Attribution the terms require                                 |
| -------- | ------------------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| Remotive | The whole public feed (small; delayed 24 h) | At most 4 requests a day           | Name Remotive and link to the job on Remotive                 |
| Jobicy   | Latest 100 jobs in Software Engineering     | At most one automated pass an hour | Credit Jobicy with a clickable link; apply via the feed's URL |

The UI (stage 5a) must show the source name and link to `job_listings.url` for every listing. Jobs are never passed on to other job sites. Only USD-per-year salaries are stored; anything else is `null`.

## Tests

`pnpm test` runs the API and worker integration tests, one package at a time, against a separate `jobpilot_test` database (from `TEST_DATABASE_URL`) and Redis database 1 (`TEST_REDIS_URL`). The setup creates the database if needed and applies migrations with `prisma migrate deploy`; every test starts from empty tables. Only third-party HTTP is faked, with small made-up fixtures in the real response shapes.

## Layout

```
apps/
  api/              NestJS REST API: src/modules/<feature>/ (controller -> service -> repository)
  worker/           BullMQ workers: src/sources (one adapter per site), src/jobs, src/scoring, src/cv
  web/              Next.js dashboard: src/app (routes), src/lib (API client, session), src/proxy.ts
packages/
  shared/           Zod schemas, inferred types and queue contracts; no Node- or database-specific code
  db/               Prisma schema, migrations, seed, and the generated client
  storage/          S3 client: uploads, presigned URLs (used by api and worker)
infra/docker/       Dockerfiles for api, worker, web, migrate
infra/k8s/          kind config, Kustomize base and overlays (local, aws), apply/up/rollout-test scripts
infra/aws/          OpenTofu for AWS, deploy scripts
.github/workflows/  CI
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
| `pnpm dev:worker`                 | Run the worker with restart on change                  |
| `pnpm dev:web`                    | Run the web app (needs the API running)                |
| `pnpm fetch:now [source]`         | Queue an immediate fetch                               |
| `pnpm k8s:up` / `pnpm k8s:down`   | Deploy to / delete the local kind cluster              |
| `pnpm aws:deploy [--seed]`        | Deploy the current (pushed) commit to AWS              |
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
- **Indexes are added only with evidence.** Each one comes with the query it serves and an `EXPLAIN ANALYZE` before and after; Postgres does not index foreign keys automatically. So far: `job_listings (posted_at DESC, id DESC)` for the listings feed ([listings-feed.sql](packages/db/explain/listings-feed.sql)) and `application_events (application_id, created_at)` for the application detail view and cascade deletes ([application-events.sql](packages/db/explain/application-events.sql)).
- **Keyset pagination, written as a range.** The cursor condition is `posted_at <= x AND (posted_at < x OR id < y)`. The equivalent `posted_at < x OR (posted_at = x AND id < y)` cannot start the index scan at the cursor and was slower with the index than without it.
- **Enums are declared twice** (Prisma schema and `packages/shared`) because the browser cannot import Prisma. `packages/db/src/enum-check.ts` fails the build if they differ.
- **Sessions, not JWT.** A random 256-bit token in an `httpOnly`, `SameSite=Lax` cookie; Postgres stores only its SHA-256 hash. Logout and expiry take effect immediately. Every route needs a session unless it is marked `@Public()`.
- **Argon2id via `@node-rs/argon2`.** Prebuilt binaries, nothing to compile. Unknown emails still pay for one hash, so login timing does not reveal which accounts exist.
- **Validation with NestJS 12's built-in Standard Schema pipe** and the shared Zod schemas. Responses go through explicit mappers, never raw Prisma rows.
- **Ownership is part of every query** (`WHERE id = $1 AND user_id = $2`), so another user's data is a 404, indistinguishable from data that does not exist.
- **Status changes use optimistic concurrency.** The update only applies if the status is still the one just read; otherwise the API answers 409 rather than writing an event with a wrong `fromStatus`.
- **The web app reads everything through the API**, including listings (each one carries your score, which is per-user data). Ownership checks live in one place, and the web app needs no database credentials. This replaces the brief's original "Server Components read listings from the database".
- **Files never pass through the API.** Downloads and uploads use 5-minute presigned URLs. An upload URL signs `Content-Type` and `Content-Length`, so storage rejects anything else; after the upload the API checks the object's size and its `%PDF-` signature in storage. URLs are signed for `S3_PUBLIC_ENDPOINT`, the address browsers use, which differs from the internal one in Kubernetes.
- **Postgres and Redis cannot share a transaction.** When the API cannot queue a CV job within 3 s, it marks the new version `FAILED` and answers 503 instead of leaving it `PENDING` forever. The job id is the version id, so a late duplicate add is harmless.
- **The CSV export streams.** `pg-query-stream` (a real server-side cursor, 500 rows per fetch) -> `csv-stringify` -> the response, joined by `stream.pipeline`, so backpressure reaches the database and a dropped download frees the connection. Measured with `pnpm --filter @jobpilot/api bench:export-memory`: live heap +1.4 MB for 100k rows and +1.6 MB for 300k, against +61 MB and +184 MB for the load-everything version. Cells starting with `= + - @` are prefixed with `'` so spreadsheets do not run them as formulas.
- **No `worker_threads` for scoring: measured, not needed.** One `scoreListing` call on a 24 KB description takes 0.15 ms (p99 0.26 ms). Running 5,000 real score jobs at concurrency 10 (2,250 jobs/s), event loop delay p99 was 2.5 ms against 1.9 ms idle, max 8.9 ms. A thread pool would add copying and complexity to save almost nothing. Re-run with `pnpm --filter @jobpilot/worker bench:score-lag` if scoring gets heavier.
- **Fetch jobs re-score the whole batch** instead of detecting what changed. It costs a few hundred cheap jobs per run and makes a re-run after a crash always complete.
- **Login rate limit is in memory.** Correct for one API process; moves to Redis when there are replicas (stage 5b).

The full brief, stage plan and conventions are in [CLAUDE.md](CLAUDE.md).
