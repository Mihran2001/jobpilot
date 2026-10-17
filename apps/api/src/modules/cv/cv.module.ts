import { Module } from '@nestjs/common';
import { CvController } from './cv.controller.js';
import { CvRepository } from './cv.repository.js';
import { CvService } from './cv.service.js';

@Module({
  controllers: [CvController],
  providers: [CvRepository, CvService],
})
export class CvModule {}
