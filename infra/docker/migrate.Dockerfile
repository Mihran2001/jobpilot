# syntax=docker/dockerfile:1.7
# Runs `prisma migrate deploy` once, as a Kubernetes Job before a rollout.
#   docker build -f infra/docker/migrate.Dockerfile -t jobpilot/migrate .

FROM node:24-trixie-slim AS runtime
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
# The Prisma CLI is a dev dependency of packages/db, and it is what migrates.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@jobpilot/db"
COPY packages/db/prisma.config.ts packages/db/
COPY packages/db/prisma packages/db/prisma
RUN chown -R node:node /repo
USER node
WORKDIR /repo/packages/db
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
