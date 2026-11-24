import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { guestService } from '../../src/modules/guest/guest.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { cancelAllCountdownTimersForTesting } from '../../src/sockets/roomSocketHandler';
import { SOCKET_EVENTS, PlayerGameState } from '@uno-ultimate/game-protocol';
import { prisma } from '@uno-ultimate/database';

describe('UNO Ultimate — Rematch & Cumulative Score Persistence Socket Integration Tests', () => {
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
        port = typeof addr === 'object' && addr ? addr.port : 4055;
        resolve();
      });
    });

    const hostSession = await guestService.createGuest('HostAlice');
    hostGuestId = hostSession.guest.id;
    hostToken = hostSession.rawSessionToken;

    const playerSession = await guestService.createGuest('PlayerBob');
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

  it('handles complete match completion, Play Again rematch by host, score persistence, and duplicate protection', async () => {
    const sHost = createClient(hostToken);
    const sPlayer = createClient(playerToken);

    await Promise.all([
      new Promise<void>((res) => sHost.on('connect', res)),
      new Promise<void>((res) => sPlayer.on('connect', res)),
    ]);

    // 1. Host creates room
    const createAck = await new Promise<any>((resolve) => {
      sHost.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'classic' } },
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

    // Verify initial scores are 0
    expect((hostGameState as PlayerGameState | null)?.self.id).toBe(hostGuestId);
    expect((hostGameState as PlayerGameState | null)?.players.find((p: any) => p.id === hostGuestId)?.score).toBe(0);
    expect((hostGameState as PlayerGameState | null)?.players.find((p: any) => p.id === playerGuestId)?.score).toBe(0);

    // 4. Simulate match 1 completion with Alice winning 520 pts
    await prisma.match.update({
      where: { id: match1Id },
      data: {
        status: 'COMPLETED',
        winnerGuestId: hostGuestId,
      },
    });
    await prisma.matchPlayer.updateMany({
      where: { matchId: match1Id, guestId: hostGuestId },
      data: { score: 520, isWinner: true },
    });
    await prisma.matchPlayer.updateMany({
      where: { matchId: match1Id, guestId: playerGuestId },
      data: { score: 180, isWinner: false },
    });
    await prisma.room.update({
      where: { id: roomId },
      data: { status: 'FINISHED' },
    });
    // Remove active memory session to simulate match 1 completion
    gameSessionManager.removeSessionByRoomCode(roomCode);

    // 5. Test unauthorized rematch request from non-host Bob: REJECTED!
    const unauthorizedRematchAck = await new Promise<any>((resolve) => {
      sPlayer.emit(SOCKET_EVENTS.ROOM_REMATCH, {}, resolve);
    });
    expect(unauthorizedRematchAck.success).toBe(false);
    expect(unauthorizedRematchAck.error?.code).toBe('HOST_ONLY_ACTION');

    // 6. Host starts rematch ("Play Again")
    let rematchStartedEvent: any = null;
    sPlayer.on(SOCKET_EVENTS.GAME_STARTED, (ev) => {
      rematchStartedEvent = ev;
    });

    const rematchAck = await new Promise<any>((resolve) => {
      sHost.emit(SOCKET_EVENTS.ROOM_REMATCH, { immediate: true }, resolve);
    });
    expect(rematchAck.success).toBe(true);
    expect(rematchAck.data?.starting).toBe(true);

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

    // Verify match-specific state is reset:
    expect(match2Session.state.roundNumber).toBe(1);
    expect(match2Session.state.turnNumber).toBe(1);
    expect(match2Session.state.sequenceNumber).toBe(0);
    expect(match2Session.state.discardPile.length).toBe(1);
    expect(match2Session.state.players[0].hand.length).toBe(7);
    expect(match2Session.state.players[1].hand.length).toBe(7);

    // Verify cumulative scores are preserved in the new match!
    const hostPlayerInMatch2 = match2Session.state.players.find((p) => p.id === hostGuestId)!;
    const guestPlayerInMatch2 = match2Session.state.players.find((p) => p.id === playerGuestId)!;

    // Match score starts at 0 for the fresh match
    expect(hostPlayerInMatch2.score).toBe(0);
    expect(guestPlayerInMatch2.score).toBe(0);

    // Cumulative scores preserve the previous match totals: Alice 520, Bob 180!
    expect(hostPlayerInMatch2.cumulativeScore).toBe(520);
    expect(guestPlayerInMatch2.cumulativeScore).toBe(180);

    // PlayerGameState projection also carries the cumulative scores
    const hostViewInMatch2 = hostGameState!;
    expect(hostViewInMatch2.players.find((p) => p.id === hostGuestId)?.cumulativeScore).toBe(520);
    expect(hostViewInMatch2.players.find((p) => p.id === playerGuestId)?.cumulativeScore).toBe(180);

    // 7. Verify duplicate rematch click prevention while match is in progress
    const duplicateRematchAck = await new Promise<any>((resolve) => {
      sHost.emit(SOCKET_EVENTS.ROOM_REMATCH, {}, resolve);
    });
    expect(duplicateRematchAck.success).toBe(false);
    expect(duplicateRematchAck.error?.message).toMatch(/already in progress/i);

    // 8. Consecutive Rematch: complete match 2 and start match 3!
    const match2Id = match2Session.state.id;
    await prisma.match.update({
      where: { id: match2Id },
      data: { status: 'COMPLETED', winnerGuestId: playerGuestId },
    });
    await prisma.matchPlayer.updateMany({
      where: { matchId: match2Id, guestId: hostGuestId },
      data: { score: 200, isWinner: false },
    });
    await prisma.matchPlayer.updateMany({
      where: { matchId: match2Id, guestId: playerGuestId },
      data: { score: 540, isWinner: true },
    });
    await prisma.room.update({
      where: { id: roomId },
      data: { status: 'FINISHED' },
    });
    gameSessionManager.removeSessionByRoomCode(roomCode);

    // Host starts Rematch 2
    const rematch2Ack = await new Promise<any>((resolve) => {
      sHost.emit(SOCKET_EVENTS.ROOM_REMATCH, {}, resolve);
    });
    expect(rematch2Ack.success).toBe(true);

    const match3Session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    expect(match3Session.state.id).not.toBe(match2Id);
    expect(match3Session.state.id).not.toBe(match1Id);

    // Cumulative score now preserves both matches:
    // Alice: 520 + 200 = 720
    // Bob: 180 + 540 = 720
    const hostInMatch3 = match3Session.state.players.find((p) => p.id === hostGuestId)!;
    const playerInMatch3 = match3Session.state.players.find((p) => p.id === playerGuestId)!;
    expect(hostInMatch3.cumulativeScore).toBe(720);
    expect(playerInMatch3.cumulativeScore).toBe(720);

    // 9. Verify reconnecting during a rematch preserves cumulative scores
    sHost.disconnect();
    const sHostReconnected = createClient(hostToken);
    await new Promise<void>((res) => sHostReconnected.on('connect', res));

    let reconnectedState: PlayerGameState | null = null;
    const statePromise = new Promise<void>((resolve) => {
      sHostReconnected.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
        reconnectedState = payload.state;
        resolve();
      });
    });

    const resumeAck = await new Promise<any>((resolve) => {
      sHostReconnected.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, (res: any) => {
        resolve(res);
      });
    });
    expect(resumeAck.success).toBe(true);

    await statePromise;
    expect((reconnectedState as PlayerGameState | null)?.players.find((p: any) => p.id === hostGuestId)?.cumulativeScore).toBe(720);

    // 10. Clean up room
    await new Promise<void>((res) => sPlayer.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
    await new Promise<void>((res) => sHostReconnected.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
  }, 35000);

  it('rejects rematch when fewer than 2 active players remain in the room', async () => {
    const sHost = createClient(hostToken);
    const sPlayer = createClient(playerToken);

    await Promise.all([
      new Promise<void>((res) => sHost.on('connect', res)),
      new Promise<void>((res) => sPlayer.on('connect', res)),
    ]);

    const createAck = await new Promise<any>((resolve) => {
      sHost.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, resolve);
    });
    const roomCode = createAck.data.roomCode;
    const roomId = createAck.data.id;

    await new Promise<any>((resolve) => sPlayer.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve));
    await new Promise<any>((resolve) => sPlayer.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve));

    await new Promise<any>((resolve) => sHost.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve));

    // Player leaves room
    await new Promise<any>((resolve) => sPlayer.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, resolve));

    // Host attempts rematch with only 1 player in the room
    const rematchAck = await new Promise<any>((resolve) => {
      sHost.emit(SOCKET_EVENTS.ROOM_REMATCH, { immediate: true }, resolve);
    });
    expect(rematchAck.success).toBe(false);
    expect(rematchAck.error?.code).toBe('NOT_ENOUGH_PLAYERS');

    await new Promise<void>((res) => sHost.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
  });
});
