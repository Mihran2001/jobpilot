import type { Server } from 'node:http';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { Queue } from 'bullmq';
import express, { type Router } from 'express';

export interface Board {
  url: string;
  close(): Promise<void>;
}

/**
 * Bull Board: failed jobs with their errors, attempts, and a retry button.
 * Bound to 127.0.0.1 because it can retry and delete jobs and has no login.
 */
export async function startBoard(queues: Queue[], port: number): Promise<Board> {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/');
  createBullBoard({ queues: queues.map((q) => new BullMQAdapter(q)), serverAdapter });

  const app = express();
  app.use('/', serverAdapter.getRouter() as Router);

  const server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(port, '127.0.0.1', (err?: Error) => (err ? reject(err) : resolve(s)));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
