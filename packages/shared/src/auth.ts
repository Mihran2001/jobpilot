import { z } from 'zod';

// Emails are compared case-insensitively by normalising them on the way in.
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const registerSchema = z.object({
  email,
  // The upper bound stops someone sending megabytes into the password hasher.
  password: z.string().min(12, 'Password must be at least 12 characters').max(128),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Deleting an account asks for the password again, so a stolen session cannot. */
export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

/** What the API returns for a user. Never includes the password hash. */
export const userResponseSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  createdAt: z.iso.datetime(),
});
export type UserResponse = z.infer<typeof userResponseSchema>;
