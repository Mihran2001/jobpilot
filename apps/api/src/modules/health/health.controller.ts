import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { HealthService } from './health.service.js';

/**
 * Two questions Kubernetes asks separately:
 * - live:  is this process working at all? If not, restart it. It must not
 *          depend on the database, or a database outage would make
 *          Kubernetes restart every (healthy) API pod in a loop.
 * - ready: should this pod receive traffic right now? Needs the database.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    if (!(await this.health.isDatabaseUp())) {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return { status: 'ok' };
  }
}
