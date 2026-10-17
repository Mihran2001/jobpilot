import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

/** HTTP-level setup shared by main.ts and the integration tests. */
export function configureApp(app: NestExpressApplication): void {
  // Don't advertise the framework in every response.
  app.disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.use(cookieParser());
}
