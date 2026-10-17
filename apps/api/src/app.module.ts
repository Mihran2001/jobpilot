import { Module, StandardSchemaValidationPipe, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { PrismaExceptionFilter } from './common/prisma-exception.filter.js';
import { APP_CONFIG, type AppConfig } from './config/config.js';
import { PgModule } from './infra/pg/pg.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { QueueModule } from './infra/queue/queue.module.js';
import { StorageModule } from './infra/storage/storage.module.js';
import { loggerParams } from './logging.js';
import { ApplicationsModule } from './modules/applications/applications.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CvModule } from './modules/cv/cv.module.js';
import { ExportsModule } from './modules/exports/exports.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { ListingsModule } from './modules/listings/listings.module.js';
import { SourcesModule } from './modules/sources/sources.module.js';
import { UsersModule } from './modules/users/users.module.js';

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
      imports: [
        LoggerModule.forRoot(loggerParams(config)),
        PrismaModule,
        PgModule,
        StorageModule,
        QueueModule,
        HealthModule,
        AuthModule,
        UsersModule,
        SourcesModule,
        ListingsModule,
        ApplicationsModule,
        CvModule,
        ExportsModule,
      ],
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
