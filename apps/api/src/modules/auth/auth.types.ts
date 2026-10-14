import type { Request } from 'express';

/** The logged-in user, as attached to the request by SessionGuard. */
export interface AuthUser {
  id: string;
  email: string;
}

export type RequestWithUser = Request & { user?: AuthUser; sessionToken?: string };
