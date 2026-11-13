import { z } from 'zod';
import { USERNAME_RULES } from '../constants';

export const usernameSchema = z
  .string()
  .transform((val) => val.trim())
  .pipe(
    z
      .string()
      .min(1, { message: 'Username cannot be empty.' })
      .min(USERNAME_RULES.MIN_LENGTH, {
        message: `Username must be at least ${USERNAME_RULES.MIN_LENGTH} characters long.`,
      })
      .max(USERNAME_RULES.MAX_LENGTH, {
        message: `Username must not exceed ${USERNAME_RULES.MAX_LENGTH} characters.`,
      })
      // eslint-disable-next-line no-control-regex
      .refine((val) => !/[\u0000-\u001F\u007F-\u009F]/.test(val), {
        message: 'Username contains invalid control characters.',
      })
      .refine((val) => USERNAME_RULES.PATTERN.test(val), {
        message: 'Username can only contain letters, numbers, spaces, underscores, dots, and hyphens.',
      })
  );

export const createGuestSchema = z.object({
  username: usernameSchema,
});

export const resumeGuestSchema = z.object({
  sessionToken: z.string().min(10, { message: 'Invalid session token format.' }).optional(),
  guestId: z.string().uuid({ message: 'Invalid guest ID format.' }).optional(),
});

export const guestSessionPublicSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  lastSeenAt: z.string(),
});

export const guestAuthResponseSchema = z.object({
  guest: guestSessionPublicSchema,
  sessionToken: z.string(),
});
