import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { guestService } from '../../src/modules/guest/guest.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { gameService } from '../../src/modules/game/game.service';
import { guestSockets, cancelAllCountdownTimersForTesting } from '../../src/sockets/roomSocketHandler';
import { SOCKET_EVENTS, PlayerGameState, CardAnimationEvent, GameTurnRecoveredPayload } from '@uno-ultimate/game-protocol';

describe('Comprehensive Game Freeze, Challenge Deadlock & State-Recovery Socket Tests', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: SocketIOServer;
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
    io = initializeSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 4031;
        resolve();
      });
    });

    const s1 = await guestService.createGuest('ChallengeHost');
    p1Id = s1.guest.id;
    p1Token = s1.rawSessionToken;

    const s2 = await guestService.createGuest('ChallengeVictim');
    p2Id = s2.guest.id;
    p2Token = s2.rawSessionToken;

    const s3 = await guestService.createGuest('ChallengeThird');
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

  async function setupMatch(variant: string, playerCount: 2 | 3 = 2) {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);
    const s3 = playerCount === 3 ? createClient(p3Token) : null;

    const connects = [
      new Promise<void>((res) => s1.on('connect', res)),
      new Promise<void>((res) => s2.on('connect', res)),
    ];
    if (s3) connects.push(new Promise<void>((res) => s3.on('connect', res)));
    await Promise.all(connects);

    const createAck = await new Promise<any>((resolve) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: playerCount, settings: { variant } },
        resolve
      );
    });
    expect(createAck.success).toBe(true);
    const roomCode = createAck.data.roomCode;
    const roomId = createAck.data.id;

    await new Promise<any>((res) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, res));
    await new Promise<any>((res) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, res));

    if (s3) {
      await new Promise<any>((res) => s3.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, res));
      await new Promise<any>((res) => s3.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, res));
    }

    let p1State: PlayerGameState | null = null;
    let p2State: PlayerGameState | null = null;
    let p3State: PlayerGameState | null = null;

    s1.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      if (payload.state.roomId === roomId) p1State = payload.state;
    });
    s2.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      if (payload.state.roomId === roomId) p2State = payload.state;
    });
    if (s3) {
      s3.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
        if (payload.state.roomId === roomId) p3State = payload.state;
      });
    }

    const startAck = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
    });
    expect(startAck.success).toBe(true);

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (p1State && p2State && (!s3 || p3State)) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    expect(session).toBeDefined();

    const p1Idx = session.state.players.findIndex((p) => p.id === p1Id);
    const p2Idx = session.state.players.findIndex((p) => p.id === p2Id);
    const p3Idx = s3 ? session.state.players.findIndex((p) => p.id === p3Id) : -1;

    return { s1, s2, s3, roomCode, roomId, session, p1Idx, p2Idx, p3Idx };
  }

  // 1. Classic UNO Wild Draw 4 challenge failed (innocent offender)
  it('1. Classic UNO: challenge failed awards 6 cards to challenger, advances turn past challenger, emits 6-card animation', async () => {
    const { s1, s2, s3, session, p1Idx, p2Idx, p3Idx } = await setupMatch('classic', 3);

    // Offender is p1, victim/challenger is p2, next in turn is p3
    session.state = {
      ...session.state,
      turnDirection: 'clockwise',
      currentPlayerIndex: p2Idx,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        victimPlayerId: p2Id,
        playedByPlayerId: p1Id,
        wasOfficiallyLegal: true, // innocent offender!
        chosenColor: 'red',
        offenderHandSnapshot: [],
      },
    };

    const initialP2HandCount = session.state.players[p2Idx].hand.length;
    let cardAnimationReceived: CardAnimationEvent | null = null;
    s1.on(SOCKET_EVENTS.GAME_CARD_ANIMATION, (anim: CardAnimationEvent) => {
      cardAnimationReceived = anim;
    });

    const ack = await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_FOUR, {}, resolve);
    });

    expect(ack.success).toBe(true);
    expect(ack.data.challengeWon).toBe(false);
    expect(ack.data.cardsDrawn).toBe(6);

    // Challenger drew 6 cards
    expect(session.state.players[p2Idx].hand.length).toBe(initialP2HandCount + 6);
    expect(session.state.pendingActionState).toBeNull();
    // Turn advanced past challenger (to p3)
    expect(session.state.currentPlayerIndex).toBe(p3Idx);

    // Animation emitted to all players
    expect(cardAnimationReceived).toBeDefined();
    expect(cardAnimationReceived!.playerId).toBe(p2Id);
    expect(cardAnimationReceived!.cardCount).toBe(6);

    // Verify privacy: state in ack contains zero opponent cards and no inspectedChallengedHand
    expect((ack.data.state as any).inspectedChallengedHand).toBeUndefined();
    for (const p of (ack.data.state as any).players) {
      expect(p.hand).toBeUndefined();
    }
  });

  // 2. Classic UNO Wild Draw 4 challenge won (guilty offender)
  it('2. Classic UNO: challenge won awards 4 cards to offender, challenger keeps turn, emits 4-card animation', async () => {
    const { s1, s2, session, p1Idx, p2Idx } = await setupMatch('classic', 2);

    session.state = {
      ...session.state,
      turnDirection: 'clockwise',
      currentPlayerIndex: p2Idx,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        victimPlayerId: p2Id,
        playedByPlayerId: p1Id,
        wasOfficiallyLegal: false, // guilty offender!
        chosenColor: 'red',
        offenderHandSnapshot: [],
      },
    };

    const initialP1HandCount = session.state.players[p1Idx].hand.length;
    let cardAnimationReceived: CardAnimationEvent | null = null;
    s2.on(SOCKET_EVENTS.GAME_CARD_ANIMATION, (anim: CardAnimationEvent) => {
      cardAnimationReceived = anim;
    });

    const ack = await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_FOUR, {}, resolve);
    });

    expect(ack.success).toBe(true);
    expect(ack.data.challengeWon).toBe(true);
    expect(ack.data.cardsDrawn).toBe(4);

    // Offender drew 4 cards
    expect(session.state.players[p1Idx].hand.length).toBe(initialP1HandCount + 4);
    expect(session.state.pendingActionState).toBeNull();
    // Challenger keeps turn
    expect(session.state.currentPlayerIndex).toBe(p2Idx);

    // Animation emitted to offender
    expect(cardAnimationReceived).toBeDefined();
    expect(cardAnimationReceived!.playerId).toBe(p1Id);
    expect(cardAnimationReceived!.cardCount).toBe(4);

    // Verify privacy: state in ack contains zero opponent cards and no inspectedChallengedHand
    expect((ack.data.state as any).inspectedChallengedHand).toBeUndefined();
    for (const p of (ack.data.state as any).players) {
      expect(p.hand).toBeUndefined();
    }
  });

  // 3. Idempotent duplicate absorption on GAME_CHALLENGE_WILD_DRAW_FOUR
  it('3. Idempotency: rapid duplicate challenge calls are safely absorbed without double penalty or crash', async () => {
    const { s2, session, p2Idx, p1Idx } = await setupMatch('classic', 2);

    session.state = {
      ...session.state,
      turnDirection: 'clockwise',
      currentPlayerIndex: p2Idx,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        victimPlayerId: p2Id,
        playedByPlayerId: p1Id,
        wasOfficiallyLegal: true,
        chosenColor: 'blue',
        offenderHandSnapshot: [],
      },
    };

    const initialCount = session.state.players[p2Idx].hand.length;

    // Fire two challenge calls simultaneously
    const [ack1, ack2] = await Promise.all([
      new Promise<any>((res) => s2.emit(SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_FOUR, {}, res)),
      new Promise<any>((res) => s2.emit(SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_FOUR, {}, res)),
    ]);

    expect(ack1.success).toBe(true);
    expect(ack2.success).toBe(true);

    // Challenger drew exactly 6 cards once (not 12)
    expect(session.state.players[p2Idx].hand.length).toBe(initialCount + 6);
    expect(session.state.pendingActionState).toBeNull();
  });

  // 4. UNO Flex Wild Draw Four challenge won recognized correctly
  it('4. UNO Flex: Wild Draw Four challenge won correctly parsed and awards 4 cards to offender', async () => {
    const { s1, s2, session, p1Idx, p2Idx } = await setupMatch('uno_flex', 2);

    session.state = {
      ...session.state,
      turnDirection: 'clockwise',
      currentPlayerIndex: p2Idx,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        victimPlayerId: p2Id,
        playedByPlayerId: p1Id,
        wasOfficiallyLegal: false, // guilty
        chosenColor: 'green',
        offenderHandSnapshot: [],
      },
    };

    const initialP1HandCount = session.state.players[p1Idx].hand.length;
    let cardAnimationReceived: CardAnimationEvent | null = null;
    s2.on(SOCKET_EVENTS.GAME_CARD_ANIMATION, (anim: CardAnimationEvent) => {
      cardAnimationReceived = anim;
    });

    const ack = await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_FOUR, {}, resolve);
    });

    expect(ack.success).toBe(true);
    expect(ack.data.challengeWon).toBe(true);
    expect(session.state.players[p1Idx].hand.length).toBe(initialP1HandCount + 4);
    expect(cardAnimationReceived).toBeDefined();
    expect(cardAnimationReceived!.playerId).toBe(p1Id);
    expect(cardAnimationReceived!.cardCount).toBe(4);
  });

  // 5. UNO Flip Wild Draw Two challenge loss
  it('5. UNO Flip: Wild Draw Two challenge loss awards 4 cards to challenger and emits animation', async () => {
    const { s1, s2, session, p2Idx, p1Idx } = await setupMatch('uno_flip', 2);

    session.state = {
      ...session.state,
      turnDirection: 'clockwise',
      currentPlayerIndex: p2Idx,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_TWO_RESOLUTION',
        victimPlayerId: p2Id,
        playedByPlayerId: p1Id,
        wasOfficiallyLegal: true, // innocent
        chosenColor: 'yellow',
        offenderHandSnapshot: [],
      },
    };

    const initialP2HandCount = session.state.players[p2Idx].hand.length;
    let cardAnimationReceived: CardAnimationEvent | null = null;
    s1.on(SOCKET_EVENTS.GAME_CARD_ANIMATION, (anim: CardAnimationEvent) => {
      cardAnimationReceived = anim;
    });

    const ack = await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_TWO, {}, resolve);
    });

    expect(ack.success).toBe(true);
    expect(ack.data.challengeWon).toBe(false);
    expect(ack.data.cardsDrawn).toBe(4);
    expect(session.state.players[p2Idx].hand.length).toBe(initialP2HandCount + 4);

    expect(cardAnimationReceived).toBeDefined();
    expect(cardAnimationReceived!.playerId).toBe(p2Id);
    expect(cardAnimationReceived!.cardCount).toBe(4);
  });

  // 6. Stuck-state detection and auto-recovery via checkAndRecoverStuckSession
  it('6. Stuck-state auto-recovery: heals corrupted currentPlayerIndex and clears orphaned pending states', async () => {
    const { s1, s2, roomCode, session } = await setupMatch('classic', 2);

    // Corrupt the session state intentionally:
    // Out-of-bounds currentPlayerIndex and orphaned pendingActionState referencing a non-existent player
    session.state = {
      ...session.state,
      currentPlayerIndex: 999, // invalid index
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        victimPlayerId: 'non-existent-player-id',
        playedByPlayerId: p1Id,
        wasOfficiallyLegal: true,
        chosenColor: 'red',
        offenderHandSnapshot: [],
      },
    };

    let recoveredEvent: GameTurnRecoveredPayload | null = null;
    s2.on(SOCKET_EVENTS.GAME_TURN_RECOVERED, (payload: GameTurnRecoveredPayload) => {
      recoveredEvent = payload;
    });

    const healedState = await gameService.checkAndRecoverStuckSession(
      roomCode,
      io as any,
      guestSockets
    );

    expect(healedState).toBeDefined();
    expect(healedState!.currentPlayerIndex).toBeLessThan(session.state.players.length);
    expect(healedState!.pendingActionState).toBeNull();

    // Verify broadcast event was received
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (recoveredEvent) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });
    expect(recoveredEvent).toBeDefined();
    expect(recoveredEvent!.reason).toBe('STUCK_STATE_AUTO_RECOVERY');
  });

  // 7. Card exhaustion handling during penalty resolution
  it('7. Card exhaustion: handles penalty drawing when deck + discard have fewer than penalty cards gracefully', async () => {
    const { s2, session, p2Idx, p1Idx } = await setupMatch('classic', 2);

    // Leave only 2 cards in draw pile and empty discard pile
    session.state = {
      ...session.state,
      drawPile: session.state.drawPile.slice(0, 2),
      discardPile: [],
      turnDirection: 'clockwise',
      currentPlayerIndex: p2Idx,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        victimPlayerId: p2Id,
        playedByPlayerId: p1Id,
        wasOfficiallyLegal: true, // challenger must draw 6, but only 2 cards exist!
        chosenColor: 'blue',
        offenderHandSnapshot: [],
      },
    };

    const initialCount = session.state.players[p2Idx].hand.length;

    const ack = await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_FOUR, {}, resolve);
    });

    expect(ack.success).toBe(true);
    // Challenger drew the available 2 cards without unhandled exception
    expect(session.state.players[p2Idx].hand.length).toBe(initialCount + 2);
    expect(session.state.drawPile.length).toBe(0);
    expect(session.state.pendingActionState).toBeNull();
  });
});
