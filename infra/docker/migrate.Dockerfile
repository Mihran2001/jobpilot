# syntax=docker/dockerfile:1.7
# Database tasks, run as Kubernetes Jobs:
#   default:  prisma migrate deploy   (before every rollout)
#   command:  pnpm exec prisma db seed (once, on a new database)
#   docker build -f infra/docker/migrate.Dockerfile -t jobpilot/migrate .

FROM node:24-trixie-slim AS runtime
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
# The Prisma CLI and tsx are dev dependencies of packages/db: they are the tools here.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@jobpilot/db..."
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/db packages/db
# The seed imports @jobpilot/shared (compiled) and the generated Prisma client.
RUN pnpm --filter @jobpilot/shared build && pnpm --filter @jobpilot/db generate \
 && chown -R node:node /repo
USER node
WORKDIR /repo/packages/db
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
