import {
  createSavedSearchSchema,
  idParamSchema,
  type AlertsSummary,
  type CreateSavedSearchInput,
  type SavedSearchResponse,
  type SearchMatch,
} from '@jobpilot/shared';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AlertsService } from './alerts.service.js';

@Controller()
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get('alerts/summary')
  summary(@CurrentUser() user: AuthUser): Promise<AlertsSummary> {
    return this.alerts.summary(user.id);
  }

  @Get('saved-searches')
  list(@CurrentUser() user: AuthUser): Promise<SavedSearchResponse[]> {
    return this.alerts.list(user.id);
  }

  @Post('saved-searches')
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createSavedSearchSchema }) body: CreateSavedSearchInput,
  ): Promise<SavedSearchResponse> {
    return this.alerts.create(user.id, body);
  }

  @Delete('saved-searches/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParamSchema }) id: string,
  ): Promise<void> {
    return this.alerts.remove(user.id, id);
  }

  @Get('saved-searches/:id/matches')
  matches(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParamSchema }) id: string,
  ): Promise<SearchMatch[]> {
    return this.alerts.matches(user.id, id);
  }

  @Post('saved-searches/:id/seen')
  @HttpCode(HttpStatus.OK)
  markSeen(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParamSchema }) id: string,
  ): Promise<{ marked: number }> {
    return this.alerts.markSeen(user.id, id);
  }
}
