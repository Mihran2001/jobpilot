import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service.js';
import type { RequestWithUser } from './auth.types.js';
import { IS_PUBLIC } from './public.decorator.js';
import { SESSION_COOKIE } from './session-cookie.js';

/**
 * Registered globally: a route is protected unless it says @Public(). New
 * endpoints are safe by default instead of safe if someone remembers.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token: unknown = request.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length === 0) throw new UnauthorizedException();

    const user = await this.auth.authenticate(token);
    if (!user) throw new UnauthorizedException();

    request.user = user;
    request.sessionToken = token;
    return true;
  }
}
