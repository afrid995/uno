import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { roomService } from '../../src/modules/room/room.service';
import { gameService } from '../../src/modules/game/game.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { prisma, MatchStatus } from '@uno-ultimate/database';
import { guestService } from '../../src/modules/guest/guest.service';
import {
  SOCKET_EVENTS,
  PlayerGameState,
  GameWinner,
  GamePlayerDisconnectedPayload,
  GamePlayerReconnectedPayload,
  GamePlayerDepartedPayload,
  GameTurnRecoveredPayload,
} from '@uno-ultimate/game-protocol';

describe('Multiplayer Disconnect, Leave, and Turn Recovery Socket Tests', () => {
  let server: http.Server;
  let io: SocketIOServer;
  let port: number;

  let guest1Id: string;
  let guest1Token: string;
  let guest2Id: string;
  let guest2Token: string;
  let guest3Id: string;
  let guest3Token: string;
  let guest4Id: string;
  let guest4Token: string;

  const activeClients: ClientSocket[] = [];

  const createSocket = (token: string): Promise<ClientSocket> => {
    return new Promise((resolve) => {
      const socket = ioClient(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket'],
        forceNew: true,
      });
      activeClients.push(socket);
      socket.on('connect', () => resolve(socket));
    });
  };

  beforeAll(async () => {
    // 1. Cleanup old test data
    await prisma.roomMember.deleteMany({
      where: { guest: { username: { startsWith: 'RecovTest_' } } },
    });
    await prisma.room.deleteMany({
      where: { host: { username: { startsWith: 'RecovTest_' } } },
    });
    await prisma.guestSession.deleteMany({
      where: { username: { startsWith: 'RecovTest_' } },
    });

    // 2. Create test guests
    const g1 = await guestService.createGuest('RecovTest_Alice');
    guest1Id = g1.guest.id;
    guest1Token = g1.rawSessionToken;

    const g2 = await guestService.createGuest('RecovTest_Bob');
    guest2Id = g2.guest.id;
    guest2Token = g2.rawSessionToken;

    const g3 = await guestService.createGuest('RecovTest_Charlie');
    guest3Id = g3.guest.id;
    guest3Token = g3.rawSessionToken;

    const g4 = await guestService.createGuest('RecovTest_David');
    guest4Id = g4.guest.id;
    guest4Token = g4.rawSessionToken;

    // 3. Start server
    const app = createApp();
    server = http.createServer(app);
    io = initializeSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address !== 'string') {
          port = address.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    for (const client of activeClients) {
      if (client.connected) client.disconnect();
    }
    roomService.shutdown();
    await new Promise<void>((resolve) => {
      io.close(() => {
        server.close(() => resolve());
      });
    });

    await prisma.roomMember.deleteMany({
      where: { guest: { username: { startsWith: 'RecovTest_' } } },
    });
    await prisma.room.deleteMany({
      where: { host: { username: { startsWith: 'RecovTest_' } } },
    });
    await prisma.guestSession.deleteMany({
      where: { username: { startsWith: 'RecovTest_' } },
    });
  });

  beforeEach(() => {
    roomService.resetReconnectGracePeriodForTesting();
  });

  afterEach(async () => {
    while (activeClients.length > 0) {
      const c = activeClients.pop();
      if (c?.connected) c.disconnect();
    }
    roomService.shutdown();
    gameSessionManager.clearAllSessionsForTesting();
    await new Promise((r) => setTimeout(r, 50));
  });

  it('1. Non-active player disconnects and reconnects within grace period without turn interruption', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);
    const s3 = await createSocket(guest3Token);

    // Host creates room with 4 max players, Classic variant
    const createRes = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 4, variant: 'classic' }, resolve);
    });
    expect(createRes.success).toBe(true);
    const roomCode = createRes.data.roomCode;

    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s3.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s3.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));

    const s1StatePromise = new Promise<{ state: PlayerGameState }>((r) => s1.once(SOCKET_EVENTS.GAME_STATE, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));
    const initialS1State = await s1StatePromise;

    const currentTurnGuestId = initialS1State.state.currentTurnGuestId;
    // Choose non-active player between guest2 and guest3
    const nonActiveGuestId = currentTurnGuestId === guest2Id ? guest3Id : guest2Id;
    const nonActiveSocket = nonActiveGuestId === guest2Id ? s2 : s3;
    const nonActiveToken = nonActiveGuestId === guest2Id ? guest2Token : guest3Token;

    // Listen for GAME_PLAYER_DISCONNECTED on s1
    const disconnectEventPromise = new Promise<GamePlayerDisconnectedPayload>((r) => {
      s1.once(SOCKET_EVENTS.GAME_PLAYER_DISCONNECTED, r);
    });

    // Disconnect non-active socket
    nonActiveSocket.disconnect();

    const discPayload = await disconnectEventPromise;
    expect(discPayload.guestId).toBe(nonActiveGuestId);
    expect(discPayload.gracePeriodSeconds).toBe(120);

    // Reconnect non-active player before grace period expires
    const reconnectedPromise = new Promise<GamePlayerReconnectedPayload>((r) => {
      s1.once(SOCKET_EVENTS.GAME_PLAYER_RECONNECTED, r);
    });

    const newSocket = await createSocket(nonActiveToken);
    const reconPayload = await reconnectedPromise;
    expect(reconPayload.guestId).toBe(nonActiveGuestId);

    // Active turn remains with original turn player
    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session?.state.playerOrder[session.state.currentPlayerIndex]).toBe(currentTurnGuestId);
  });

  it('2. Active player disconnects -> grace period expires -> turn automatically recovers to next player in clockwise rotation', async () => {
    // Set short grace period for test speed: 100ms
    roomService.setReconnectGracePeriodForTesting(100);

    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);
    const s3 = await createSocket(guest3Token);

    const createRes = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 4, variant: 'classic' }, resolve);
    });
    const roomCode = createRes.data.roomCode;

    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s3.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s3.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));

    const s1StatePromise = new Promise<{ state: PlayerGameState }>((r) => s1.once(SOCKET_EVENTS.GAME_STATE, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));
    const s1State = await s1StatePromise;

    const initialActiveId = s1State.state.currentTurnGuestId;
    const socketMap: Record<string, ClientSocket> = {
      [guest1Id]: s1,
      [guest2Id]: s2,
      [guest3Id]: s3,
    };
    const activeSocket = socketMap[initialActiveId];
    const observerSockets = [s1, s2, s3].filter((s) => s !== activeSocket);

    // Predict next active player based on authoritative turnDirection
    const oldOrder = s1State.state.playerOrder;
    const activeIdx = oldOrder.indexOf(initialActiveId);
    const step = s1State.state.turnDirection === 'clockwise' ? 1 : -1;
    const expectedNextActiveId = oldOrder[(((activeIdx + step) % oldOrder.length) + oldOrder.length) % oldOrder.length];

    // Setup listeners on surviving observer socket
    const observer = observerSockets[0];
    const departedPromise = new Promise<GamePlayerDepartedPayload>((r) => {
      observer.once(SOCKET_EVENTS.GAME_PLAYER_DEPARTED, r);
    });
    const turnRecoveredPromise = new Promise<GameTurnRecoveredPayload>((r) => {
      observer.once(SOCKET_EVENTS.GAME_TURN_RECOVERED, r);
    });

    // Active player disconnects
    activeSocket.disconnect();

    const [departed, recovered] = await Promise.all([departedPromise, turnRecoveredPromise]);
    expect(departed.guestId).toBe(initialActiveId);
    expect(departed.reason).toBe('DISCONNECT_TIMEOUT');

    expect(recovered.departedGuestId).toBe(initialActiveId);
    expect(recovered.newCurrentTurnGuestId).toBe(expectedNextActiveId);
    expect(recovered.reason).toBe('DISCONNECT_TIMEOUT');

    // Verify session updated correctly
    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session).toBeDefined();
    expect(session!.state.playerOrder).not.toContain(initialActiveId);
    expect(session!.state.players.find((p) => p.id === initialActiveId)).toBeUndefined();
    expect(session!.state.playerOrder[session!.state.currentPlayerIndex]).toBe(expectedNextActiveId);
  });

  it('3. Active player intentionally leaves (ROOM_LEAVE) -> Immediate turn progression without 30s delay', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);
    const s3 = await createSocket(guest3Token);

    const createRes = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 4, variant: 'classic' }, resolve);
    });
    const roomCode = createRes.data.roomCode;

    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s3.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s3.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));

    const s1StatePromise = new Promise<{ state: PlayerGameState }>((r) => s1.once(SOCKET_EVENTS.GAME_STATE, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));
    const s1State = await s1StatePromise;

    const initialActiveId = s1State.state.currentTurnGuestId;
    const socketMap: Record<string, ClientSocket> = {
      [guest1Id]: s1,
      [guest2Id]: s2,
      [guest3Id]: s3,
    };
    const activeSocket = socketMap[initialActiveId];
    const observer = [s1, s2, s3].find((s) => s !== activeSocket)!;

    const oldOrder = s1State.state.playerOrder;
    const activeIdx = oldOrder.indexOf(initialActiveId);
    const step = s1State.state.turnDirection === 'clockwise' ? 1 : -1;
    const expectedNextActiveId = oldOrder[(((activeIdx + step) % oldOrder.length) + oldOrder.length) % oldOrder.length];

    const turnRecoveredPromise = new Promise<GameTurnRecoveredPayload>((r) => {
      observer.once(SOCKET_EVENTS.GAME_TURN_RECOVERED, r);
    });

    const startTs = Date.now();
    // Active player emits ROOM_LEAVE
    const leaveAck = await new Promise<any>((r) => activeSocket.emit(SOCKET_EVENTS.ROOM_LEAVE, {}, r));
    expect(leaveAck.success).toBe(true);

    const recovered = await turnRecoveredPromise;
    const duration = Date.now() - startTs;

    // Must be immediate (under 1000ms), no 30s wait!
    expect(duration).toBeLessThan(1000);
    expect(recovered.departedGuestId).toBe(initialActiveId);
    expect(recovered.newCurrentTurnGuestId).toBe(expectedNextActiveId);
    expect(recovered.reason).toBe('INTENTIONAL_LEAVE');
  });

  it('4. 2-Player Match: When one player leaves, remaining player is immediately declared match winner by default/forfeit', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);

    const createRes = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2, variant: 'classic' }, resolve);
    });
    const roomCode = createRes.data.roomCode;

    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));

    const s1StatePromise = new Promise<{ state: PlayerGameState }>((r) => s1.once(SOCKET_EVENTS.GAME_STATE, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));
    await s1StatePromise;

    // Listen for GAME_FINISHED on s1
    const finishedPromise = new Promise<{ matchId?: string; winner: GameWinner; finalScores: Record<string, number> }>((r) => {
      s1.once(SOCKET_EVENTS.GAME_FINISHED, r);
    });

    // s2 intentionally leaves
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_LEAVE, {}, r));

    const finishEvent = await finishedPromise;
    expect(finishEvent.winner.id).toBe(guest1Id);
    expect(finishEvent.winner.username).toBe('RecovTest_Alice');

    // Verify database record
    const match = await prisma.match.findUnique({
      where: { id: finishEvent.matchId },
    });
    expect(match?.status).toBe(MatchStatus.COMPLETED);
    expect(match?.winnerGuestId).toBe(guest1Id);
  });

  it('5. UNO Show \'em No Mercy: Active player leaves during pending stack -> penalty resolved to setAsideCards and 168-card law preserved', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);
    const s3 = await createSocket(guest3Token);

    const createRes = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 4, settings: { variant: 'uno_show_em_no_mercy' } }, resolve);
    });
    const roomCode = createRes.data.roomCode;

    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s3.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s3.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));

    const s1StatePromise = new Promise<{ state: PlayerGameState }>((r) => s1.once(SOCKET_EVENTS.GAME_STATE, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));
    await s1StatePromise;

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    const activePlayerId = session.state.playerOrder[session.state.currentPlayerIndex];

    // Inject a pending stack penalty on active player
    session.state = {
      ...session.state,
      pendingActionState: {
        type: 'AWAITING_STACK_RESOLUTION',
        targetPlayerId: activePlayerId,
        playedByPlayerId: session.state.playerOrder[(session.state.currentPlayerIndex + 1) % 3],
        accumulatedPenalty: 4,
        lastStackedValue: 4,
        lastCardValue: 'draw_four',
      },
    };

    const socketMap: Record<string, ClientSocket> = {
      [guest1Id]: s1,
      [guest2Id]: s2,
      [guest3Id]: s3,
    };
    const targetSocket = socketMap[activePlayerId];
    const observer = [s1, s2, s3].find((s) => s !== targetSocket)!;

    const turnRecoveredPromise = new Promise<GameTurnRecoveredPayload>((r) => {
      observer.once(SOCKET_EVENTS.GAME_TURN_RECOVERED, r);
    });

    // Victim leaves room while facing +4 stack
    await new Promise<any>((r) => targetSocket.emit(SOCKET_EVENTS.ROOM_LEAVE, {}, r));

    const recovered = await turnRecoveredPromise;
    expect(recovered.departedGuestId).toBe(activePlayerId);

    // Verify 168-card conservation: draw pile + discard pile + players' hands + setAsideCards = 168
    const updatedSession = gameSessionManager.getSessionByRoomCode(roomCode)!;
    expect(updatedSession.state.pendingActionState).toBeNull();

    let totalCards = 0;
    totalCards += updatedSession.state.drawPile.length;
    totalCards += updatedSession.state.discardPile.length;
    totalCards += (updatedSession.state.setAsideCards || []).length;
    for (const p of updatedSession.state.players) {
      totalCards += p.hand.length;
    }

    expect(totalCards).toBe(168);
  });

  it('6. UNO Teams: 4-Player 2v2 Match -> Departure of 1 player declares remaining opposing team match winner', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);
    const s3 = await createSocket(guest3Token);
    const s4 = await createSocket(guest4Token);

    const createRes = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 4, settings: { variant: 'uno_teams' } }, resolve);
    });
    const roomCode = createRes.data.roomCode;

    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s3.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s4.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s3.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s4.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));

    const s1StatePromise = new Promise<{ state: PlayerGameState }>((r) => s1.once(SOCKET_EVENTS.GAME_STATE, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));
    const s1State = await s1StatePromise;

    // Team 1 is guest1 & guest3; Team 2 is guest2 & guest4
    const finishedPromise = new Promise<{ winner: GameWinner }>((r) => {
      s1.once(SOCKET_EVENTS.GAME_FINISHED, r);
    });

    // Guest2 (Team 2) departs
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_LEAVE, {}, r));

    const finishEvent = await finishedPromise;
    // Team 1 declared the match winner!
    expect(finishEvent.winner.username).toContain('team_1');
  });

  it('7. Turn direction counter-clockwise preserved on turn recovery', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);
    const s3 = await createSocket(guest3Token);

    const createRes = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 4, variant: 'classic' }, resolve);
    });
    const roomCode = createRes.data.roomCode;

    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s3.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s3.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));

    const s1StatePromise = new Promise<{ state: PlayerGameState }>((r) => s1.once(SOCKET_EVENTS.GAME_STATE, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));
    await s1StatePromise;

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    // Force turnDirection to counter_clockwise
    session.state = {
      ...session.state,
      turnDirection: 'counter_clockwise',
    };

    const activeId = session.state.playerOrder[session.state.currentPlayerIndex];
    const oldOrder = session.state.playerOrder;
    const activeIdx = oldOrder.indexOf(activeId);
    // Counter-clockwise next index: (activeIdx - 1 + length) % length
    const expectedNextId = oldOrder[(activeIdx - 1 + oldOrder.length) % oldOrder.length];

    const socketMap: Record<string, ClientSocket> = {
      [guest1Id]: s1,
      [guest2Id]: s2,
      [guest3Id]: s3,
    };
    const activeSocket = socketMap[activeId];
    const observer = [s1, s2, s3].find((s) => s !== activeSocket)!;

    const turnRecoveredPromise = new Promise<GameTurnRecoveredPayload>((r) => {
      observer.once(SOCKET_EVENTS.GAME_TURN_RECOVERED, r);
    });

    await new Promise<any>((r) => activeSocket.emit(SOCKET_EVENTS.ROOM_LEAVE, {}, r));

    const recovered = await turnRecoveredPromise;
    expect(recovered.newCurrentTurnGuestId).toBe(expectedNextId);
  });
});
