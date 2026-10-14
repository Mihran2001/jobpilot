import type { User } from '@jobpilot/db';
import type { UserResponse } from '@jobpilot/shared';

/**
 * Picks the fields that may leave the API. New columns on User (like
 * passwordHash) stay private unless they are added here on purpose.
 */
export function toUserResponse(user: Pick<User, 'id' | 'email' | 'createdAt'>): UserResponse {
  return { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() };
}
