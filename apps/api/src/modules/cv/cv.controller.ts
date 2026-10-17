import {
  createCvUploadSchema,
  cvProfileSchema,
  cvVersionsQuerySchema,
  idParamSchema,
  type CreateCvUploadInput,
  type CvProfile,
  type CvUploadResponse,
  type CvVersionResponse,
  type CvVersionsQuery,
  type PresignedUrl,
} from '@jobpilot/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CvService } from './cv.service.js';

@Controller()
export class CvController {
  constructor(private readonly cv: CvService) {}

  @Get('cv-profile')
  getProfile(@CurrentUser() user: AuthUser): Promise<CvProfile> {
    return this.cv.getProfile(user.id);
  }

  @Put('cv-profile')
  saveProfile(
    @CurrentUser() user: AuthUser,
    @Body({ schema: cvProfileSchema }) body: CvProfile,
  ): Promise<CvProfile> {
    return this.cv.saveProfile(user.id, body);
  }

  /** 202: accepted for processing; poll GET /cv-versions/:id for the result. */
  @Post('applications/:id/cv')
  @HttpCode(HttpStatus.ACCEPTED)
  generate(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParamSchema }) applicationId: string,
  ): Promise<CvVersionResponse> {
    return this.cv.requestGenerated(user.id, applicationId);
  }

  @Get('cv-versions')
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: cvVersionsQuerySchema }) query: CvVersionsQuery,
  ): Promise<CvVersionResponse[]> {
    return this.cv.list(user.id, query.applicationId);
  }

  @Post('cv-versions/uploads')
  createUpload(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createCvUploadSchema }) body: CreateCvUploadInput,
  ): Promise<CvUploadResponse> {
    return this.cv.createUpload(user.id, body);
  }

  @Get('cv-versions/:id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParamSchema }) id: string,
  ): Promise<CvVersionResponse> {
    return this.cv.get(user.id, id);
  }

  @Get('cv-versions/:id/download')
  download(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParamSchema }) id: string,
  ): Promise<PresignedUrl> {
    return this.cv.download(user.id, id);
  }

  @Post('cv-versions/:id/complete-upload')
  @HttpCode(HttpStatus.OK)
  completeUpload(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idParamSchema }) id: string,
  ): Promise<CvVersionResponse> {
    return this.cv.completeUpload(user.id, id);
  }
}
