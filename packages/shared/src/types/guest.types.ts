import { z } from 'zod';
import {
  createGuestSchema,
  resumeGuestSchema,
  guestSessionPublicSchema,
  guestAuthResponseSchema,
} from '../schemas/guest.schema';

export type CreateGuestInput = z.infer<typeof createGuestSchema>;
export type ResumeGuestInput = z.infer<typeof resumeGuestSchema>;
export type GuestSessionPublic = z.infer<typeof guestSessionPublicSchema>;
export type GuestAuthResponseData = z.infer<typeof guestAuthResponseSchema>;

export interface GuestSessionRecord {
  id: string;
  username: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  lastSeenAt: Date;
}
