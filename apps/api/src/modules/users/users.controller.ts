import type { UserResponse } from '@jobpilot/shared';
import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { toUserResponse } from './users.mapper.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() current: AuthUser): Promise<UserResponse> {
    return toUserResponse(await this.users.getById(current.id));
  }
}
