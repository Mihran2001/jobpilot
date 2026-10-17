import {
  idParamSchema,
  listingsQuerySchema,
  type ListingDetail,
  type ListingsPage,
  type ListingsQuery,
} from '@jobpilot/shared';
import { Controller, Get, Param, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ListingsService } from './listings.service.js';

@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listingsQuerySchema }) query: ListingsQuery,
  ): Promise<ListingsPage> {
    return this.listings.getPage(user.id, query);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParamSchema }) id: string,
  ): Promise<ListingDetail> {
    return this.listings.getById(user.id, id);
  }
}
