import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller.js';
import { ExportsRepository } from './exports.repository.js';
import { ExportsService } from './exports.service.js';

@Module({
  controllers: [ExportsController],
  providers: [ExportsRepository, ExportsService],
})
export class ExportsModule {}
