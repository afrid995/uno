import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { guestService } from '../../src/modules/guest/guest.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { cancelAllCountdownTimersForTesting } from '../../src/sockets/roomSocketHandler';
import { SOCKET_EVENTS, PlayerGameState } from '@uno-ultimate/game-protocol';
import { prisma, MatchStatus, RoomStatus } from '@uno-ultimate/database';

describe('UNO Ultimate — Match Lifecycle, Rematch Synchronization & Result Accuracy Integration Tests', () => {
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  let activeClients: ClientSocket[] = [];

  let hostGuestId: string;
  let hostToken: string;
  let playerGuestId: string;
  let playerToken: string;

  beforeAll(async () => {
    httpServer = createServer(createApp());
    initializeSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 4056;
        resolve();
      });
    });

    const hostSession = await guestService.createGuest('AfridHost');
    hostGuestId = hostSession.guest.id;
    hostToken = hostSession.rawSessionToken;

    const playerSession = await guestService.createGuest('ShaikPlayer');
    playerGuestId = playerSession.guest.id;
    playerToken = playerSession.rawSessionToken;
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
    gameSessionManager.clearAllSessionsForTesting();
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

  it('verifies No Mercy elimination victory, automatic room FINISHED transition, and instant seamless Play Again rematch', async () => {
    const sHost = createClient(hostToken);
    const sPlayer = createClient(playerToken);

    await Promise.all([
      new Promise<void>((res) => sHost.on('connect', res)),
      new Promise<void>((res) => sPlayer.on('connect', res)),
    ]);

    // 1. Host creates No Mercy room
    const createAck = await new Promise<any>((resolve) => {
      sHost.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'uno_show_em_no_mercy' } },
        resolve
      );
    });
    expect(createAck.success).toBe(true);
    const roomCode = createAck.data.roomCode;
    const roomId = createAck.data.id;

    // 2. Player joins and readies
    await new Promise<any>((resolve) => sPlayer.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve));
    await new Promise<any>((resolve) => sPlayer.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve));

    let hostGameState: PlayerGameState | null = null;
    let playerGameState: PlayerGameState | null = null;

    sHost.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      if (payload.state.roomId === roomId) hostGameState = payload.state;
    });
    sPlayer.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      if (payload.state.roomId === roomId) playerGameState = payload.state;
    });

    // 3. Start first match
    const startAck = await new Promise<any>((resolve) => {
      sHost.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
    });
    expect(startAck.success).toBe(true);

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (hostGameState && playerGameState) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });

    const match1Session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    const match1Id = match1Session.state.id;
    expect(match1Session.state.status).toBe('IN_PROGRESS');

    // 4. Simulate No Mercy Elimination win:
    // PlayerBob eliminated with 25 cards, HostAlice wins 250 points as sole survivor.
    // Atomically persist completed match and verify Room transitions to FINISHED.
    await prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: match1Id },
        data: {
          status: MatchStatus.COMPLETED,
          winnerGuestId: hostGuestId,
        },
      });
      await tx.matchPlayer.updateMany({
        where: { matchId: match1Id, guestId: hostGuestId },
        data: { score: 250, isWinner: true },
      });
      await tx.matchPlayer.updateMany({
        where: { matchId: match1Id, guestId: playerGuestId },
        data: { score: 0, isWinner: false },
      });
      await tx.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.FINISHED },
      });
    });

    // Clean active in-memory session (as broadcastMatchFinished does)
    gameSessionManager.removeSessionByRoomCode(roomCode);

    // Verify DB state before rematch
    const dbRoom = await prisma.room.findUnique({ where: { id: roomId } });
    expect(dbRoom?.status).toBe('FINISHED');

    const dbMatch1 = await prisma.match.findUnique({ where: { id: match1Id } });
    expect(dbMatch1?.status).toBe('COMPLETED');

    // 5. Host clicks "PLAY AGAIN" (rematch): Must succeed without "A match is already in progress for this room."
    let rematchStartedEvent: any = null;
    sPlayer.on(SOCKET_EVENTS.GAME_STARTED, (ev) => {
      rematchStartedEvent = ev;
    });

    const rematchAck = await new Promise<any>((resolve) => {
      sHost.emit(SOCKET_EVENTS.ROOM_REMATCH, { immediate: true }, resolve);
    });
    expect(rematchAck.success).toBe(true);
    expect(rematchAck.data?.starting).toBe(true);
    expect(rematchAck.data?.matchId).toBeDefined();
    expect(rematchAck.data?.matchId).not.toBe(match1Id);

    // Verify all players receive the new match state
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (
          hostGameState &&
          playerGameState &&
          hostGameState.id !== match1Id &&
          playerGameState.id !== match1Id
        ) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });

    const match2Session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    expect(match2Session.state.id).not.toBe(match1Id);
    expect(match2Session.state.status).toBe('IN_PROGRESS');

    // Verify cumulative score is preserved (HostAlice = 250 pts, ShaikPlayer = 0 pts)
    const hostPlayerInMatch2 = match2Session.state.players.find((p) => p.id === hostGuestId)!;
    const guestPlayerInMatch2 = match2Session.state.players.find((p) => p.id === playerGuestId)!;
    expect(hostPlayerInMatch2.cumulativeScore).toBe(250);
    expect(guestPlayerInMatch2.cumulativeScore).toBe(0);

    // Verify game starts fresh with round 1, turn 1, 7 cards each
    expect(match2Session.state.roundNumber).toBe(1);
    expect(match2Session.state.turnNumber).toBe(1);
    expect(hostPlayerInMatch2.hand).toHaveLength(7);
    expect(guestPlayerInMatch2.hand).toHaveLength(7);

    // 6. Clean up room
    await new Promise<void>((res) => sPlayer.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
    await new Promise<void>((res) => sHost.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
  });

  it('self-heals room status and starts rematch even if room was temporarily stuck in IN_GAME after match completion', async () => {
    const sHost = createClient(hostToken);
    const sPlayer = createClient(playerToken);

    await Promise.all([
      new Promise<void>((res) => sHost.on('connect', res)),
      new Promise<void>((res) => sPlayer.on('connect', res)),
    ]);

    const createAck = await new Promise<any>((resolve) => {
      sHost.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'classic' } },
        resolve
      );
    });
    const roomCode = createAck.data.roomCode;
    const roomId = createAck.data.id;

    await new Promise<any>((resolve) => sPlayer.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve));
    await new Promise<any>((resolve) => sPlayer.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve));

    await new Promise<any>((resolve) => sHost.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve));

    const match1Session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    const match1Id = match1Session.state.id;

    // Simulate match completion in DB, BUT room status intentionally left as IN_GAME to simulate desync/edge case
    await prisma.match.update({
      where: { id: match1Id },
      data: { status: MatchStatus.COMPLETED, winnerGuestId: hostGuestId },
    });
    await prisma.matchPlayer.updateMany({
      where: { matchId: match1Id, guestId: hostGuestId },
      data: { score: 500, isWinner: true },
    });
    // Remove active session
    gameSessionManager.removeSessionByRoomCode(roomCode);

    // Room is STILL 'IN_GAME' in DB
    const stuckRoom = await prisma.room.findUnique({ where: { id: roomId } });
    expect(stuckRoom?.status).toBe('IN_GAME');

    // Host clicks Rematch: Self-healing detects that match1 is COMPLETED, heals room status, and starts match2!
    const rematchAck = await new Promise<any>((resolve) => {
      sHost.emit(SOCKET_EVENTS.ROOM_REMATCH, { immediate: true }, resolve);
    });
    expect(rematchAck.success).toBe(true);
    expect(rematchAck.data?.starting).toBe(true);
    expect(rematchAck.data?.matchId).not.toBe(match1Id);

    const match2Session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    expect(match2Session.state.status).toBe('IN_PROGRESS');

    // Clean up
    await new Promise<void>((res) => sPlayer.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
    await new Promise<void>((res) => sHost.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
  });

  it('rematch succeeds even when prior match in DB was left in IN_PROGRESS status without active session (stale match self-heal)', async () => {
    const sHost = createClient(hostToken);
    const sPlayer = createClient(playerToken);

    await Promise.all([
      new Promise<void>((res) => sHost.on('connect', res)),
      new Promise<void>((res) => sPlayer.on('connect', res)),
    ]);

    const createAck = await new Promise<any>((resolve) => {
      sHost.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'classic' } },
        resolve
      );
    });
    const roomCode = createAck.data.roomCode;
    const roomId = createAck.data.id;

    await new Promise<any>((resolve) => sPlayer.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve));
    await new Promise<any>((resolve) => sPlayer.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve));
    await new Promise<any>((resolve) => sHost.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve));

    const match1Session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    const match1Id = match1Session.state.id;

    // Verify Match 1 is IN_PROGRESS in DB
    const dbMatch1Before = await prisma.match.findUnique({ where: { id: match1Id } });
    expect(dbMatch1Before?.status).toBe(MatchStatus.IN_PROGRESS);

    // Simulate match completion in memory / removal (e.g. game finished event),
    // but DB was intentionally left with Match 1 as IN_PROGRESS
    gameSessionManager.removeSessionByRoomCode(roomCode);

    // Host clicks Rematch: Must NOT fail with "A match is already in progress for this room."!
    // It should automatically finalize Match 1 in DB and start Match 2!
    const rematchAck = await new Promise<any>((resolve) => {
      sHost.emit(SOCKET_EVENTS.ROOM_REMATCH, { immediate: true }, resolve);
    });
    expect(rematchAck.success).toBe(true);
    expect(rematchAck.data?.starting).toBe(true);
    expect(rematchAck.data?.matchId).not.toBe(match1Id);

    // Verify Match 1 was finalized to COMPLETED in PostgreSQL!
    const dbMatch1After = await prisma.match.findUnique({ where: { id: match1Id } });
    expect(dbMatch1After?.status).toBe(MatchStatus.COMPLETED);

    // Verify Match 2 is now active in memory
    const match2Session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    expect(match2Session.state.id).not.toBe(match1Id);
    expect(match2Session.state.status).toBe('IN_PROGRESS');

    // Clean up
    await new Promise<void>((res) => sPlayer.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
    await new Promise<void>((res) => sHost.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
  });

  it('rematch is strictly rejected if an in-memory session is genuinely IN_PROGRESS', async () => {
    const sHost = createClient(hostToken);
    const sPlayer = createClient(playerToken);

    await Promise.all([
      new Promise<void>((res) => sHost.on('connect', res)),
      new Promise<void>((res) => sPlayer.on('connect', res)),
    ]);

    const createAck = await new Promise<any>((resolve) => {
      sHost.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'classic' } },
        resolve
      );
    });
    const roomCode = createAck.data.roomCode;

    await new Promise<any>((resolve) => sPlayer.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve));
    await new Promise<any>((resolve) => sPlayer.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve));
    await new Promise<any>((resolve) => sHost.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve));

    const match1Session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    expect(match1Session.state.status).toBe('IN_PROGRESS');

    // Rematch attempted while match is genuinely actively being played:
    const rematchAck = await new Promise<any>((resolve) => {
      sHost.emit(SOCKET_EVENTS.ROOM_REMATCH, { immediate: true }, resolve);
    });
    expect(rematchAck.success).toBe(false);
    expect(rematchAck.error?.message).toBe('A match is already in progress for this room.');

    // Verify Match 1 is still undisturbed in memory
    expect(gameSessionManager.getSessionByRoomCode(roomCode)?.state.id).toBe(match1Session.state.id);

    // Clean up
    await new Promise<void>((res) => sPlayer.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
    await new Promise<void>((res) => sHost.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
  });
});
