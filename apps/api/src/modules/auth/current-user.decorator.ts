import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser, RequestWithUser } from './auth.types.js';

/** Injects the user that SessionGuard attached to the request. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<RequestWithUser>().user;
  // Only reachable if a @Public() route asks for the user: a programming error.
  if (!user) throw new Error('CurrentUser used on a route without a session');
  return user;
});
