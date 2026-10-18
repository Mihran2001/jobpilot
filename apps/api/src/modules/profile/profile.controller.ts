import { skillProfileSchema, type SkillProfileInput } from '@jobpilot/shared';
import { Body, Controller, Get, Put } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ProfileService } from './profile.service.js';

/** Skills and requirements that listings are scored against. */
@Controller('skill-profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthUser): Promise<SkillProfileInput> {
    return this.profile.get(user.id);
  }

  @Put()
  save(
    @CurrentUser() user: AuthUser,
    @Body({ schema: skillProfileSchema }) body: SkillProfileInput,
  ): Promise<SkillProfileInput> {
    return this.profile.save(user.id, body);
  }
}
