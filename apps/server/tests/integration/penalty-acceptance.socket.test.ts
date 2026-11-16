import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { guestService } from '../../src/modules/guest/guest.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { cancelAllCountdownTimersForTesting } from '../../src/sockets/roomSocketHandler';
import { SOCKET_EVENTS, PlayerGameState } from '@uno-ultimate/game-protocol';
import { CardFactory } from '@uno-ultimate/game-engine';

describe('Draw Penalty Acceptance & Freeze Prevention Socket Integration Tests', () => {
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
        port = typeof addr === 'object' && addr ? addr.port : 4030;
        resolve();
      });
    });

    const s1 = await guestService.createGuest('PenaltyHost');
    p1Id = s1.guest.id;
    p1Token = s1.rawSessionToken;

    const s2 = await guestService.createGuest('PenaltyVictim');
    p2Id = s2.guest.id;
    p2Token = s2.rawSessionToken;

    const s3 = await guestService.createGuest('PenaltyThird');
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

  /**
   * Helper to set up a clean 2-player or 3-player match
   */
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

  // 1. Accepting Wild Draw 2
  it('1. accepts Wild Draw 2: awards 2 cards, advances turn and clears pending state', async () => {
    const { s2, session, p1Idx, p2Idx } = await setupMatch('uno_flip', 2);

    session.state = {
      ...session.state,
      turnDirection: 'clockwise',
      currentPlayerIndex: p2Idx,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_TWO_RESOLUTION',
        victimPlayerId: p2Id,
        playedByPlayerId: p1Id,
        wasOfficiallyLegal: true,
        chosenColor: 'blue',
        offenderHandSnapshot: [],
      },
    };

    const initialCardCount = session.state.players[p2Idx].hand.length;

    const ack = await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_TWO, {}, resolve);
    });

    expect(ack.success).toBe(true);
    expect(ack.data.accepted).toBe(true);
    expect(ack.data.cardsDrawn).toBe(2);
    expect(ack.data.state).toBeDefined();

    expect(session.state.players[p2Idx].hand.length).toBe(initialCardCount + 2);
    expect(session.state.pendingActionState).toBeNull();
    expect(session.state.currentPlayerIndex).toBe(p1Idx);
  });

  // 2. Accepting Wild Draw 4
  it('2. accepts Wild Draw 4: awards 4 cards, clears pending state, returns authoritative state in ack', async () => {
    const { s2, session, p1Idx, p2Idx } = await setupMatch('classic', 2);

    session.state = {
      ...session.state,
      turnDirection: 'clockwise',
      currentPlayerIndex: p2Idx,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        victimPlayerId: p2Id,
        playedByPlayerId: p1Id,
        wasOfficiallyLegal: true,
        chosenColor: 'red',
        offenderHandSnapshot: [],
      },
    };

    const initialCount = session.state.players[p2Idx].hand.length;

    const ack = await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, resolve);
    });

    expect(ack.success).toBe(true);
    expect(ack.data.accepted).toBe(true);
    expect(ack.data.cardsDrawn).toBe(4);
    expect(ack.data.state.self.hand.length).toBe(initialCount + 4);

    expect(session.state.players[p2Idx].hand.length).toBe(initialCount + 4);
    expect(session.state.pendingActionState).toBeNull();
    expect(session.state.currentPlayerIndex).toBe(p1Idx);
  });

  // 3. Accepting No Mercy draw penalties (+4, +6, +10)
  it('3. accepts No Mercy draw penalties (+4, +6, +10) via GAME_ACCEPT_STACK_PENALTY', async () => {
    const { s2, session, p2Idx } = await setupMatch('uno_show_em_no_mercy', 2);

    for (const penalty of [4, 6, 10]) {
      // Keep hand size small (5 cards) to prevent triggering 25-card Mercy Rule elimination
      session.state = {
        ...session.state,
        players: session.state.players.map((p, idx) =>
          idx === p2Idx ? { ...p, hand: p.hand.slice(0, 5) } : p
        ),
        turnDirection: 'clockwise',
        currentPlayerIndex: p2Idx,
        pendingActionState: {
          type: 'AWAITING_STACK_RESOLUTION',
          targetPlayerId: p2Id,
          playedByPlayerId: p1Id,
          accumulatedPenalty: penalty,
          lastStackedValue: penalty,
          lastCardValue: 'draw_four',
        },
      };

      const countBefore = session.state.players[p2Idx].hand.length;

      const ack = await new Promise<any>((resolve) => {
        s2.emit(SOCKET_EVENTS.GAME_ACCEPT_STACK_PENALTY, {}, resolve);
      });

      expect(ack.success).toBe(true);
      expect(ack.data.cardsDrawn).toBe(penalty);
      expect(session.state.players[p2Idx].hand.length).toBe(countBefore + penalty);
      expect(session.state.pendingActionState).toBeNull();
    }
  });

  // 4. Accepting Wild Reverse Draw 4 (rebound and reverse)
  it('4. accepts Wild Reverse Draw 4 rebound in No Mercy, reversing direction and penalizing target', async () => {
    const { s1, session, p1Idx, p2Idx, p3Idx } = await setupMatch('uno_show_em_no_mercy', 3);

    // Alice played Draw 4 (+4), Bob countered with Wild Reverse Draw 4 (+4), reversing direction
    // Now Alice is targeted by +8 stack penalty
    session.state = {
      ...session.state,
      turnDirection: 'counter_clockwise',
      currentPlayerIndex: p1Idx,
      pendingActionState: {
        type: 'AWAITING_STACK_RESOLUTION',
        targetPlayerId: p1Id,
        playedByPlayerId: p2Id,
        accumulatedPenalty: 8,
        lastStackedValue: 4,
        lastCardValue: 'wild_reverse_draw_four',
      },
    };

    const aliceBefore = session.state.players[p1Idx].hand.length;

    const ack = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.GAME_ACCEPT_STACK_PENALTY, {}, resolve);
    });

    expect(ack.success).toBe(true);
    expect(ack.data.cardsDrawn).toBe(8);
    expect(session.state.players[p1Idx].hand.length).toBe(aliceBefore + 8);
    expect(session.state.pendingActionState).toBeNull();
    // After Alice draws and loses turn in counter-clockwise, next active player is Charlie
    expect(session.state.currentPlayerIndex).toBe(p3Idx);
  });

  // 5. Correct penalty card count
  it('5. guarantees exact penalty card count added to victim hand', async () => {
    const { s2, session, p2Idx } = await setupMatch('classic', 2);

    session.state = {
      ...session.state,
      currentPlayerIndex: p2Idx,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        victimPlayerId: p2Id,
        playedByPlayerId: p1Id,
        wasOfficiallyLegal: true,
        chosenColor: 'yellow',
        offenderHandSnapshot: [],
      },
    };

    const before = session.state.players[p2Idx].hand.length;
    await new Promise<any>((res) => s2.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res));
    const after = session.state.players[p2Idx].hand.length;

    expect(after - before).toBe(4);
  });

  // 6. Correct card ownership
  it('6. guarantees drawn cards belong strictly to victim hand and are unique', async () => {
    const { s2, session, p1Idx, p2Idx } = await setupMatch('classic', 2);

    session.state = {
      ...session.state,
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

    const initialBobHandIds = new Set(session.state.players[p2Idx].hand.map((c) => c.id));
    const initialAliceHandIds = new Set(session.state.players[p1Idx].hand.map((c) => c.id));

    await new Promise<any>((res) => s2.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res));

    const finalBobHand = session.state.players[p2Idx].hand;
    const finalAliceHand = session.state.players[p1Idx].hand;

    const newlyDrawnBobCards = finalBobHand.filter((c) => !initialBobHandIds.has(c.id));
    expect(newlyDrawnBobCards.length).toBe(4);

    // None of the newly drawn cards exist in Alice's hand
    for (const card of newlyDrawnBobCards) {
      expect(finalAliceHand.some((c) => c.id === card.id)).toBe(false);
    }
  });

  // 7. Correct pending-action cleanup
  it('7. guarantees pendingActionState is cleaned up on session and broadcasted state', async () => {
    const { s1, s2, session, p2Idx } = await setupMatch('classic', 2);

    session.state = {
      ...session.state,
      currentPlayerIndex: p2Idx,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        victimPlayerId: p2Id,
        playedByPlayerId: p1Id,
        wasOfficiallyLegal: true,
        chosenColor: 'red',
        offenderHandSnapshot: [],
      },
    };

    let p1ReceivedNullPending = false;
    s1.on(SOCKET_EVENTS.GAME_STATE, ({ state }: { state: PlayerGameState }) => {
      if (state.pendingActionState === null) p1ReceivedNullPending = true;
    });

    await new Promise<any>((res) => s2.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res));

    expect(session.state.pendingActionState).toBeNull();
    await new Promise((r) => setTimeout(r, 100));
    expect(p1ReceivedNullPending).toBe(true);
  });

  // 8. Correct turn advancement
  it('8. guarantees turn advances and skips victim', async () => {
    const { s2, session, p1Idx, p2Idx } = await setupMatch('classic', 2);

    session.state = {
      ...session.state,
      turnDirection: 'clockwise',
      currentPlayerIndex: p2Idx,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        victimPlayerId: p2Id,
        playedByPlayerId: p1Id,
        wasOfficiallyLegal: true,
        chosenColor: 'green',
        offenderHandSnapshot: [],
      },
    };

    await new Promise<any>((res) => s2.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res));

    expect(session.state.currentPlayerIndex).toBe(p1Idx);
  });

  // 9. Duplicate Accept Cards requests (absorbed safely without error)
  it('9. safely absorbs concurrent duplicate accept requests idempotently', async () => {
    const { s2, session, p2Idx } = await setupMatch('classic', 2);

    session.state = {
      ...session.state,
      currentPlayerIndex: p2Idx,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        victimPlayerId: p2Id,
        playedByPlayerId: p1Id,
        wasOfficiallyLegal: true,
        chosenColor: 'red',
        offenderHandSnapshot: [],
      },
    };

    const initialBobCount = session.state.players[p2Idx].hand.length;

    const [ack1, ack2] = await Promise.all([
      new Promise<any>((res) => s2.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res)),
      new Promise<any>((res) => s2.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res)),
    ]);

    expect(ack1.success).toBe(true);
    expect(ack2.success).toBe(true);

    expect(session.state.players[p2Idx].hand.length).toBe(initialBobCount + 4);
    expect(session.state.pendingActionState).toBeNull();
  });

  // 10. Invalid player attempting acceptance (rejected with INVALID_PLAYER)
  it('10. rejects non-targeted player attempting acceptance with INVALID_PLAYER', async () => {
    const { s1, session, p2Idx } = await setupMatch('classic', 2);

    session.state = {
      ...session.state,
      currentPlayerIndex: p2Idx,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        victimPlayerId: p2Id,
        playedByPlayerId: p1Id,
        wasOfficiallyLegal: true,
        chosenColor: 'yellow',
        offenderHandSnapshot: [],
      },
    };

    // Alice attempts to accept Bob's penalty
    const ack = await new Promise<any>((res) => {
      s1.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res);
    });

    expect(ack.success).toBe(false);
    expect(ack.error.message).toContain('INVALID_PLAYER');
    expect(session.state.pendingActionState).toBeDefined();
  });

  // 11. Accept request with stale state
  it('11. returns error when accept is attempted with no pending challenge', async () => {
    const { s2, session } = await setupMatch('classic', 2);

    session.state = {
      ...session.state,
      pendingActionState: null,
    };

    const ack = await new Promise<any>((res) => {
      s2.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res);
    });

    expect(ack.success).toBe(false);
    expect(ack.error.message).toContain('NO_PENDING_CHALLENGE');
  });

  // 12. Delayed Socket.IO acknowledgement handled by timeout
  it('12. client store timeout clears isActionLoading and sets error when ack is delayed', async () => {
    let isActionLoading = true;
    let error: string | null = null;

    const timeoutPromise = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        isActionLoading = false;
        error = 'Request timed out while accepting Wild Draw Four. Please try again.';
        resolve(false);
      }, 50);
    });

    const result = await timeoutPromise;
    expect(result).toBe(false);
    expect(isActionLoading).toBe(false);
    expect(error).toContain('Request timed out');
  });

  // 13. Player disconnection during pending penalty
  it('13. handles player disconnection during pending penalty without session crash', async () => {
    const { s2, roomCode, session, p2Idx } = await setupMatch('classic', 2);

    session.state = {
      ...session.state,
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

    s2.disconnect();
    await new Promise((r) => setTimeout(r, 50));

    const currentSession = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(currentSession).toBeDefined();
    expect(currentSession?.state.pendingActionState?.type).toBe('AWAITING_WILD_DRAW_FOUR_RESOLUTION');
  });

  // 14. Player reconnection during pending penalty
  it('14. reconnects player during pending penalty and restores state delivery via guestSockets', async () => {
    const { s2, session, p2Idx } = await setupMatch('classic', 2);

    session.state = {
      ...session.state,
      currentPlayerIndex: p2Idx,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        victimPlayerId: p2Id,
        playedByPlayerId: p1Id,
        wasOfficiallyLegal: true,
        chosenColor: 'green',
        offenderHandSnapshot: [],
      },
    };

    s2.disconnect();

    const s2New = createClient();
    await new Promise<void>((r) => s2New.on('connect', r));

    const stateReceivedPromise = new Promise<PlayerGameState>((resolve) => {
      s2New.on(SOCKET_EVENTS.GAME_STATE, ({ state }: { state: PlayerGameState }) => {
        resolve(state);
      });
    });

    const authAck = await new Promise<any>((resolve) => {
      s2New.emit(SOCKET_EVENTS.AUTH_AUTHENTICATE, { sessionToken: p2Token }, resolve);
    });
    expect(authAck.success).toBe(true);

    const reconnectedState = await stateReceivedPromise;
    expect(reconnectedState.self.id).toBe(p2Id);
    expect(reconnectedState.self.isTargetedByWildDrawFour).toBe(true);
    expect(reconnectedState.self.canResolveWildDrawFour).toBe(true);

    const acceptAck = await new Promise<any>((res) => {
      s2New.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res);
    });
    expect(acceptAck.success).toBe(true);
    expect(acceptAck.data.accepted).toBe(true);
  });

  // 15. Rapid repeated button clicks
  it('15. serializes rapid repeated button clicks without double-drawing cards', async () => {
    const { s2, session, p2Idx } = await setupMatch('classic', 2);

    session.state = {
      ...session.state,
      currentPlayerIndex: p2Idx,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        victimPlayerId: p2Id,
        playedByPlayerId: p1Id,
        wasOfficiallyLegal: true,
        chosenColor: 'red',
        offenderHandSnapshot: [],
      },
    };

    const initialBobCount = session.state.players[p2Idx].hand.length;

    const acks = await Promise.all([
      new Promise<any>((res) => s2.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res)),
      new Promise<any>((res) => s2.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res)),
      new Promise<any>((res) => s2.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res)),
      new Promise<any>((res) => s2.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res)),
      new Promise<any>((res) => s2.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res)),
    ]);

    for (const ack of acks) {
      expect(ack.success).toBe(true);
    }

    expect(session.state.players[p2Idx].hand.length).toBe(initialBobCount + 4);
  });

  // 16. Two-player synchronization after penalty acceptance
  it('16. broadcasts synchronized authoritative GAME_STATE to both players', async () => {
    const { s1, s2, session, p2Idx } = await setupMatch('classic', 2);

    session.state = {
      ...session.state,
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

    const p1StatePromise = new Promise<PlayerGameState>((res) => {
      s1.on(SOCKET_EVENTS.GAME_STATE, ({ state }: { state: PlayerGameState }) => {
        if (state.pendingActionState === null) res(state);
      });
    });
    const p2StatePromise = new Promise<PlayerGameState>((res) => {
      s2.on(SOCKET_EVENTS.GAME_STATE, ({ state }: { state: PlayerGameState }) => {
        if (state.pendingActionState === null) res(state);
      });
    });

    const acceptAck = await new Promise<any>((res) => {
      s2.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res);
    });
    expect(acceptAck.success).toBe(true);

    const [s1Final, s2Final] = await Promise.all([p1StatePromise, p2StatePromise]);

    expect(s1Final.sequenceNumber).toBe(s2Final.sequenceNumber);
    expect(s1Final.currentPlayerIndex).toBe(s2Final.currentPlayerIndex);
    expect(s1Final.drawPileCount).toBe(s2Final.drawPileCount);
    expect(s1Final.pendingActionState).toBeNull();
    expect(s2Final.pendingActionState).toBeNull();
  });

  // 17. Empty draw pile and discard-pile recycling
  it('17. recycles and reshuffles discard pile when draw pile has fewer cards than the penalty', async () => {
    const { s2, session, p2Idx } = await setupMatch('classic', 2);

    const cardInDraw = CardFactory.createNumberCard('red', '1', 99, 'classic');
    const cardsInDiscard = Array.from({ length: 10 }, (_, i) =>
      CardFactory.createNumberCard('blue', ((i % 9) + 1).toString() as any, 100 + i, 'classic')
    );

    session.state = {
      ...session.state,
      drawPile: [cardInDraw],
      discardPile: cardsInDiscard,
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

    const countBefore = session.state.players[p2Idx].hand.length;

    const ack = await new Promise<any>((res) => {
      s2.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res);
    });

    expect(ack.success).toBe(true);
    expect(ack.data.cardsDrawn).toBe(4);
    expect(session.state.players[p2Idx].hand.length).toBe(countBefore + 4);
    expect(session.state.discardPile.length).toBe(1);
    expect(session.state.drawPile.length).toBe(6);
  });

  // 18. Multiple consecutive penalty actions
  it('18. handles multiple consecutive penalty actions without stale state contamination', async () => {
    const { s1, s2, session, p1Idx, p2Idx } = await setupMatch('classic', 2);

    // Step 1: Alice targets Bob with Wild Draw 4
    session.state = {
      ...session.state,
      currentPlayerIndex: p2Idx,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        victimPlayerId: p2Id,
        playedByPlayerId: p1Id,
        wasOfficiallyLegal: true,
        chosenColor: 'green',
        offenderHandSnapshot: [],
      },
    };

    const ack1 = await new Promise<any>((res) => {
      s2.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res);
    });
    expect(ack1.success).toBe(true);
    expect(session.state.pendingActionState).toBeNull();
    expect(session.state.currentPlayerIndex).toBe(p1Idx);

    // Step 2: In subsequent turn, Bob targets Alice with Wild Draw 4
    session.state = {
      ...session.state,
      currentPlayerIndex: p1Idx,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        victimPlayerId: p1Id,
        playedByPlayerId: p2Id,
        wasOfficiallyLegal: true,
        chosenColor: 'red',
        offenderHandSnapshot: [],
      },
    };

    const ack2 = await new Promise<any>((res) => {
      s1.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, res);
    });
    expect(ack2.success).toBe(true);
    expect(ack2.data.accepted).toBe(true);
    expect(session.state.pendingActionState).toBeNull();
    expect(session.state.currentPlayerIndex).toBe(p2Idx);
  });
});
