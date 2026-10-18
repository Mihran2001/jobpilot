# syntax=docker/dockerfile:1.7
# BullMQ worker, with Chromium for CV PDFs. Build from the repo root:
#   docker build -f infra/docker/worker.Dockerfile -t jobpilot/worker .

FROM node:24-trixie-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

FROM base AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/storage/package.json packages/storage/
COPY apps/worker/package.json apps/worker/

FROM manifests AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@jobpilot/worker..."
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/worker apps/worker
RUN pnpm --filter "@jobpilot/worker..." build

FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@jobpilot/worker..."

FROM node:24-trixie-slim AS runtime
# Chromium renders CV PDFs; fonts-liberation gives it Arial/Helvetica-metric
# fonts so the layout matches your Mac. tini reaps the short-lived processes
# Chrome leaves behind (Node as PID 1 would not).
RUN apt-get update && apt-get install -y --no-install-recommends \
      tini chromium fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    CHROME_PATH=/usr/bin/chromium \
    CHROME_NO_SANDBOX=true
WORKDIR /app
COPY --from=prod-deps --chown=node:node /repo /app
COPY --from=build --chown=node:node /repo/packages/shared/dist packages/shared/dist
COPY --from=build --chown=node:node /repo/packages/db/dist packages/db/dist
COPY --from=build --chown=node:node /repo/packages/storage/dist packages/storage/dist
COPY --from=build --chown=node:node /repo/apps/worker/dist apps/worker/dist
USER node
WORKDIR /app/apps/worker
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
