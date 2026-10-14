import { existsSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadConfig } from './config/config.js';

// Local development reads the repo-root .env. In containers the variables are
// set by the platform and the file does not exist. Already-set variables win.
const rootEnv = path.resolve(import.meta.dirname, '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// Fails here, before anything starts, if the environment is invalid.
const config = loadConfig();

const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), {
  bufferLogs: true,
});
app.useLogger(app.get(Logger));
configureApp(app);

// On SIGTERM/SIGINT: stop accepting connections, let in-flight requests
// finish, then run onApplicationShutdown hooks (which close the DB pool).
app.enableShutdownHooks();

await app.listen(config.API_PORT);
