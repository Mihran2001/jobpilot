import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { APP_CONFIG, type AppConfig } from './config/config.js';

/** HTTP-level setup shared by main.ts and the integration tests. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);
  // Don't advertise the framework in every response.
  app.disable('x-powered-by');
  // Which hops may tell us the client's address in X-Forwarded-For. Express
  // walks the header from the right and stops at the first hop it does not
  // trust, so a client cannot spoof its address from outside. This is what
  // makes req.ip (and so the login rate limit) per client, not per web pod.
  app.set('trust proxy', config.TRUST_PROXY);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
}
