import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { guestService } from '../../src/modules/guest/guest.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { cancelAllCountdownTimersForTesting } from '../../src/sockets/roomSocketHandler';
import { SOCKET_EVENTS, PlayerGameState } from '@uno-ultimate/game-protocol';
import { FlexFixtureBuilder, assertValidFlexGameState } from '@uno-ultimate/game-engine';
import { gamePersistenceService } from '../../src/modules/game/game.persistence.service';

describe('UNO Flex — Server Socket.IO Multiplayer Integration Tests', () => {
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  let activeClients: ClientSocket[] = [];

  let p1Id: string;
  let p1Token: string;
  let p2Id: string;
  let p2Token: string;

  beforeAll(async () => {
    httpServer = createServer(createApp());
    initializeSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 4004;
        resolve();
      });
    });

    const s1 = await guestService.createGuest('FlexHost');
    p1Id = s1.guest.id;
    p1Token = s1.rawSessionToken;

    const s2 = await guestService.createGuest('FlexPlayer2');
    p2Id = s2.guest.id;
    p2Token = s2.rawSessionToken;
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

  it('creates and starts a UNO Flex match, verifies 104 playing cards, and checks Power Card status', async () => {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);

    await Promise.all([
      new Promise<void>((res) => s1.on('connect', () => res())),
      new Promise<void>((res) => s2.on('connect', () => res())),
    ]);

    // Host creates room with variant 'uno_flex'
    const createRes = await new Promise<{ success: boolean; data?: { roomCode: string } }>((res) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 4, settings: { variant: 'uno_flex' } },
        (response: any) => res(response)
      );
    });
    expect(createRes.success).toBe(true);
    const roomCode = createRes.data!.roomCode;

    // Player 2 joins room
    const joinRes = await new Promise<{ success: boolean }>((res) => {
      s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, (response: any) => res(response));
    });
    expect(joinRes.success).toBe(true);

    // Player 2 readies up
    await new Promise<{ success: boolean }>((res) => {
      s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, (response: any) => res(response));
    });

    let p1State: PlayerGameState | null = null;
    let p2State: PlayerGameState | null = null;

    s1.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      p1State = payload.state;
    });
    s2.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      p2State = payload.state;
    });

    // Start match (immediate for tests)
    const startRes = await new Promise<{ success: boolean }>((res) => {
      s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true } as any, (response: any) => res(response));
    });
    expect(startRes.success).toBe(true);

    // Wait for initial game state
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (p1State && p2State) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    expect(p1State!.variant).toBe('uno_flex');
    expect(p1State!.status).toBe('IN_PROGRESS');
    expect(p1State!.players).toHaveLength(2);

    // Verify Power Cards initialized to green_check
    expect(p1State!.players[0].powerCardStatus).toBe('green_check');
    expect(p1State!.players[1].powerCardStatus).toBe('green_check');

    // Total 104 card conservation
    const totalPlayingCards =
      p1State!.drawPileCount +
      p1State!.discardPileCount +
      p1State!.players[0].cardCount +
      p1State!.players[1].cardCount;
    expect(totalPlayingCards).toBe(104);

    // Verify session persistence in DB
    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session).toBeDefined();
    expect(session!.state.variant).toBe('uno_flex');
    expect(() => assertValidFlexGameState(session!.state)).not.toThrow();

    await new Promise<void>((res) => s2.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
    await new Promise<void>((res) => s1.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
  });

  it('handles playing a card in flex mode over Socket.IO and updates Power Card status', async () => {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);

    await Promise.all([
      new Promise<void>((res) => s1.on('connect', () => res())),
      new Promise<void>((res) => s2.on('connect', () => res())),
    ]);

    const createRes = await new Promise<{ success: boolean; data?: { id: string; roomCode: string } }>((res) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'uno_flex' } },
        (response: any) => res(response)
      );
    });
    const roomCode = createRes.data!.roomCode;
    const roomId = createRes.data!.id;

    await new Promise<{ success: boolean }>((res) => {
      s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, (response: any) => res(response));
    });
    await new Promise<{ success: boolean }>((res) => {
      s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, (response: any) => res(response));
    });

    let activeState: PlayerGameState | null = null;
    s1.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      if (payload.state.roomId === roomId) {
        activeState = payload.state;
      }
    });

    await new Promise<{ success: boolean }>((res) => {
      s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true } as any, (response: any) => res(response));
    });

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (activeState) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    const activePlayerId = session.state.players[session.state.currentPlayerIndex].id;
    const activeSocket = activePlayerId === p1Id ? s1 : s2;

    // Top discard: Blue 3
    const setTop = FlexFixtureBuilder.setTopDiscard(
      session.state,
      (c) => c.color === 'blue' && c.value === '3'
    );
    session.state = setTop.nextState;

    // Inject a Red card that flexes to Blue into active player's hand
    const swap = FlexFixtureBuilder.swapCardIntoHand(
      session.state,
      activePlayerId,
      (c) => c.color === 'red' && c.flexColor === 'blue'
    );
    session.state = swap.nextState;

    // Play card on flex side
    const playRes = await new Promise<{ success: boolean; data?: any }>((res) => {
      activeSocket.emit(
        SOCKET_EVENTS.GAME_PLAY_CARD,
        { cardId: swap.card.id, playMode: 'flex' },
        (response: any) => res(response)
      );
    });
    expect(playRes.success).toBe(true);

    // Verify active player's Power Card flipped to red_x
    const activeIdx = session.state.players.findIndex((p) => p.id === activePlayerId);
    expect(session.state.players[activeIdx].powerCardStatus).toBe('red_x');

    // Verify continuing color is regular color (red)
    expect(session.state.activeColor).toBe('red');

    await new Promise<void>((res) => s2.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
    await new Promise<void>((res) => s1.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
  });

  it('handles Targeted Draw Four over Socket.IO in UNO Flex', async () => {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);

    await Promise.all([
      new Promise<void>((res) => s1.on('connect', () => res())),
      new Promise<void>((res) => s2.on('connect', () => res())),
    ]);

    const createRes = await new Promise<{ success: boolean; data?: { roomCode: string } }>((res) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'uno_flex' } },
        (response: any) => res(response)
      );
    });
    const roomCode = createRes.data!.roomCode;

    await new Promise<{ success: boolean }>((res) => {
      s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, (response: any) => res(response));
    });
    await new Promise<{ success: boolean }>((res) => {
      s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, (response: any) => res(response));
    });

    let activeState: PlayerGameState | null = null;
    s1.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      activeState = payload.state;
    });

    await new Promise<{ success: boolean }>((res) => {
      s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true } as any, (response: any) => res(response));
    });

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (activeState) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    const activePlayerId = session.state.players[session.state.currentPlayerIndex].id;
    const opponentId = session.state.players.find((p) => p.id !== activePlayerId)!.id;
    const activeSocket = activePlayerId === p1Id ? s1 : s2;

    const swap = FlexFixtureBuilder.swapCardIntoHand(
      session.state,
      activePlayerId,
      (c) => c.value === 'flex_wild_draw_four'
    );
    session.state = swap.nextState;

    const opponentHandBefore = session.state.players.find((p) => p.id === opponentId)!.hand.length;

    // Play Flex Wild Draw Four with targetPlayerId in flex mode
    const playRes = await new Promise<{ success: boolean; data?: any }>((res) => {
      activeSocket.emit(
        SOCKET_EVENTS.GAME_PLAY_CARD,
        {
          cardId: swap.card.id,
          chosenColor: 'green',
          playMode: 'flex',
          targetPlayerId: opponentId,
        },
        (response: any) => res(response)
      );
    });
    expect(playRes.success).toBe(true);

    // Opponent received 4 cards without challenge flow
    const opponentAfter = session.state.players.find((p) => p.id === opponentId)!.hand.length;
    expect(opponentAfter).toBe(opponentHandBefore + 4);
    expect(session.state.activeColor).toBe('green');
  });

  it('handles final-card pending Targeted Draw Two over Socket.IO and finishes round on selection', async () => {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);

    await Promise.all([
      new Promise<void>((res) => s1.on('connect', () => res())),
      new Promise<void>((res) => s2.on('connect', () => res())),
    ]);

    const createRes = await new Promise<{ success: boolean; data?: { roomCode: string } }>((res) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'uno_flex' } },
        (response: any) => res(response)
      );
    });
    const roomCode = createRes.data!.roomCode;

    await new Promise<{ success: boolean }>((res) => {
      s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, (response: any) => res(response));
    });
    await new Promise<{ success: boolean }>((res) => {
      s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, (response: any) => res(response));
    });

    let activeState: PlayerGameState | null = null;
    s1.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      activeState = payload.state;
    });

    await new Promise<{ success: boolean }>((res) => {
      s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true } as any, (response: any) => res(response));
    });

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (activeState) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    const activePlayerId = session.state.players[session.state.currentPlayerIndex].id;
    const opponentId = session.state.players.find((p) => p.id !== activePlayerId)!.id;
    const activeSocket = activePlayerId === p1Id ? s1 : s2;

    const swap = FlexFixtureBuilder.swapCardIntoHand(
      session.state,
      activePlayerId,
      (c) => c.value === 'flex_wild_target_draw_two'
    );
    session.state = swap.nextState;

    // Make active player hold ONLY this final card
    const activeIdx = session.state.players.findIndex((p) => p.id === activePlayerId);
    const cardsToMove = session.state.players[activeIdx].hand.filter((c) => c.id !== swap.card.id);
    session.state = {
      ...session.state,
      drawPile: [...session.state.drawPile, ...cardsToMove],
      players: session.state.players.map((p, idx) =>
        idx === activeIdx ? { ...p, hand: [swap.card] } : p
      ),
    };
    assertValidFlexGameState(session.state);

    // Track round finished broadcast
    let roundFinishedReceived = false;
    let roundFinishedPayload: any = null;
    s1.on(SOCKET_EVENTS.GAME_ROUND_FINISHED, (payload: any) => {
      roundFinishedReceived = true;
      roundFinishedPayload = payload;
    });

    // 1. Play final card without targetPlayerId -> state remains IN_PROGRESS
    const playRes = await new Promise<{ success: boolean; data?: any }>((res) => {
      activeSocket.emit(
        SOCKET_EVENTS.GAME_PLAY_CARD,
        {
          cardId: swap.card.id,
          chosenColor: 'red',
          playMode: 'flex',
        },
        (response: any) => res(response)
      );
    });
    expect(playRes.success).toBe(true);
    expect(session.state.status).toBe('IN_PROGRESS');
    expect(session.state.pendingActionState?.type).toBe('AWAITING_TARGETED_DRAW_TWO_SELECTION');
    expect(roundFinishedReceived).toBe(false);

    // 2. Submit target selection
    const chooseRes = await new Promise<{ success: boolean; data?: any }>((res) => {
      activeSocket.emit(
        SOCKET_EVENTS.GAME_CHOOSE_TARGETED_DRAW_TWO,
        { targetPlayerId: opponentId },
        (response: any) => res(response)
      );
    });
    expect(chooseRes.success).toBe(true);

    // 3. Round is over, round finished broadcast received
    expect(session.state.status).toBe('ROUND_OVER');
    expect(session.state.roundWinner?.id).toBe(activePlayerId);
    expect(roundFinishedReceived).toBe(true);
    expect(roundFinishedPayload.roundWinner.id).toBe(activePlayerId);
  });

  it('handles final-card Wild Draw Four challenge flow over Socket.IO and finishes round on accept', async () => {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);

    await Promise.all([
      new Promise<void>((res) => s1.on('connect', () => res())),
      new Promise<void>((res) => s2.on('connect', () => res())),
    ]);

    const createRes = await new Promise<{ success: boolean; data?: { roomCode: string } }>((res) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'uno_flex' } },
        (response: any) => res(response)
      );
    });
    const roomCode = createRes.data!.roomCode;

    await new Promise<{ success: boolean }>((res) => {
      s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, (response: any) => res(response));
    });
    await new Promise<{ success: boolean }>((res) => {
      s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, (response: any) => res(response));
    });

    let activeState: PlayerGameState | null = null;
    s1.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      activeState = payload.state;
    });

    await new Promise<{ success: boolean }>((res) => {
      s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true } as any, (response: any) => res(response));
    });

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (activeState) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    const activePlayerId = session.state.players[session.state.currentPlayerIndex].id;
    const opponentId = session.state.players.find((p) => p.id !== activePlayerId)!.id;
    const activeSocket = activePlayerId === p1Id ? s1 : s2;
    const opponentSocket = opponentId === p1Id ? s1 : s2;

    const swap = FlexFixtureBuilder.swapCardIntoHand(
      session.state,
      activePlayerId,
      (c) => c.value === 'flex_wild_draw_four'
    );
    session.state = swap.nextState;

    // Active player has only this final card
    const activeIdx = session.state.players.findIndex((p) => p.id === activePlayerId);
    const cardsToMove = session.state.players[activeIdx].hand.filter((c) => c.id !== swap.card.id);
    session.state = {
      ...session.state,
      drawPile: [...session.state.drawPile, ...cardsToMove],
      players: session.state.players.map((p, idx) =>
        idx === activeIdx ? { ...p, hand: [swap.card] } : p
      ),
    };
    assertValidFlexGameState(session.state);

    let roundFinishedReceived = false;
    s1.on(SOCKET_EVENTS.GAME_ROUND_FINISHED, () => {
      roundFinishedReceived = true;
    });

    // 1. Active player plays Wild Draw Four on regular side -> awaits resolution
    const playRes = await new Promise<{ success: boolean; data?: any }>((res) => {
      activeSocket.emit(
        SOCKET_EVENTS.GAME_PLAY_CARD,
        {
          cardId: swap.card.id,
          chosenColor: 'blue',
          playMode: 'regular',
        },
        (response: any) => res(response)
      );
    });
    expect(playRes.success).toBe(true);
    expect(session.state.status).toBe('IN_PROGRESS');
    expect(session.state.pendingActionState?.type).toBe('AWAITING_WILD_DRAW_FOUR_RESOLUTION');
    expect(roundFinishedReceived).toBe(false);

    // 2. Opponent accepts
    const acceptRes = await new Promise<{ success: boolean; data?: any }>((res) => {
      opponentSocket.emit(
        SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR,
        {},
        (response: any) => res(response)
      );
    });
    expect(acceptRes.success).toBe(true);

    // 3. Round is over, active player wins
    expect(session.state.status).toBe('ROUND_OVER');
    expect(session.state.roundWinner?.id).toBe(activePlayerId);
    expect(roundFinishedReceived).toBe(true);
  });
});
