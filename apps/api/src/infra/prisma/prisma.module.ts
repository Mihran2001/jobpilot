import { createPrismaClient, PrismaClient } from '@jobpilot/db';
import { Global, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';

/**
 * One PrismaClient (and so one connection pool) for the whole process.
 *
 * The PrismaClient class itself is the injection token, so any provider can
 * ask for it with `constructor(private readonly prisma: PrismaClient)`.
 */
@Global()
@Module({
  providers: [
    {
      provide: PrismaClient,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        createPrismaClient({ connectionString: config.DATABASE_URL }),
    },
  ],
  exports: [PrismaClient],
})
export class PrismaModule implements OnApplicationShutdown {
  private readonly logger = new Logger(PrismaModule.name);

  constructor(private readonly prisma: PrismaClient) {}

  // Runs after the HTTP server has stopped accepting requests, so no
  // in-flight query loses its connection.
  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
    this.logger.log('Database pool closed');
  }
}
