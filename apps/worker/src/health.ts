import { createServer, type Server } from 'node:http';
import type { Worker } from 'bullmq';
import type { Redis } from 'ioredis';

/**
 * A tiny HTTP server for Kubernetes probes; the worker has no other HTTP.
 * - /live:  the process is running (event loop answers).
 * - /ready: Redis is connected and every worker is running.
 */
export function startHealthServer(port: number, redis: Redis, workers: Worker[]): Promise<Server> {
  const server = createServer((req, res) => {
    const ready = redis.status === 'ready' && workers.every((w) => w.isRunning());
    const ok = req.url === '/live' || (req.url === '/ready' && ready);
    res.writeHead(ok ? 200 : req.url === '/ready' ? 503 : 404, {
      'content-type': 'application/json',
    });
    res.end(JSON.stringify({ status: ok ? 'ok' : 'unavailable' }));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
}
