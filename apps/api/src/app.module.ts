import { Module, StandardSchemaValidationPipe, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { PrismaExceptionFilter } from './common/prisma-exception.filter.js';
import { APP_CONFIG, type AppConfig } from './config/config.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { loggerParams } from './logging.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({})
export class AppModule {
  /**
   * The config is passed in rather than read here, so main.ts validates the
   * real environment and tests can hand in a test config.
   */
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [LoggerModule.forRoot(loggerParams(config)), PrismaModule, HealthModule],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        // Registered as providers (not in main.ts) so tests get them too.
        { provide: APP_PIPE, useValue: new StandardSchemaValidationPipe() },
        { provide: APP_FILTER, useClass: PrismaExceptionFilter },
      ],
      exports: [APP_CONFIG],
    };
  }
}
