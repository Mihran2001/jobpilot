import { deleteAccountSchema, type DeleteAccountInput } from '@jobpilot/shared';
import { Body, Controller, Delete, HttpCode, HttpStatus, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import { AccountService } from './account.service.js';
import type { AuthUser } from './auth.types.js';
import { CurrentUser } from './current-user.decorator.js';
import { SESSION_COOKIE, sessionCookieOptions } from './session-cookie.js';

@Controller('users')
export class AccountController {
  constructor(
    private readonly account: AccountService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Deletes the account and everything that belongs to it, files included. */
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMe(
    @CurrentUser() user: AuthUser,
    @Body({ schema: deleteAccountSchema }) body: DeleteAccountInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.account.delete(user.id, body.password);
    const { maxAge: _maxAge, ...options } = sessionCookieOptions(this.config, 0);
    res.clearCookie(SESSION_COOKIE, options);
  }
}
