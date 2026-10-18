import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import { UsersModule } from '../users/users.module.js';
import { AccountController } from './account.controller.js';
import { AccountService } from './account.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionGuard } from './session.guard.js';
import { SessionsRepository } from './sessions.repository.js';

@Module({
  imports: [
    UsersModule,
    // In-memory counters: correct for one API process. With several replicas
    // (stage 5b) each would count separately, and this moves to Redis.
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => [
        { name: 'auth', ttl: 60_000, limit: config.AUTH_RATE_LIMIT_PER_MINUTE },
      ],
    }),
  ],
  controllers: [AuthController, AccountController],
  providers: [
    AuthService,
    AccountService,
    PasswordHasher,
    SessionsRepository,
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AuthModule {}
