import path from 'node:path';
import type { NextConfig } from 'next';

// The monorepo root: where pnpm-lock.yaml and the shared packages live.
const repoRoot = path.join(import.meta.dirname, '../..');

const nextConfig: NextConfig = {
  // Next.js 16 default: pages prerender a static shell; anything that reads
  // the request (cookies, searchParams) streams in behind <Suspense>.
  cacheComponents: true,
  // Prefetch the static shell of linked pages, so navigation feels instant.
  partialPrefetching: true,
  // A self-contained server in .next/standalone for the Docker image (stage 5b).
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  poweredByHeader: false,
  turbopack: {
    root: repoRoot,
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
};

export default nextConfig;
