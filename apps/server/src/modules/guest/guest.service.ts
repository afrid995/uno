import { v4 as uuidv4 } from 'uuid';
import { prisma, GuestSession } from '@uno-ultimate/database';
import { HTTP_STATUS, ERROR_CODES, GuestSessionPublic } from '@uno-ultimate/shared';
import { env } from '../../config/env';
import { generateSessionToken, hashSessionToken, timingSafeCompare } from '../../utils/crypto';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

export interface CreateGuestResult {
  guest: GuestSessionPublic;
  rawSessionToken: string;
}

export class GuestService {
  /**
   * Formats a database GuestSession record into a safe public representation.
   * Strips out internal security fields like tokenHash.
   */
  private toPublicGuest(session: GuestSession): GuestSessionPublic {
    return {
      id: session.id,
      username: session.username,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
    };
  }

  /**
   * Creates a new guest session.
   * Duplicate usernames are allowed; identity is governed by unique server-generated UUID.
   */
  async createGuest(username: string): Promise<CreateGuestResult> {
    const guestId = uuidv4();
    const rawSessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawSessionToken);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.SESSION_EXPIRATION_HOURS * 60 * 60 * 1000);

    const session = await prisma.guestSession.create({
      data: {
        id: guestId,
        username,
        tokenHash,
        createdAt: now,
        expiresAt,
        lastSeenAt: now,
      },
    });

    logger.info('New guest session established', {
      guestId: session.id,
      username: session.username,
      expiresAt: session.expiresAt.toISOString(),
    });

    return {
      guest: this.toPublicGuest(session),
      rawSessionToken,
    };
  }

  /**
   * Resumes and validates an existing guest session.
   * Server validates session validity, expiration, and prevents ID impersonation.
   */
  async resumeGuest(rawSessionToken: string, claimedGuestId?: string): Promise<GuestSessionPublic> {
    if (!rawSessionToken || typeof rawSessionToken !== 'string') {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.SESSION_INVALID,
        'A valid session token is required to resume session.'
      );
    }

    const calculatedTokenHash = hashSessionToken(rawSessionToken);

    // Look up session by cryptographic token hash in database
    const session = await prisma.guestSession.findUnique({
      where: {
        tokenHash: calculatedTokenHash,
      },
    });

    if (!session) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.SESSION_NOT_FOUND,
        'Guest session not found or token is invalid.'
      );
    }

    // Double check with timing-safe comparison
    if (!timingSafeCompare(session.tokenHash, calculatedTokenHash)) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.SESSION_INVALID,
        'Invalid session token verification.'
      );
    }

    // Verify session expiration
    const now = new Date();
    if (session.expiresAt.getTime() <= now.getTime()) {
      logger.warn('Attempted to resume expired guest session', {
        guestId: session.id,
        expiredAt: session.expiresAt.toISOString(),
      });
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.SESSION_EXPIRED,
        'Guest session has expired. Please enter your name again to start a new session.'
      );
    }

    // Security Check: If client explicitly provided a guest ID, it MUST match the token's owner
    if (claimedGuestId && claimedGuestId !== session.id) {
      logger.warn('Security alert: Guest ID impersonation attempt detected', {
        claimedGuestId,
        actualGuestId: session.id,
      });
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.SESSION_IMPERSONATION,
        'Security rejection: Provided guest ID does not match the authenticated session.'
      );
    }

    // Update lastSeenAt timestamp
    const updatedSession = await prisma.guestSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });

    logger.info('Guest session successfully resumed', {
      guestId: updatedSession.id,
      username: updatedSession.username,
    });

    return this.toPublicGuest(updatedSession);
  }

  /**
   * Internal lookup to validate guest session for Socket.IO connection handshake.
   */
  async validateTokenForSocket(rawSessionToken: string): Promise<GuestSessionPublic | null> {
    try {
      return await this.resumeGuest(rawSessionToken);
    } catch {
      return null;
    }
  }
}

export const guestService = new GuestService();
