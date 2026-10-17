import { createStorage, storageConfigFromEnv, type Storage } from '@jobpilot/storage';
import {
  Global,
  Inject,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';

export const STORAGE = Symbol('STORAGE');

@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createStorage(storageConfigFromEnv(config)),
    },
  ],
  exports: [STORAGE],
})
export class StorageModule implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    @Inject(STORAGE) private readonly storage: Storage,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.S3_CREATE_BUCKET) await this.storage.ensureBucket();
  }

  onApplicationShutdown(): void {
    this.storage.destroy();
  }
}
