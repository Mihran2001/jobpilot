import { pipeline } from 'node:stream/promises';
import { Controller, Get, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ExportsService } from './exports.service.js';

@Controller('exports')
export class ExportsController {
  private readonly logger = new Logger(ExportsController.name);

  constructor(private readonly exportsService: ExportsService) {}

  /**
   * database cursor -> CSV transform -> HTTP response, joined by pipeline():
   * backpressure flows back to the cursor, and if any part fails or the
   * client disconnects, every stream is destroyed and the connection freed.
   */
  @Get('applications.csv')
  async applications(@CurrentUser() user: AuthUser, @Res() res: Response): Promise<void> {
    const { rows, toCsv } = await this.exportsService.applicationHistory(user.id);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader(
      'content-disposition',
      `attachment; filename="jobpilot-applications-${date}.csv"`,
    );

    try {
      await pipeline(rows, toCsv(), res);
    } catch (err) {
      // Before the first byte we can still answer with a proper error;
      // after it, the status line has gone and the download is cut short.
      if (!res.headersSent) throw err;
      this.logger.warn({ err }, 'CSV export stopped early');
    }
  }
}
