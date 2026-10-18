# syntax=docker/dockerfile:1.7
# NestJS API. Build from the repo root:
#   docker build -f infra/docker/api.Dockerfile -t jobpilot/api .

FROM node:24-trixie-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

# Dependency manifests only, so this layer is reused until a lockfile or
# package.json changes, not on every source edit.
FROM base AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/storage/package.json packages/storage/
COPY apps/api/package.json apps/api/

FROM manifests AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@jobpilot/api..."
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter "@jobpilot/api..." build

# Production dependencies only: no TypeScript, Nest CLI, Prisma CLI, test tools.
FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@jobpilot/api..."

FROM node:24-trixie-slim AS runtime
# tini as PID 1: forwards SIGTERM to node and reaps zombie processes.
RUN apt-get update && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
# The workspace layout is kept, so pnpm's node_modules symlinks still resolve.
COPY --from=prod-deps --chown=node:node /repo /app
COPY --from=build --chown=node:node /repo/packages/shared/dist packages/shared/dist
COPY --from=build --chown=node:node /repo/packages/db/dist packages/db/dist
COPY --from=build --chown=node:node /repo/packages/storage/dist packages/storage/dist
COPY --from=build --chown=node:node /repo/apps/api/dist apps/api/dist
USER node
WORKDIR /app/apps/api
EXPOSE 3001
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
