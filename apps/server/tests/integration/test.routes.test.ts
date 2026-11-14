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

describe('Test Helper Routes Integration & Invariant Hardening Tests', () => {
  const originalEnvHelpers = process.env.ENABLE_TEST_HELPERS;
  const originalNodeEnv = process.env.NODE_ENV;

  let app: ReturnType<typeof createApp>;
  let hostGuestId: string;
  let opponentGuestId: string;
  let testRoomId: string;
  let testRoomCode: string;
  let matchId: string;
  let baseInitialState: GameState;

  beforeAll(async () => {
    process.env.ENABLE_TEST_HELPERS = 'true';
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

  describe('Security & Environment Gating', () => {
    it('returns 403 Forbidden when ENABLE_TEST_HELPERS is not "true"', async () => {
      process.env.ENABLE_TEST_HELPERS = 'false';

      const res = await request(app)
        .post('/api/test/inject-flip-card')
        .send({ roomCode: testRoomCode });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');

      process.env.ENABLE_TEST_HELPERS = 'true';
    });

    it('rejects test router directly when NODE_ENV === "production"', async () => {
      process.env.NODE_ENV = 'production';

      const express = (await import('express')).default;
      const prodApp = express();
      prodApp.use(express.json());
      prodApp.use('/test', testRouter);

      const res = await request(prodApp)
        .post('/test/inject-flip-card')
        .send({ roomCode: testRoomCode });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');

      process.env.NODE_ENV = 'test';
    });
  });

  describe('Validation & Precondition Checks', () => {
    it('rejects invalid payload when roomCode is empty', async () => {
      const res = await request(app)
        .post('/api/test/inject-flip-card')
        .send({ roomCode: '' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('rejects when active session does not exist for roomCode', async () => {
      const res = await request(app)
        .post('/api/test/inject-flip-card')
        .send({ roomCode: 'NONEXIST' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects when match variant is not uno_flip', async () => {
      const currentSession = gameSessionManager.getSessionByRoomCode(testRoomCode)!;
      currentSession.state = {
        ...currentSession.state,
        variant: 'classic' as any,
      };

      const res = await request(app)
        .post('/api/test/inject-flip-card')
        .send({ roomCode: testRoomCode });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_VARIANT');
    });

    it('rejects when match status is not IN_PROGRESS', async () => {
      const currentSession = gameSessionManager.getSessionByRoomCode(testRoomCode)!;
      currentSession.state = {
        ...currentSession.state,
        status: 'COMPLETED',
      };

      const res = await request(app)
        .post('/api/test/inject-flip-card')
        .send({ roomCode: testRoomCode });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MATCH_NOT_ACTIVE');
    });
  });

  describe('POST /api/test/inject-flip-card (Safe Physical Swapping)', () => {
    it('safely injects a playable Flip card while preserving 112 physical cards and unique IDs', async () => {
      const sessionBefore = gameSessionManager.getSessionByRoomCode(testRoomCode)!;
      const initialPlayerHand = [...sessionBefore.state.players[0].hand];

      const res = await request(app)
        .post('/api/test/inject-flip-card')
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
  });

  describe('POST /api/test/inject-starting-wild', () => {
    it('safely configures starting Wild state while preserving 112 physical cards', async () => {
      const res = await request(app)
        .post('/api/test/inject-starting-wild')
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
  });

  describe('GET /api/test/verify-invariants/:roomCode', () => {
    it('returns valid: true and totalCards: 112 for a compliant session', async () => {
      const res = await request(app).get(`/api/test/verify-invariants/${testRoomCode}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.valid).toBe(true);
      expect(res.body.totalCards).toBe(112);
      expect(res.body.activeSide).toBe('LIGHT');
      expect(res.body.errors).toEqual([]);
    });

    it('returns 404 when verifying invariants for non-existent room', async () => {
      const res = await request(app).get('/api/test/verify-invariants/NONEX1');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Database Persistence-First Rollback & Mutex Concurrency', () => {
    it('rolls back and leaves in-memory state unmodified if database persistence fails', async () => {
      const sessionBefore = gameSessionManager.getSessionByRoomCode(testRoomCode)!;
      const originalStateSnapshot = JSON.parse(JSON.stringify(sessionBefore.state));

      // Spy on persistActionBatch to simulate an unexpected database failure
      const persistSpy = vi
        .spyOn(gamePersistenceService, 'persistActionBatch')
        .mockRejectedValueOnce(new Error('Simulated database deadlock / network failure'));

      const res = await request(app)
        .post('/api/test/inject-flip-card')
        .send({ roomCode: testRoomCode });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Simulated database deadlock');

      // Crucial: in-memory state MUST NOT have been updated!
      const sessionAfter = gameSessionManager.getSessionByRoomCode(testRoomCode)!;
      expect(sessionAfter.state.sequenceNumber).toBe(originalStateSnapshot.sequenceNumber);
      expect(sessionAfter.state.players[0].hand).toEqual(originalStateSnapshot.players[0].hand);

      persistSpy.mockRestore();
    });

    it('serializes concurrent requests via match mutex without state corruption', async () => {
      const calls = [
        request(app).post('/api/test/inject-flip-card').send({ roomCode: testRoomCode }),
        request(app).post('/api/test/inject-flip-card').send({ roomCode: testRoomCode }),
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
});
