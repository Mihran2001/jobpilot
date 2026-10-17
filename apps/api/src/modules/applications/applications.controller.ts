import {
  applicationsQuerySchema,
  changeStatusSchema,
  createApplicationSchema,
  idParamSchema,
  updateApplicationSchema,
  type ApplicationDetail,
  type ApplicationList,
  type ApplicationsQuery,
  type ChangeStatusInput,
  type CreateApplicationInput,
  type UpdateApplicationInput,
} from '@jobpilot/shared';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ApplicationsService } from './applications.service.js';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createApplicationSchema }) body: CreateApplicationInput,
  ): Promise<ApplicationDetail> {
    return this.applications.create(user.id, body);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: applicationsQuerySchema }) query: ApplicationsQuery,
  ): Promise<ApplicationList> {
    return this.applications.list(user.id, query);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParamSchema }) id: string,
  ): Promise<ApplicationDetail> {
    return this.applications.get(user.id, id);
  }

  @Patch(':id')
  updateNotes(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParamSchema }) id: string,
    @Body({ schema: updateApplicationSchema }) body: UpdateApplicationInput,
  ): Promise<ApplicationDetail> {
    return this.applications.updateNotes(user.id, id, body);
  }

  @Patch(':id/status')
  changeStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParamSchema }) id: string,
    @Body({ schema: changeStatusSchema }) body: ChangeStatusInput,
  ): Promise<ApplicationDetail> {
    return this.applications.changeStatus(user.id, id, body);
  }
}
