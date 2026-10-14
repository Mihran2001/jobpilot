import { Module } from '@nestjs/common';
import { SourcesController } from './sources.controller.js';
import { SourcesRepository } from './sources.repository.js';
import { SourcesService } from './sources.service.js';

@Module({
  controllers: [SourcesController],
  providers: [SourcesRepository, SourcesService],
})
export class SourcesModule {}
