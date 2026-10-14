import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { AppConfig } from './config/config.js';

const REQUEST_ID_HEADER = 'x-request-id';
const VALID_REQUEST_ID = /^[\w-]{1,64}$/;

/**
 * Reuses the caller's request id (for example one set by the Next.js server)
 * if it looks safe, otherwise creates one. It is echoed back in the response
 * so a user-facing error can be matched to its log lines.
 */
function requestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

export function loggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.LOG_LEVEL,
      genReqId: requestId,
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },
      // Human-readable output locally; raw JSON lines everywhere else.
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
    },
  };
}
