import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { guestService } from '../../src/modules/guest/guest.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { cancelAllCountdownTimersForTesting } from '../../src/sockets/roomSocketHandler';
import { SOCKET_EVENTS, PlayerGameState } from '@uno-ultimate/game-protocol';
import { AllWildFixtureBuilder, assertValidAllWildGameState } from '@uno-ultimate/game-engine';
import { gamePersistenceService } from '../../src/modules/game/game.persistence.service';
import request from 'supertest';

describe('UNO All Wild — Server Socket.IO Multiplayer Integration Tests', () => {
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
        port = typeof addr === 'object' && addr ? addr.port : 4003;
        resolve();
      });
    });

    const s1 = await guestService.createGuest('WildHost');
    p1Id = s1.guest.id;
    p1Token = s1.rawSessionToken;

    const s2 = await guestService.createGuest('WildPlayer2');
    p2Id = s2.guest.id;
    p2Token = s2.rawSessionToken;

    const s3 = await guestService.createGuest('WildPlayer3');
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

  it('creates and starts an All Wild match: verifies 112 cards, no active color, and plays card directly without color picker', async () => {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);

    await Promise.all([
      new Promise<void>((res) => s1.on('connect', () => res())),
      new Promise<void>((res) => s2.on('connect', () => res())),
    ]);

    // Host creates room with variant 'uno_all_wild'
    const createRes = await new Promise<{ success: boolean; data?: { roomCode: string } }>((res) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 4, settings: { variant: 'uno_all_wild' } },
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

    // Setup state listener
    let p1State: PlayerGameState | null = null;
    let p2State: PlayerGameState | null = null;

    s1.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      p1State = payload.state;
    });
    s2.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      p2State = payload.state;
    });

    // Start match
    const startRes = await new Promise<{ success: boolean }>((res) => {
      s1.emit(SOCKET_EVENTS.ROOM_START, {}, (response: any) => res(response));
    });
    expect(startRes.success).toBe(true);

    // Wait for initial game state
    await new Promise<void>((res) => {
      const check = setInterval(() => {
        if (p1State && p2State) {
          clearInterval(check);
          res();
        }
      }, 50);
    });

    expect(p1State!.variant).toBe('uno_all_wild');
    expect(p1State!.self.hand).toHaveLength(7);
    expect(p2State!.self.hand).toHaveLength(7);
    expect(p1State!.activeColor).toBeNull();

    // Verify match in session manager satisfies 112 cards invariant
    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session).toBeDefined();
    assertValidAllWildGameState(session!.state);

    // Inject a wild card into active player's hand and play it directly without chosenColor
    const activeGuestId = session!.state.players[session!.state.currentPlayerIndex].id;
    const activeClient = activeGuestId === p1Id ? s1 : s2;

    const { card } = AllWildFixtureBuilder.injectPlayableCard(
      session!.state,
      activeGuestId,
      'wild'
    );

    const playRes = await new Promise<{ success: boolean }>((res) => {
      activeClient.emit(
        SOCKET_EVENTS.GAME_PLAY_CARD,
        { cardId: card.id },
        (response: any) => res(response)
      );
    });
    expect(playRes.success).toBe(true);

    // Verify turn advanced
    const updatedSession = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(updatedSession!.state.topDiscardCard.id).toBe(card.id);
    assertValidAllWildGameState(updatedSession!.state);
  });

  it('handles Targeted Draw Two and Forced Swap socket flows', async () => {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);
    const s3 = createClient(p3Token);

    await Promise.all([
      new Promise<void>((res) => s1.on('connect', () => res())),
      new Promise<void>((res) => s2.on('connect', () => res())),
      new Promise<void>((res) => s3.on('connect', () => res())),
    ]);

    const createRes = await new Promise<{ success: boolean; data?: { roomCode: string } }>((res) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 3, settings: { variant: 'uno_all_wild' } },
        (response: any) => res(response)
      );
    });
    const roomCode = createRes.data!.roomCode;

    await new Promise((res) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, res));
    await new Promise((res) => s3.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, res));
    await new Promise((res) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, res));
    await new Promise((res) => s3.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, res));

    await new Promise((res) => s1.emit(SOCKET_EVENTS.ROOM_START, {}, res));

    await new Promise<void>((res) => {
      const check = setInterval(() => {
        const sess = gameSessionManager.getSessionByRoomCode(roomCode);
        if (sess && sess.state.status === 'IN_PROGRESS') {
          clearInterval(check);
          res();
        }
      }, 50);
    });

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    const currentActiveId = session.state.players[session.state.currentPlayerIndex].id;
    const activeClient = currentActiveId === p1Id ? s1 : currentActiveId === p2Id ? s2 : s3;
    const otherPlayers = session.state.players.filter((p) => p.id !== currentActiveId);
    const targetPlayer = otherPlayers[0];
    const initialTargetHandCount = targetPlayer.hand.length;

    // Inject and play Wild Targeted Draw Two
    const { nextState: sWithTd2, card: td2Card } = AllWildFixtureBuilder.injectPlayableCard(
      session.state,
      currentActiveId,
      'wild_targeted_draw_two'
    );
    session.state = sWithTd2;

    const playTd2Res = await new Promise<{ success: boolean }>((res) => {
      activeClient.emit(
        SOCKET_EVENTS.GAME_PLAY_CARD,
        { cardId: td2Card.id },
        (response: any) => res(response)
      );
    });
    expect(playTd2Res.success).toBe(true);

    // Verify session entered pending state
    const intermediateSession = gameSessionManager.getSessionByRoomCode(roomCode)!;
    expect(intermediateSession.state.pendingActionState?.type).toBe('AWAITING_TARGETED_DRAW_TWO_SELECTION');

    // Select target
    const chooseTargetRes = await new Promise<{ success: boolean }>((res) => {
      activeClient.emit(
        SOCKET_EVENTS.GAME_CHOOSE_TARGETED_DRAW_TWO,
        { targetPlayerId: targetPlayer.id },
        (response: any) => res(response)
      );
    });
    expect(chooseTargetRes.success).toBe(true);

    // Target player should have drawn 2 cards
    const resolvedSession = gameSessionManager.getSessionByRoomCode(roomCode)!;
    const updatedTargetPlayer = resolvedSession.state.players.find((p) => p.id === targetPlayer.id)!;
    expect(updatedTargetPlayer.hand).toHaveLength(initialTargetHandCount + 2);
    expect(resolvedSession.state.pendingActionState).toBeNull();
    assertValidAllWildGameState(resolvedSession.state);
  });

  it('resolves final-card Targeted Draw Two and final-card Forced Swap over Socket.IO and updates DB state', async () => {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);

    await Promise.all([
      new Promise<void>((res) => s1.on('connect', () => res())),
      new Promise<void>((res) => s2.on('connect', () => res())),
    ]);

    // 1. Create Room & Start Match
    const createRes = await new Promise<{ success: boolean; data?: { roomCode: string } }>((res) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'uno_all_wild' } },
        (response: any) => res(response)
      );
    });
    const roomCode = createRes.data!.roomCode;

    await new Promise((res) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, res));
    await new Promise((res) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, res));
    await new Promise((res) => s1.emit(SOCKET_EVENTS.ROOM_START, {}, res));

    await new Promise<void>((res) => {
      const check = setInterval(() => {
        const sess = gameSessionManager.getSessionByRoomCode(roomCode);
        if (sess && sess.state.status === 'IN_PROGRESS') {
          clearInterval(check);
          res();
        }
      }, 50);
    });

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    const activePlayerId = session.state.players[session.state.currentPlayerIndex].id;
    const otherPlayerId = session.state.players.find((p) => p.id !== activePlayerId)!.id;
    const activeSocket = activePlayerId === p1Id ? s1 : s2;

    // Set active player hand to 1 card: Wild Targeted Draw Two
    const s1Hand = AllWildFixtureBuilder.setHandSize(session.state, activePlayerId, 1);
    const { nextState: sWithTd2, card: td2Card } = AllWildFixtureBuilder.injectPlayableCard(
      s1Hand,
      activePlayerId,
      'wild_targeted_draw_two'
    );
    session.state = sWithTd2;

    // Play final Targeted Draw Two
    const playRes = await new Promise<{ success: boolean }>((res) => {
      activeSocket.emit(
        SOCKET_EVENTS.GAME_PLAY_CARD,
        { cardId: td2Card.id },
        (response: any) => res(response)
      );
    });
    expect(playRes.success).toBe(true);

    // Verify intermediate state: IN_PROGRESS with AWAITING_TARGETED_DRAW_TWO_SELECTION
    const midSession = gameSessionManager.getSessionByRoomCode(roomCode)!;
    expect(midSession.state.status).toBe('IN_PROGRESS');
    expect(midSession.state.pendingActionState?.type).toBe('AWAITING_TARGETED_DRAW_TWO_SELECTION');
    expect(midSession.state.players.find((p) => p.id === activePlayerId)!.hand).toHaveLength(0);

    // Choose target
    const chooseTargetRes = await new Promise<{ success: boolean }>((res) => {
      activeSocket.emit(
        SOCKET_EVENTS.GAME_CHOOSE_TARGETED_DRAW_TWO,
        { targetPlayerId: otherPlayerId },
        (response: any) => res(response)
      );
    });
    expect(chooseTargetRes.success).toBe(true);

    // Verify completed state: ROUND_OVER, active player won!
    const wonSession = gameSessionManager.getSessionByRoomCode(roomCode)!;
    expect(['ROUND_OVER', 'COMPLETED']).toContain(wonSession.state.status);
    expect(wonSession.state.roundWinner?.id).toBe(activePlayerId);
    expect(wonSession.state.pendingActionState).toBeNull();
    assertValidAllWildGameState(wonSession.state);

    // Verify DB persistence
    const persisted = await gamePersistenceService.loadLatestSnapshot(session.matchId);
    expect(persisted).toBeDefined();
    expect(persisted?.roundWinner?.id).toBe(activePlayerId);

    // 2. Now Test Final Forced Swap in a fresh match
    const createRes2 = await new Promise<{ success: boolean; data?: { roomCode: string } }>((res) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'uno_all_wild' } },
        (response: any) => res(response)
      );
    });
    const roomCode2 = createRes2.data!.roomCode;

    await new Promise((res) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode: roomCode2 }, res));
    await new Promise((res) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, res));
    await new Promise((res) => s1.emit(SOCKET_EVENTS.ROOM_START, {}, res));

    await new Promise<void>((res) => {
      const check = setInterval(() => {
        const sess = gameSessionManager.getSessionByRoomCode(roomCode2);
        if (sess && sess.state.status === 'IN_PROGRESS') {
          clearInterval(check);
          res();
        }
      }, 50);
    });

    const session2 = gameSessionManager.getSessionByRoomCode(roomCode2)!;
    const activeId2 = session2.state.players[session2.state.currentPlayerIndex].id;
    const targetId2 = session2.state.players.find((p) => p.id !== activeId2)!.id;
    const activeSocket2 = activeId2 === p1Id ? s1 : s2;

    // Set active player to 1 card: Wild Forced Swap, target to 3 cards
    const s2HandA = AllWildFixtureBuilder.setHandSize(session2.state, activeId2, 1);
    const s2HandB = AllWildFixtureBuilder.setHandSize(s2HandA, targetId2, 3);
    const { nextState: sWithSwap, card: swapCard } = AllWildFixtureBuilder.injectPlayableCard(
      s2HandB,
      activeId2,
      'wild_forced_swap'
    );
    session2.state = sWithSwap;

    // Play final Forced Swap
    const playSwapRes = await new Promise<{ success: boolean }>((res) => {
      activeSocket2.emit(
        SOCKET_EVENTS.GAME_PLAY_CARD,
        { cardId: swapCard.id },
        (response: any) => res(response)
      );
    });
    expect(playSwapRes.success).toBe(true);

    const midSession2 = gameSessionManager.getSessionByRoomCode(roomCode2)!;
    expect(midSession2.state.status).toBe('IN_PROGRESS');
    expect(midSession2.state.pendingActionState?.type).toBe('AWAITING_FORCED_SWAP_SELECTION');

    // Choose target for swap
    const chooseSwapRes = await new Promise<{ success: boolean }>((res) => {
      activeSocket2.emit(
        SOCKET_EVENTS.GAME_CHOOSE_FORCED_SWAP,
        { targetPlayerId: targetId2 },
        (response: any) => res(response)
      );
    });
    expect(chooseSwapRes.success).toBe(true);

    // Target player received 0 cards, so target player WINS!
    const wonSession2 = gameSessionManager.getSessionByRoomCode(roomCode2)!;
    expect(['ROUND_OVER', 'COMPLETED']).toContain(wonSession2.state.status);
    expect(wonSession2.state.roundWinner?.id).toBe(targetId2);
    expect(wonSession2.state.roundWinner?.id).not.toBe(activeId2);
    expect(wonSession2.state.players.find((p) => p.id === activeId2)!.hand).toHaveLength(3);
    expect(wonSession2.state.players.find((p) => p.id === targetId2)!.hand).toHaveLength(0);
    assertValidAllWildGameState(wonSession2.state);
  }, 30000);
});
