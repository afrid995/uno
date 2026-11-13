import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@uno-ultimate/database';
import { guestService } from '../../src/modules/guest/guest.service';
import { hashSessionToken } from '../../src/utils/crypto';
import { ERROR_CODES } from '@uno-ultimate/shared';
import { AppError } from '../../src/middleware/errorHandler';

describe('GuestService Unit Tests', () => {
  beforeAll(async () => {
    // Clean up test sessions
    await prisma.guestSession.deleteMany({
      where: { username: { startsWith: 'TestPlayer_' } },
    });
  });

  afterAll(async () => {
    await prisma.guestSession.deleteMany({
      where: { username: { startsWith: 'TestPlayer_' } },
    });
    await prisma.$disconnect();
  });

  it('creates a guest session with UUID, token, and safe public fields', async () => {
    const username = 'TestPlayer_1';
    const result = await guestService.createGuest(username);

    expect(result.guest).toBeDefined();
    expect(result.guest.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(result.guest.username).toBe(username);
    expect(result.rawSessionToken).toHaveLength(64);

    // Verify tokenHash is NOT exposed in the public guest object
    expect((result.guest as Record<string, unknown>).tokenHash).toBeUndefined();

    // Verify record in database
    const dbRecord = await prisma.guestSession.findUnique({
      where: { id: result.guest.id },
    });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.username).toBe(username);
    expect(dbRecord?.tokenHash).toBe(hashSessionToken(result.rawSessionToken));
  });

  it('allows duplicate usernames with distinct guest IDs and tokens', async () => {
    const duplicateName = 'TestPlayer_Dup';
    const guest1 = await guestService.createGuest(duplicateName);
    const guest2 = await guestService.createGuest(duplicateName);

    expect(guest1.guest.username).toBe(duplicateName);
    expect(guest2.guest.username).toBe(duplicateName);
    expect(guest1.guest.id).not.toBe(guest2.guest.id);
    expect(guest1.rawSessionToken).not.toBe(guest2.rawSessionToken);
  });

  it('successfully resumes a valid guest session', async () => {
    const created = await guestService.createGuest('TestPlayer_Resume');
    const resumed = await guestService.resumeGuest(created.rawSessionToken);

    expect(resumed.id).toBe(created.guest.id);
    expect(resumed.username).toBe('TestPlayer_Resume');
    expect(new Date(resumed.lastSeenAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.guest.createdAt).getTime()
    );
  });

  it('rejects an invalid session token', async () => {
    const invalidToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    await expect(guestService.resumeGuest(invalidToken)).rejects.toThrow(AppError);

    try {
      await guestService.resumeGuest(invalidToken);
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe(ERROR_CODES.SESSION_NOT_FOUND);
    }
  });

  it('rejects an expired guest session', async () => {
    // Create an expired session directly in DB
    const expiredToken = 'expired_token_1234567890abcdef1234567890abcdef1234567890abcdef1234';
    const expiredHash = hashSessionToken(expiredToken);

    const expiredSession = await prisma.guestSession.create({
      data: {
        username: 'TestPlayer_Expired',
        tokenHash: expiredHash,
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
        createdAt: new Date(Date.now() - 7200000),
      },
    });

    await expect(guestService.resumeGuest(expiredToken)).rejects.toThrow(AppError);

    try {
      await guestService.resumeGuest(expiredToken);
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe(ERROR_CODES.SESSION_EXPIRED);
    }

    // Clean up
    await prisma.guestSession.delete({ where: { id: expiredSession.id } });
  });

  it('prevents client-supplied guest ID impersonation', async () => {
    const victim = await guestService.createGuest('TestPlayer_Victim');
    const attacker = await guestService.createGuest('TestPlayer_Attacker');

    // Attacker uses their own valid session token, but attempts to claim victim's guestId
    await expect(
      guestService.resumeGuest(attacker.rawSessionToken, victim.guest.id)
    ).rejects.toThrow(AppError);

    try {
      await guestService.resumeGuest(attacker.rawSessionToken, victim.guest.id);
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe(ERROR_CODES.SESSION_IMPERSONATION);
    }
  });
});
