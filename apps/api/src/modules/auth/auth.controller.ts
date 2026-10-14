import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
  type UserResponse,
} from '@jobpilot/shared';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import { toUserResponse } from '../users/users.mapper.js';
import { AuthService, type LoginResult } from './auth.service.js';
import type { RequestWithUser } from './auth.types.js';
import { Public } from './public.decorator.js';
import { SESSION_COOKIE, sessionCookieOptions } from './session-cookie.js';

/**
 * The HTTP edge of auth: validates bodies, sets and clears the cookie.
 * Everything else happens in AuthService, which knows nothing about HTTP.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('register')
  async register(
    @Body({ schema: registerSchema }) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserResponse> {
    return this.startSession(res, await this.auth.register(body));
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body({ schema: loginSchema }) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserResponse> {
    return this.startSession(res, await this.auth.login(body));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    if (req.sessionToken) await this.auth.logout(req.sessionToken);
    const { maxAge: _maxAge, ...options } = sessionCookieOptions(this.config, 0);
    res.clearCookie(SESSION_COOKIE, options);
  }

  private startSession(res: Response, { user, token }: LoginResult): UserResponse {
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(this.config, this.auth.sessionTtlMs));
    return toUserResponse(user);
  }
}
