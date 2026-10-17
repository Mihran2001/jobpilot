import { pino, type Logger } from 'pino';
import type { WorkerConfig } from './config.js';

export function createLogger(config: WorkerConfig): Logger {
  return pino({
    level: config.LOG_LEVEL,
    base: { service: 'worker' },
    redact: { paths: ['*.password', '*.passwordHash', '*.token'], censor: '[redacted]' },
    transport:
      config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
  });
}
