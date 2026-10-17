import type { SourceResponse } from '@jobpilot/shared';
import { Controller, Get } from '@nestjs/common';
import { SourcesService } from './sources.service.js';

@Controller('sources')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Get()
  list(): Promise<SourceResponse[]> {
    return this.sources.list();
  }
}
