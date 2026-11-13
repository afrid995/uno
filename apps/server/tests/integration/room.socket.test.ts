import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { roomService } from '../../src/modules/room/room.service';
import { prisma } from '@uno-ultimate/database';
import { guestService } from '../../src/modules/guest/guest.service';
import { SOCKET_EVENTS } from '@uno-ultimate/game-protocol';
import { RoomPublicDto } from '@uno-ultimate/shared';

describe('Room Socket.IO Integration Tests', () => {
  let server: http.Server;
  let io: SocketIOServer;
  let port: number;
  let hostGuestId: string;
  let hostToken: string;
  let playerGuestId: string;
  let playerToken: string;
  let extraGuestId: string;
  let extraToken: string;
  const activeClients: ClientSocket[] = [];

  beforeAll(async () => {
    // Clean up test data
    await prisma.roomMember.deleteMany({
      where: { guest: { username: { startsWith: 'SockTest_' } } },
    });
    await prisma.room.deleteMany({
      where: { host: { username: { startsWith: 'SockTest_' } } },
    });
    await prisma.guestSession.deleteMany({
      where: { username: { startsWith: 'SockTest_' } },
    });

    // Create guest accounts
    const hostRes = await guestService.createGuest('SockTest_Host');
    hostGuestId = hostRes.guest.id;
    hostToken = hostRes.rawSessionToken;

    const playerRes = await guestService.createGuest('SockTest_Player');
    playerGuestId = playerRes.guest.id;
    playerToken = playerRes.rawSessionToken;

    const extraRes = await guestService.createGuest('SockTest_Extra');
    extraGuestId = extraRes.guest.id;
    extraToken = extraRes.rawSessionToken;

    // Start test server on ephemeral port
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
      if (client.connected) {
        client.disconnect();
      }
    }
    await new Promise((r) => setTimeout(r, 50));
    roomService.shutdown();
    await new Promise<void>((resolve) => {
      io.close(() => {
        server.close(() => resolve());
      });
    });
    await prisma.roomMember.deleteMany({
      where: { guest: { username: { startsWith: 'SockTest_' } } },
    });
    await prisma.room.deleteMany({
      where: { host: { username: { startsWith: 'SockTest_' } } },
    });
    await prisma.guestSession.deleteMany({
      where: { username: { startsWith: 'SockTest_' } },
    });
    await prisma.$disconnect();
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

  it('rejects room:create for unauthenticated socket connection', async () => {
    const anonSocket = createClient();
    await new Promise<void>((resolve) => anonSocket.on('connect', resolve));

    const ack = await new Promise<any>((resolve) => {
      anonSocket.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 4 }, resolve);
    });

    expect(ack.success).toBe(false);
    expect(ack.error.code).toBe('UNAUTHORIZED');
    anonSocket.disconnect();
  });

  it('full lobby workflow: create, join, ready status, settings update, start game, host transfer', async () => {
    const hostSocket = createClient(hostToken);
    const playerSocket = createClient(playerToken);

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', resolve)),
      new Promise<void>((resolve) => playerSocket.on('connect', resolve)),
    ]);

    // 1. Host creates room
    const createAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, resolve);
    });

    expect(createAck.success).toBe(true);
    const roomCode = createAck.data.roomCode;
    expect(roomCode).toHaveLength(6);
    expect(createAck.data.hostGuestId).toBe(hostGuestId);
    expect(createAck.data.members).toHaveLength(1);
    expect(createAck.data.members[0].role).toBe('HOST');

    // 2. Setup listener on host for player join
    const playerJoinedPromise = new Promise<any>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.ROOM_PLAYER_JOINED, resolve);
    });

    // Player joins room
    const joinAck = await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });

    expect(joinAck.success).toBe(true);
    expect(joinAck.data.members).toHaveLength(2);

    const playerJoinedEvent = await playerJoinedPromise;
    expect(playerJoinedEvent.player.guestId).toBe(playerGuestId);
    expect(playerJoinedEvent.player.username).toBe('SockTest_Player');

    // 3. Reject 3rd player when room is at maxPlayers capacity (2)
    const extraSocket = createClient(extraToken);
    await new Promise<void>((resolve) => extraSocket.on('connect', resolve));

    const fullAck = await new Promise<any>((resolve) => {
      extraSocket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });
    expect(fullAck.success).toBe(false);
    expect(fullAck.error.code).toBe('ROOM_FULL');
    extraSocket.disconnect();

    // 4. Host cannot start game if player is not ready
    const startFailAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_START, {}, resolve);
    });
    expect(startFailAck.success).toBe(false);
    expect(startFailAck.error.code).toBe('PLAYERS_NOT_READY');

    // 5. Player sets ready
    const hostReadyPromise = new Promise<any>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.ROOM_PLAYER_READY, resolve);
    });

    const readyAck = await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });
    expect(readyAck.success).toBe(true);
    expect(readyAck.data.readyStatus).toBe(true);

    const hostReadyEvent = await hostReadyPromise;
    expect(hostReadyEvent.guestId).toBe(playerGuestId);
    expect(hostReadyEvent.isReady).toBe(true);

    // 6. Non-host player cannot update settings
    const forbiddenSettingsAck = await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_UPDATE_SETTINGS, { settings: { custom: true } }, resolve);
    });
    expect(forbiddenSettingsAck.success).toBe(false);
    expect(forbiddenSettingsAck.error.code).toBe('HOST_ONLY_ACTION');

    // 7. Host updates settings successfully
    const settingsAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_UPDATE_SETTINGS, { settings: { turnTimeout: 30 } }, resolve);
    });
    expect(settingsAck.success).toBe(true);

    // 8. Host starts game (all ready) -> broadcasts room:starting
    const playerStartingPromise = new Promise<any>((resolve) => {
      playerSocket.once(SOCKET_EVENTS.ROOM_STARTING, resolve);
    });

    const startAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_START, {}, resolve);
    });
    expect(startAck.success).toBe(true);
    expect(startAck.data.starting).toBe(true);

    const startingEvent = await playerStartingPromise;
    expect(startingEvent.countdownSeconds).toBe(5);

    // 9. Host leaves room -> transfers host deterministically to remaining player
    const hostChangedPromise = new Promise<any>((resolve) => {
      playerSocket.once(SOCKET_EVENTS.ROOM_HOST_CHANGED, resolve);
    });

    const leaveAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_LEAVE, {}, resolve);
    });
    expect(leaveAck.success).toBe(true);

    const hostChangedEvent = await hostChangedPromise;
    expect(hostChangedEvent.newHostGuestId).toBe(playerGuestId);

    // Disconnect sockets
    hostSocket.disconnect();
    playerSocket.disconnect();
  });
});
