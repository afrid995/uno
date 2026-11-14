import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { createApp } from '../../src/app';
import testRouter from '../../src/routes/test.routes';
import { prisma } from '@uno-ultimate/database';
import { guestService } from '../../src/modules/guest/guest.service';
import { roomService } from '../../src/modules/room/room.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { gamePersistenceService } from '../../src/modules/game/game.persistence.service';
import {
  FlipFixtureBuilder,
  validateFlipGameStateInvariants,
  GameState,
} from '@uno-ultimate/game-engine';

describe('Test Helper Routes Security Access & Invariant Hardening Tests', () => {
  const originalEnvHelpers = process.env.ENABLE_TEST_HELPERS;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.TEST_HELPER_SECRET;

  const VALID_TEST_SECRET = 'valid_test_secret_for_vitest_auth_at_least_16_chars';
  const WRONG_TEST_SECRET = 'invalid_test_secret_wrong_token_for_negative_tests';
  const SECRET_HEADER = 'X-Test-Helper-Secret';

  let app: ReturnType<typeof createApp>;
  let hostGuestId: string;
  let opponentGuestId: string;
  let testRoomId: string;
  let testRoomCode: string;
  let matchId: string;
  let baseInitialState: GameState;

  beforeAll(async () => {
    process.env.ENABLE_TEST_HELPERS = 'true';
    process.env.TEST_HELPER_SECRET = VALID_TEST_SECRET;
    app = createApp();

    // Clean up any leftovers
    await prisma.gameEvent.deleteMany({
      where: { match: { room: { host: { username: { startsWith: 'TestFixture_' } } } } },
    });
    await prisma.gameSnapshot.deleteMany({
      where: { match: { room: { host: { username: { startsWith: 'TestFixture_' } } } } },
    });
    await prisma.matchPlayer.deleteMany({
      where: { match: { room: { host: { username: { startsWith: 'TestFixture_' } } } } },
    });
    await prisma.match.deleteMany({
      where: { room: { host: { username: { startsWith: 'TestFixture_' } } } },
    });
    await prisma.roomMember.deleteMany({
      where: { guest: { username: { startsWith: 'TestFixture_' } } },
    });
    await prisma.room.deleteMany({
      where: { host: { username: { startsWith: 'TestFixture_' } } },
    });
    await prisma.guestSession.deleteMany({
      where: { username: { startsWith: 'TestFixture_' } },
    });

    // Create guests
    const host = await guestService.createGuest('TestFixture_Host');
    hostGuestId = host.guest.id;
    const opponent = await guestService.createGuest('TestFixture_Opponent');
    opponentGuestId = opponent.guest.id;

    // Create room
    const room = await roomService.createRoom(hostGuestId, 2);
    testRoomId = room.id;
    testRoomCode = room.roomCode;
    await roomService.joinRoom(opponentGuestId, testRoomCode);

    // Create initial match and game state fixture
    matchId = uuidv4();
    baseInitialState = FlipFixtureBuilder.createInitialGameFixture({
      matchId,
      players: [
        { id: hostGuestId, username: 'TestFixture_Host' },
        { id: opponentGuestId, username: 'TestFixture_Opponent' },
      ],
      activeSide: 'LIGHT',
    });

    await gamePersistenceService.createMatch(
      matchId,
      testRoomId,
      'uno_flip',
      [
        { guestId: hostGuestId, seatIndex: 0 },
        { guestId: opponentGuestId, seatIndex: 1 },
      ],
      baseInitialState
    );
  });

  afterAll(async () => {
    process.env.ENABLE_TEST_HELPERS = originalEnvHelpers;
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSecret !== undefined) {
      process.env.TEST_HELPER_SECRET = originalSecret;
    } else {
      delete process.env.TEST_HELPER_SECRET;
    }

    gameSessionManager.removeSession(matchId);

    await prisma.gameEvent.deleteMany({
      where: { match: { room: { host: { username: { startsWith: 'TestFixture_' } } } } },
    });
    await prisma.gameSnapshot.deleteMany({
      where: { match: { room: { host: { username: { startsWith: 'TestFixture_' } } } } },
    });
    await prisma.matchPlayer.deleteMany({
      where: { match: { room: { host: { username: { startsWith: 'TestFixture_' } } } } },
    });
    await prisma.match.deleteMany({
      where: { room: { host: { username: { startsWith: 'TestFixture_' } } } },
    });
    await prisma.roomMember.deleteMany({
      where: { guest: { username: { startsWith: 'TestFixture_' } } },
    });
    await prisma.room.deleteMany({
      where: { host: { username: { startsWith: 'TestFixture_' } } },
    });
    await prisma.guestSession.deleteMany({
      where: { username: { startsWith: 'TestFixture_' } },
    });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    // Reset session in gameSessionManager before each test
    const freshState = FlipFixtureBuilder.createInitialGameFixture({
      matchId,
      players: [
        { id: hostGuestId, username: 'TestFixture_Host' },
        { id: opponentGuestId, username: 'TestFixture_Opponent' },
      ],
      activeSide: 'LIGHT',
    });
    gameSessionManager.setSession(matchId, testRoomCode, testRoomId, freshState);
  });

  describe('1. Secret Header Authentication & Uniform Enforcement', () => {
    it('rejects POST /inject-flip-card with 401 when X-Test-Helper-Secret header is missing', async () => {
      const res = await request(app)
        .post('/api/test/inject-flip-card')
        .send({ roomCode: testRoomCode });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('Missing test helper secret header');
    });

    it('rejects POST /inject-starting-wild with 401 when X-Test-Helper-Secret header is missing', async () => {
      const res = await request(app)
        .post('/api/test/inject-starting-wild')
        .send({ roomCode: testRoomCode });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('Missing test helper secret header');
    });

    it('rejects GET /verify-invariants/:roomCode with 401 when X-Test-Helper-Secret header is missing', async () => {
      const res = await request(app)
        .get(`/api/test/verify-invariants/${testRoomCode}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('Missing test helper secret header');
    });

    it('rejects POST /inject-flip-card with 401 when X-Test-Helper-Secret is incorrect', async () => {
      const res = await request(app)
        .post('/api/test/inject-flip-card')
        .set(SECRET_HEADER, WRONG_TEST_SECRET)
        .send({ roomCode: testRoomCode });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('Invalid test helper secret');
    });

    it('rejects POST /inject-starting-wild with 401 when X-Test-Helper-Secret is incorrect', async () => {
      const res = await request(app)
        .post('/api/test/inject-starting-wild')
        .set(SECRET_HEADER, WRONG_TEST_SECRET)
        .send({ roomCode: testRoomCode });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('Invalid test helper secret');
    });

    it('rejects GET /verify-invariants/:roomCode with 401 when X-Test-Helper-Secret is incorrect', async () => {
      const res = await request(app)
        .get(`/api/test/verify-invariants/${testRoomCode}`)
        .set(SECRET_HEADER, WRONG_TEST_SECRET);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('Invalid test helper secret');
    });

    it('succeeds with 200 when correct X-Test-Helper-Secret is provided and all gates pass', async () => {
      const res = await request(app)
        .get(`/api/test/verify-invariants/${testRoomCode}`)
        .set(SECRET_HEADER, VALID_TEST_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.valid).toBe(true);
      expect(res.body.totalCards).toBe(112);
    });
  });

  describe('2. Environment & Server Configuration Gates (Fail-Closed)', () => {
    it('disables endpoints with 403 when server-side TEST_HELPER_SECRET is missing', async () => {
      const previous = process.env.TEST_HELPER_SECRET;
      delete process.env.TEST_HELPER_SECRET;

      try {
        const res = await request(app)
          .post('/api/test/inject-flip-card')
          .set(SECRET_HEADER, VALID_TEST_SECRET)
          .send({ roomCode: testRoomCode });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('FORBIDDEN');
      } finally {
        process.env.TEST_HELPER_SECRET = previous;
      }
    });

    it('disables endpoints with 403 when server-side TEST_HELPER_SECRET is too short (<16 chars)', async () => {
      const previous = process.env.TEST_HELPER_SECRET;
      process.env.TEST_HELPER_SECRET = 'short_secret';

      try {
        const res = await request(app)
          .post('/api/test/inject-flip-card')
          .set(SECRET_HEADER, 'short_secret')
          .send({ roomCode: testRoomCode });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('FORBIDDEN');
      } finally {
        process.env.TEST_HELPER_SECRET = previous;
      }
    });

    it('disables endpoints with 403 when ENABLE_TEST_HELPERS is "false" even with valid secret header', async () => {
      const previous = process.env.ENABLE_TEST_HELPERS;
      process.env.ENABLE_TEST_HELPERS = 'false';

      try {
        const res = await request(app)
          .post('/api/test/inject-flip-card')
          .set(SECRET_HEADER, VALID_TEST_SECRET)
          .send({ roomCode: testRoomCode });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('FORBIDDEN');
      } finally {
        process.env.ENABLE_TEST_HELPERS = previous;
      }
    });

    it('disables endpoints with 403 when router is executed directly under NODE_ENV === "production"', async () => {
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const express = (await import('express')).default;
        const prodApp = express();
        prodApp.use(express.json());
        prodApp.use('/test', testRouter);

        const res = await request(prodApp)
          .post('/test/inject-flip-card')
          .set(SECRET_HEADER, VALID_TEST_SECRET)
          .send({ roomCode: testRoomCode });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('FORBIDDEN');
      } finally {
        process.env.NODE_ENV = previous;
      }
    });
  });

  describe('3. State Protection: Unauthorized Requests Never Mutate Game State', () => {
    it('guarantees unauthenticated requests do not mutate memory or persist to database', async () => {
      const sessionBefore = gameSessionManager.getSessionByRoomCode(testRoomCode)!;
      const originalHandBefore = [...sessionBefore.state.players[0].hand];
      const originalSeqBefore = sessionBefore.state.sequenceNumber;

      const eventsBefore = await prisma.gameEvent.count({ where: { matchId } });

      // Send unauthorized request
      const res = await request(app)
        .post('/api/test/inject-flip-card')
        .send({ roomCode: testRoomCode });

      expect(res.status).toBe(401);

      // Verify in-memory state is completely untouched
      const sessionAfter = gameSessionManager.getSessionByRoomCode(testRoomCode)!;
      expect(sessionAfter.state.sequenceNumber).toBe(originalSeqBefore);
      expect(sessionAfter.state.players[0].hand).toEqual(originalHandBefore);

      // Verify database has no new persisted events
      const eventsAfter = await prisma.gameEvent.count({ where: { matchId } });
      expect(eventsAfter).toBe(eventsBefore);
    });
  });

  describe('4. Post-Authentication Payload Validation & Preconditions', () => {
    it('rejects invalid payload when roomCode is empty after passing authentication', async () => {
      const res = await request(app)
        .post('/api/test/inject-flip-card')
        .set(SECRET_HEADER, VALID_TEST_SECRET)
        .send({ roomCode: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('rejects when active session does not exist for roomCode after passing authentication', async () => {
      const res = await request(app)
        .post('/api/test/inject-flip-card')
        .set(SECRET_HEADER, VALID_TEST_SECRET)
        .send({ roomCode: 'NONEXIST' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects when match variant is not uno_flip after passing authentication', async () => {
      const currentSession = gameSessionManager.getSessionByRoomCode(testRoomCode)!;
      currentSession.state = {
        ...currentSession.state,
        variant: 'classic' as any,
      };

      const res = await request(app)
        .post('/api/test/inject-flip-card')
        .set(SECRET_HEADER, VALID_TEST_SECRET)
        .send({ roomCode: testRoomCode });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_VARIANT');
    });

    it('rejects when match status is not IN_PROGRESS after passing authentication', async () => {
      const currentSession = gameSessionManager.getSessionByRoomCode(testRoomCode)!;
      currentSession.state = {
        ...currentSession.state,
        status: 'COMPLETED',
      };

      const res = await request(app)
        .post('/api/test/inject-flip-card')
        .set(SECRET_HEADER, VALID_TEST_SECRET)
        .send({ roomCode: testRoomCode });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MATCH_NOT_ACTIVE');
    });
  });

  describe('5. Authenticated Core Fixture Operations (112-Card Conservation)', () => {
    it('safely injects a playable Flip card while preserving 112 physical cards and unique IDs', async () => {
      const sessionBefore = gameSessionManager.getSessionByRoomCode(testRoomCode)!;
      const initialPlayerHand = [...sessionBefore.state.players[0].hand];

      const res = await request(app)
        .post('/api/test/inject-flip-card')
        .set(SECRET_HEADER, VALID_TEST_SECRET)
        .send({ roomCode: testRoomCode, targetPlayerId: hostGuestId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.cardId).toBeDefined();
      expect(res.body.data.activeSide).toBe('LIGHT');

      const sessionAfter = gameSessionManager.getSessionByRoomCode(testRoomCode)!;
      const targetPlayer = sessionAfter.state.players.find((p) => p.id === hostGuestId)!;

      // Injected card is in target hand
      const hasFlipCard = targetPlayer.hand.some((c) => c.id === res.body.data.cardId);
      expect(hasFlipCard).toBe(true);

      // Hand size is invariant
      expect(targetPlayer.hand.length).toBe(initialPlayerHand.length);

      // Strict 112 card invariant holds
      const validation = validateFlipGameStateInvariants(sessionAfter.state);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('safely configures starting Wild state while preserving 112 physical cards', async () => {
      const res = await request(app)
        .post('/api/test/inject-starting-wild')
        .set(SECRET_HEADER, VALID_TEST_SECRET)
        .send({ roomCode: testRoomCode });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cardId).toBeDefined();
      expect(res.body.data.designatedPlayerId).toBe(opponentGuestId);

      const sessionAfter = gameSessionManager.getSessionByRoomCode(testRoomCode)!;
      const topDiscard = sessionAfter.state.discardPile[sessionAfter.state.discardPile.length - 1];

      expect(topDiscard.type).toBe('wild');
      expect(sessionAfter.state.activeColor).toBeNull();
      expect(sessionAfter.state.pendingActionState?.type).toBe(
        'AWAITING_STARTING_WILD_COLOR_SELECTION'
      );

      // Strict 112 card invariant holds
      const validation = validateFlipGameStateInvariants(sessionAfter.state);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('returns valid: true and totalCards: 112 on authenticated verification endpoint', async () => {
      const res = await request(app)
        .get(`/api/test/verify-invariants/${testRoomCode}`)
        .set(SECRET_HEADER, VALID_TEST_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.valid).toBe(true);
      expect(res.body.totalCards).toBe(112);
      expect(res.body.activeSide).toBe('LIGHT');
      expect(res.body.errors).toEqual([]);
    });
  });

  describe('6. Database Persistence-First Rollback & Mutex Concurrency', () => {
    it('rolls back and leaves in-memory state unmodified if database persistence fails', async () => {
      const sessionBefore = gameSessionManager.getSessionByRoomCode(testRoomCode)!;
      const originalStateSnapshot = JSON.parse(JSON.stringify(sessionBefore.state));

      // Spy on persistActionBatch to simulate an unexpected database failure
      const persistSpy = vi
        .spyOn(gamePersistenceService, 'persistActionBatch')
        .mockRejectedValueOnce(new Error('Simulated database deadlock / network failure'));

      try {
        const res = await request(app)
          .post('/api/test/inject-flip-card')
          .set(SECRET_HEADER, VALID_TEST_SECRET)
          .send({ roomCode: testRoomCode });

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        expect(res.body.error.message).toContain('Simulated database deadlock');

        // Crucial: in-memory state MUST NOT have been updated!
        const sessionAfter = gameSessionManager.getSessionByRoomCode(testRoomCode)!;
        expect(sessionAfter.state.sequenceNumber).toBe(originalStateSnapshot.sequenceNumber);
        expect(sessionAfter.state.players[0].hand).toEqual(originalStateSnapshot.players[0].hand);
      } finally {
        persistSpy.mockRestore();
      }
    });

    it('serializes concurrent authenticated requests via match mutex without state corruption', async () => {
      const calls = [
        request(app)
          .post('/api/test/inject-flip-card')
          .set(SECRET_HEADER, VALID_TEST_SECRET)
          .send({ roomCode: testRoomCode }),
        request(app)
          .post('/api/test/inject-flip-card')
          .set(SECRET_HEADER, VALID_TEST_SECRET)
          .send({ roomCode: testRoomCode }),
      ];

      const results = await Promise.all(calls);
      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }

      const sessionAfter = gameSessionManager.getSessionByRoomCode(testRoomCode)!;
      const validation = validateFlipGameStateInvariants(sessionAfter.state);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });
  });

  describe('7. Locked Precondition Verification & Race-Condition Prevention', () => {
    it('rejects /inject-flip-card if match becomes COMPLETED while request is queued behind mutex', async () => {
      const sessionBefore = gameSessionManager.getSessionByRoomCode(testRoomCode)!;
      const initialHand = [...sessionBefore.state.players[0].hand];
      const eventsBefore = await prisma.gameEvent.count({ where: { matchId } });

      let releaseBlocker: () => void = () => {};
      const blockerPromise = new Promise<void>((resolve) => {
        releaseBlocker = resolve;
      });

      // 1. Acquire mutex lock first and hold it with controlled promise
      const lockHold = gameSessionManager.runWithLock(matchId, async (lockedSession) => {
        // Concurrently mutate status to COMPLETED while holding the mutex
        lockedSession.state = {
          ...lockedSession.state,
          status: 'COMPLETED',
        };
        await blockerPromise;
      });

      // 2. Dispatch fixture request (it enters queue behind lockHold)
      const fixtureReqPromise = request(app)
        .post('/api/test/inject-flip-card')
        .set(SECRET_HEADER, VALID_TEST_SECRET)
        .send({ roomCode: testRoomCode });

      // 3. Release the lock holder
      releaseBlocker();
      await lockHold;

      // 4. Await fixture request response
      const res = await fixtureReqPromise;

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MATCH_NOT_ACTIVE');
      expect(res.body.error.message).toContain('Match must be IN_PROGRESS');

      // 5. Verify NO fixture mutation occurred
      const sessionAfter = gameSessionManager.getSessionByRoomCode(testRoomCode)!;
      expect(sessionAfter.state.players[0].hand).toEqual(initialHand);

      // 6. Verify NO database persistence occurred
      const eventsAfter = await prisma.gameEvent.count({ where: { matchId } });
      expect(eventsAfter).toBe(eventsBefore);
    });

    it('rejects /inject-flip-card if match variant changes while request is queued behind mutex', async () => {
      let releaseBlocker: () => void = () => {};
      const blockerPromise = new Promise<void>((resolve) => {
        releaseBlocker = resolve;
      });

      // 1. Acquire lock and change variant while holding it
      const lockHold = gameSessionManager.runWithLock(matchId, async (lockedSession) => {
        lockedSession.state = {
          ...lockedSession.state,
          variant: 'classic' as any,
        };
        await blockerPromise;
      });

      // 2. Dispatch fixture request
      const fixtureReqPromise = request(app)
        .post('/api/test/inject-flip-card')
        .set(SECRET_HEADER, VALID_TEST_SECRET)
        .send({ roomCode: testRoomCode });

      // 3. Release blocker
      releaseBlocker();
      await lockHold;

      const res = await fixtureReqPromise;

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_VARIANT');
      expect(res.body.error.message).toContain('Test fixture is only valid for UNO Flip matches');
    });

    it('rejects /inject-starting-wild if match becomes COMPLETED while request is queued behind mutex', async () => {
      let releaseBlocker: () => void = () => {};
      const blockerPromise = new Promise<void>((resolve) => {
        releaseBlocker = resolve;
      });

      const lockHold = gameSessionManager.runWithLock(matchId, async (lockedSession) => {
        lockedSession.state = {
          ...lockedSession.state,
          status: 'COMPLETED',
        };
        await blockerPromise;
      });

      const fixtureReqPromise = request(app)
        .post('/api/test/inject-starting-wild')
        .set(SECRET_HEADER, VALID_TEST_SECRET)
        .send({ roomCode: testRoomCode });

      releaseBlocker();
      await lockHold;

      const res = await fixtureReqPromise;

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MATCH_NOT_ACTIVE');
    });

    it('rejects /inject-starting-wild if match variant changes while request is queued behind mutex', async () => {
      let releaseBlocker: () => void = () => {};
      const blockerPromise = new Promise<void>((resolve) => {
        releaseBlocker = resolve;
      });

      const lockHold = gameSessionManager.runWithLock(matchId, async (lockedSession) => {
        lockedSession.state = {
          ...lockedSession.state,
          variant: 'classic' as any,
        };
        await blockerPromise;
      });

      const fixtureReqPromise = request(app)
        .post('/api/test/inject-starting-wild')
        .set(SECRET_HEADER, VALID_TEST_SECRET)
        .send({ roomCode: testRoomCode });

      releaseBlocker();
      await lockHold;

      const res = await fixtureReqPromise;

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_VARIANT');
    });

    it('serializes /verify-invariants under mutex so verification inspects a stable state', async () => {
      let releaseBlocker: () => void = () => {};
      const blockerPromise = new Promise<void>((resolve) => {
        releaseBlocker = resolve;
      });

      let mutationFinished = false;

      // 1. Acquire lock and simulate an in-flight mutation
      const lockHold = gameSessionManager.runWithLock(matchId, async () => {
        await blockerPromise;
        mutationFinished = true;
      });

      // 2. Dispatch verification request
      const verifyPromise = request(app)
        .get(`/api/test/verify-invariants/${testRoomCode}`)
        .set(SECRET_HEADER, VALID_TEST_SECRET);

      // Verify that verifyPromise does not resolve until lockHold releases
      expect(mutationFinished).toBe(false);

      releaseBlocker();
      await lockHold;

      const res = await verifyPromise;
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.valid).toBe(true);
      expect(res.body.totalCards).toBe(112);
      expect(mutationFinished).toBe(true);
    });
  });
});
