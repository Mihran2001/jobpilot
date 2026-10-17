import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller.js';
import { ApplicationsRepository } from './applications.repository.js';
import { ApplicationsService } from './applications.service.js';

@Module({
  controllers: [ApplicationsController],
  providers: [ApplicationsRepository, ApplicationsService],
})
export class ApplicationsModule {}
