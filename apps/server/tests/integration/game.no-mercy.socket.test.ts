import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { guestService } from '../../src/modules/guest/guest.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { cancelAllCountdownTimersForTesting } from '../../src/sockets/roomSocketHandler';
import { SOCKET_EVENTS, PlayerGameState } from '@uno-ultimate/game-protocol';
import { NoMercyFixtureBuilder, assertValidNoMercyGameState } from '@uno-ultimate/game-engine';
import { gamePersistenceService } from '../../src/modules/game/game.persistence.service';
import request from 'supertest';

describe('UNO Show \'em No Mercy — Server Socket.IO Multiplayer Integration Tests', () => {
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  let activeClients: ClientSocket[] = [];

  let p1Id: string;
  let p1Token: string;
  let p2Id: string;
  let p2Token: string;
  let p3Id: string;
  let p3Token: string;

  beforeAll(async () => {
    httpServer = createServer(createApp());
    initializeSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 4002;
        resolve();
      });
    });

    const s1 = await guestService.createGuest('MercyHost');
    p1Id = s1.guest.id;
    p1Token = s1.rawSessionToken;

    const s2 = await guestService.createGuest('MercyPlayer2');
    p2Id = s2.guest.id;
    p2Token = s2.rawSessionToken;

    const s3 = await guestService.createGuest('MercyPlayer3');
    p3Id = s3.guest.id;
    p3Token = s3.rawSessionToken;
  });

  afterAll(async () => {
    for (const client of activeClients) {
      if (client.connected) client.disconnect();
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  afterEach(() => {
    cancelAllCountdownTimersForTesting();
    for (const client of activeClients) {
      if (client.connected) client.disconnect();
    }
    activeClients = [];
  });

  const createClient = (token?: string): ClientSocket => {
    const socket = ioClient(`http://localhost:${port}`, {
      auth: token ? { token } : undefined,
      transports: ['websocket'],
      forceNew: true,
      autoConnect: true,
    });
    activeClients.push(socket);
    return socket;
  };

  it('creates and starts a No Mercy match: enforces 2-6 player rules, 168-card deck, and opening number card', async () => {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);

    await Promise.all([
      new Promise<void>((res) => s1.on('connect', res)),
      new Promise<void>((res) => s2.on('connect', res)),
    ]);

    // 1. Host creates room with variant 'uno_show_em_no_mercy'
    const createAck = await new Promise<any>((resolve) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 6, settings: { variant: 'uno_show_em_no_mercy' } },
        resolve
      );
    });
    expect(createAck.success).toBe(true);
    const roomCode = createAck.data.roomCode;
    expect(createAck.data.settings.variant).toBe('uno_show_em_no_mercy');

    // 2. Player 2 joins and marks ready
    await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });
    await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });

    const p1StatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      s1.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    // 3. Start game
    const startAck = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
    });
    expect(startAck.success).toBe(true);

    const initialP1State = await p1StatePromise;
    expect(initialP1State.state.variant).toBe('uno_show_em_no_mercy');
    expect(initialP1State.state.targetScore).toBe(1000);
    expect(initialP1State.state.topDiscardCard.type).toBe('number');
    expect(initialP1State.state.self.hand).toHaveLength(7);

    // Verify server authoritative state
    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session).not.toBeNull();
    expect(session!.state.variant).toBe('uno_show_em_no_mercy');
    assertValidNoMercyGameState(session!.state);
  });

  it('handles Stacking resolution and penalty acceptance over WebSocket', async () => {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);

    await Promise.all([
      new Promise<void>((res) => s1.on('connect', res)),
      new Promise<void>((res) => s2.on('connect', res)),
    ]);

    const createAck = await new Promise<any>((resolve) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 4, settings: { variant: 'uno_show_em_no_mercy' } },
        resolve
      );
    });
    const roomCode = createAck.data.roomCode;

    await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });
    await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });

    const p1StatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      s1.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });
    const p2InitialStatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      s2.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
    });
    await Promise.all([p1StatePromise, p2InitialStatePromise]);

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;

    // Ensure P1 is current player and inject Draw Two matching activeColor into P1 hand
    session.state = {
      ...session.state,
      currentPlayerIndex: 0,
    };
    const { nextState: sWithD2, card: d2 } = NoMercyFixtureBuilder.injectPlayableCard(
      session.state,
      p1Id,
      'draw_two',
      session.state.activeColor ?? undefined
    );
    session.state = sWithD2;

    const p2StatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      s2.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    // P1 plays Draw Two
    const playAck = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: d2.id }, resolve);
    });
    expect(playAck.success).toBe(true);

    // P2 receives state awaiting stack resolution
    const p2State = await p2StatePromise;
    expect(p2State.state.self.isTargetedByStack).toBe(true);
    expect(p2State.state.pendingActionState).toEqual({
      type: 'AWAITING_STACK_RESOLUTION',
      targetPlayerId: p2Id,
      playedByPlayerId: p1Id,
      accumulatedPenalty: 2,
      lastStackedValue: 2,
      lastCardValue: 'draw_two',
    });

    // P2 accepts stack penalty
    const p2HandBefore = p2State.state.self.hand.length;
    const acceptAck = await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.GAME_ACCEPT_STACK_PENALTY, {}, resolve);
    });
    expect(acceptAck.success).toBe(true);
    expect(acceptAck.data.cardsDrawn).toBe(2);

    expect(session.state.pendingActionState).toBeNull();
    expect(session.state.players[1].hand.length).toBe(p2HandBefore + 2);
  });

  it('broadcasts game:player-eliminated when player hand exceeds 25 cards (Mercy Rule)', async () => {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);

    await Promise.all([
      new Promise<void>((res) => s1.on('connect', res)),
      new Promise<void>((res) => s2.on('connect', res)),
    ]);

    const createAck = await new Promise<any>((resolve) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'uno_show_em_no_mercy' } },
        resolve
      );
    });
    const roomCode = createAck.data.roomCode;

    await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });
    await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });

    const p1StatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      s1.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });
    const p2InitialStatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      s2.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
    });
    await Promise.all([p1StatePromise, p2InitialStatePromise]);

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;

    // Set P2's hand size to 24 cards
    session.state = NoMercyFixtureBuilder.setHandSize(session.state, p2Id, 24);

    // Set P1 to play Draw Two targeting P2 (24 + 2 = 26 >= 25!)
    session.state = {
      ...session.state,
      currentPlayerIndex: 0,
    };
    const { nextState, card: d2 } = NoMercyFixtureBuilder.injectPlayableCard(
      session.state,
      p1Id,
      'draw_two',
      session.state.activeColor ?? undefined
    );
    session.state = nextState;

    await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: d2.id }, resolve);
    });

    // Listen for elimination broadcast
    const eliminatedPromise = new Promise<any>((resolve) => {
      s1.once(SOCKET_EVENTS.GAME_PLAYER_ELIMINATED, resolve);
    });

    // P2 accepts penalty
    await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.GAME_ACCEPT_STACK_PENALTY, {}, resolve);
    });

    const elimEvent = await eliminatedPromise;
    expect(elimEvent.guestId).toBe(p2Id);
    expect(elimEvent.cardCount).toBeGreaterThanOrEqual(25);
    expect(elimEvent.remainingPlayerCount).toBe(1);

    // Match completes with P1 as winner
    expect(session.state.status).toBe('COMPLETED');
    expect(session.state.winner?.id).toBe(p1Id);

    // Verify setAsideCards are persisted to PostgreSQL and recoverable
    expect(session.state.setAsideCards?.length).toBeGreaterThanOrEqual(25);
    const restoredState = await gamePersistenceService.loadLatestSnapshot(session.matchId);
    expect(restoredState).not.toBeNull();
    expect(restoredState!.setAsideCards?.length).toBe(session.state.setAsideCards!.length);
  });

  it('handles Wild Reverse Draw 4 rebound in 2-player mode and rejects stacking non-Draw cards', async () => {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);

    await Promise.all([
      new Promise<void>((res) => s1.on('connect', res)),
      new Promise<void>((res) => s2.on('connect', res)),
    ]);

    const createAck = await new Promise<any>((resolve) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'uno_show_em_no_mercy' } },
        resolve
      );
    });
    const roomCode = createAck.data.roomCode;

    await new Promise<any>((resolve) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve));
    await new Promise<any>((resolve) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve));

    const p1StatePromise = new Promise<{ state: PlayerGameState }>((resolve) => s1.once(SOCKET_EVENTS.GAME_STATE, resolve));
    const p2StatePromise = new Promise<{ state: PlayerGameState }>((resolve) => s2.once(SOCKET_EVENTS.GAME_STATE, resolve));
    await new Promise<any>((resolve) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve));
    await Promise.all([p1StatePromise, p2StatePromise]);

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    session.state = { ...session.state, currentPlayerIndex: 0 };

    // Inject Wild Reverse Draw 4 into P1's hand
    const { nextState: sWithWrd4, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(
      session.state,
      p1Id,
      'wild_reverse_draw_four'
    );
    session.state = sWithWrd4;

    // P1 plays Wild Reverse Draw 4
    const playAck = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: wrd4.id, chosenColor: 'yellow' }, resolve);
    });
    expect(playAck.success).toBe(true);

    // In 2-player, the penalty rebounds to P1!
    expect(session.state.pendingActionState?.type).toBe('AWAITING_STACK_RESOLUTION');
    if (session.state.pendingActionState?.type === 'AWAITING_STACK_RESOLUTION') {
      expect(session.state.pendingActionState.targetPlayerId).toBe(p1Id);
      expect(session.state.pendingActionState.accumulatedPenalty).toBe(4);
    }
    expect(session.state.currentPlayerIndex).toBe(0);

    // Now inject another Wild Reverse Draw 4 into P1's hand
    const { nextState: sWithSecondWrd4, card: wrd4Second } = NoMercyFixtureBuilder.injectPlayableCard(
      session.state,
      p1Id,
      'wild_reverse_draw_four'
    );
    session.state = sWithSecondWrd4;

    // P1 stacks Wild Reverse Draw 4 onto active Draw penalty -> MUST BE ACCEPTED (+4 >= 4)!
    const stackWrd4Ack = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: wrd4Second.id, chosenColor: 'blue' }, resolve);
    });
    expect(stackWrd4Ack.success).toBe(true);

    // Penalty accumulates to 8 and reverses back to P2!
    expect(session.state.pendingActionState?.type).toBe('AWAITING_STACK_RESOLUTION');
    if (session.state.pendingActionState?.type === 'AWAITING_STACK_RESOLUTION') {
      expect(session.state.pendingActionState.targetPlayerId).toBe(p2Id);
      expect(session.state.pendingActionState.accumulatedPenalty).toBe(8);
      expect(session.state.pendingActionState.lastStackedValue).toBe(4);
    }
    expect(session.state.currentPlayerIndex).toBe(1);

    // P2 attempts to stack an ineligible non-draw card (e.g. reverse) -> REJECTED!
    const { nextState: sWithRev, card: revCard } = NoMercyFixtureBuilder.injectPlayableCard(
      session.state,
      p2Id,
      'reverse',
      'blue'
    );
    session.state = sWithRev;

    const stackInvalidAck = await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: revCard.id }, resolve);
    });
    expect(stackInvalidAck.success).toBe(false);
    expect(stackInvalidAck.error?.message).toMatch(/not an eligible Draw Card/);

    // Now inject an eligible Draw Four (+4) into P2's hand
    const { nextState: sWithD4, card: d4 } = NoMercyFixtureBuilder.injectPlayableCard(
      session.state,
      p2Id,
      'draw_four'
    );
    session.state = sWithD4;

    // P2 stacks Draw Four (+4 >= 4) -> ACCEPTED!
    const stackD4Ack = await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: d4.id }, resolve);
    });
    expect(stackD4Ack.success).toBe(true);

    // Penalty is now passed to P1 with 12 cards!
    expect(session.state.pendingActionState?.type).toBe('AWAITING_STACK_RESOLUTION');
    if (session.state.pendingActionState?.type === 'AWAITING_STACK_RESOLUTION') {
      expect(session.state.pendingActionState.targetPlayerId).toBe(p1Id);
      expect(session.state.pendingActionState.accumulatedPenalty).toBe(12);
    }
    expect(session.state.currentPlayerIndex).toBe(0);

    // P1 accepts the accumulated penalty over Socket.IO
    const acceptAck = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.GAME_ACCEPT_STACK_PENALTY, {}, resolve);
    });
    expect(acceptAck.success).toBe(true);
    expect(session.state.pendingActionState).toBeNull();

    await new Promise<void>((res) => s2.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
    await new Promise<void>((res) => s1.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
  });

  it('rejects /api/test/set-no-mercy-hand-size if targetCount exceeds 24 cards', async () => {
    process.env.ENABLE_TEST_HELPERS = 'true';
    process.env.TEST_HELPER_SECRET = 'a-very-long-test-helper-secret-key-1234';
    const app = createApp();
    const res = await request(app)
      .post('/api/test/set-no-mercy-hand-size')
      .set('X-Test-Helper-Secret', 'a-very-long-test-helper-secret-key-1234')
      .send({
        roomCode: 'NONEXIST',
        targetCount: 25, // exceeds max 24
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('BAD_REQUEST');
  });
});
