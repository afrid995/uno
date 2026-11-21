import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { guestService } from '../../src/modules/guest/guest.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { cancelAllCountdownTimersForTesting, startingRoomLocks } from '../../src/sockets/roomSocketHandler';
import { SOCKET_EVENTS, PlayerGameState } from '@uno-ultimate/game-protocol';
import { gamePersistenceService } from '../../src/modules/game/game.persistence.service';
import { prisma } from '@uno-ultimate/database';

describe('Game Start Latency, Concurrency & Immediate Response Test Suite', () => {
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  let activeClients: ClientSocket[] = [];

  const connectClient = (token: string): ClientSocket => {
    const socket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      autoConnect: true,
    });
    activeClients.push(socket);
    return socket;
  };

  beforeAll(async () => {
    httpServer = createServer(createApp());
    initializeSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 4010;
        resolve();
      });
    });
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

  it('1. Normal game start with two players starts immediately (< 200ms) without 5-second delay', async () => {
    const host = await guestService.createGuest('PerfHost_2P');
    const player = await guestService.createGuest('PerfPlayer_2P');
    const sHost = connectClient(host.rawSessionToken);
    const sPlayer = connectClient(player.rawSessionToken);

    await Promise.all([
      new Promise<void>((r) => sHost.on('connect', r)),
      new Promise<void>((r) => sPlayer.on('connect', r)),
    ]);

    const createRes: any = await new Promise((r) =>
      sHost.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, r)
    );
    const roomCode = createRes.data.roomCode;

    await new Promise((r) => sPlayer.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise((r) => sPlayer.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));

    const hostStartedPromise = new Promise<any>((r) => sHost.once(SOCKET_EVENTS.GAME_STARTED, r));
    const playerStartedPromise = new Promise<any>((r) => sPlayer.once(SOCKET_EVENTS.GAME_STARTED, r));

    const startEmitTime = Date.now();
    const startRes: any = await new Promise((r) => sHost.emit(SOCKET_EVENTS.ROOM_START, {}, r));
    const startAckDuration = Date.now() - startEmitTime;

    expect(startRes.success).toBe(true);
    expect(startAckDuration).toBeLessThan(1000); // Immediate acknowledgement, no 5000ms delay!

    const [hostStarted, playerStarted] = await Promise.all([hostStartedPromise, playerStartedPromise]);
    const totalDuration = Date.now() - startEmitTime;

    expect(hostStarted.matchId).toBeDefined();
    expect(playerStarted.matchId).toBe(hostStarted.matchId);
    expect(totalDuration).toBeLessThan(1500); // Complete round trip to start under 1.5s (typically ~50ms)
  });

  it('2. Multi-player start: all 4 players receive personalized initial game state', async () => {
    const guests = await Promise.all([
      guestService.createGuest('MHost_4P'),
      guestService.createGuest('MP2_4P'),
      guestService.createGuest('MP3_4P'),
      guestService.createGuest('MP4_4P'),
    ]);

    const sockets = guests.map((g) => connectClient(g.rawSessionToken));
    await Promise.all(sockets.map((s) => new Promise<void>((r) => s.on('connect', r))));

    const createRes: any = await new Promise((r) =>
      sockets[0].emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 4 }, r)
    );
    const roomCode = createRes.data.roomCode;

    for (let i = 1; i < 4; i++) {
      await new Promise((r) => sockets[i].emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
      await new Promise((r) => sockets[i].emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    }

    const statePromises = sockets.map(
      (s) => new Promise<{ state: PlayerGameState }>((r) => s.once(SOCKET_EVENTS.GAME_STATE, r))
    );

    const startRes: any = await new Promise((r) => sockets[0].emit(SOCKET_EVENTS.ROOM_START, {}, r));
    expect(startRes.success).toBe(true);

    const states = await Promise.all(statePromises);
    expect(states).toHaveLength(4);
    states.forEach((s, idx) => {
      expect(s.state.self.id).toBe(guests[idx].guest.id);
      expect(s.state.self.hand.length).toBeGreaterThanOrEqual(7);
      expect(s.state.players).toHaveLength(4);
      expect(s.state.status).toBe('IN_PROGRESS');
      expect(s.state.topDiscardCard).toBeDefined();
    });
  });

  it('3. Rejects non-host attempt to start game with HOST_ONLY_ACTION', async () => {
    const host = await guestService.createGuest('NH_Host');
    const player = await guestService.createGuest('NH_Player');
    const sHost = connectClient(host.rawSessionToken);
    const sPlayer = connectClient(player.rawSessionToken);

    await Promise.all([
      new Promise<void>((r) => sHost.on('connect', r)),
      new Promise<void>((r) => sPlayer.on('connect', r)),
    ]);

    const createRes: any = await new Promise((r) =>
      sHost.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, r)
    );
    const roomCode = createRes.data.roomCode;

    await new Promise((r) => sPlayer.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise((r) => sPlayer.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));

    // Player (non-host) tries to start game
    const nonHostStartRes: any = await new Promise((r) => sPlayer.emit(SOCKET_EVENTS.ROOM_START, {}, r));
    expect(nonHostStartRes.success).toBe(false);
    expect(nonHostStartRes.error.code).toBe('HOST_ONLY_ACTION');
  });

  it('4. Rejects start when players are not ready or player count is insufficient', async () => {
    const host = await guestService.createGuest('NR_Host');
    const player = await guestService.createGuest('NR_Player');
    const sHost = connectClient(host.rawSessionToken);
    const sPlayer = connectClient(player.rawSessionToken);

    await Promise.all([
      new Promise<void>((r) => sHost.on('connect', r)),
      new Promise<void>((r) => sPlayer.on('connect', r)),
    ]);

    // Only host in room
    const createRes: any = await new Promise((r) =>
      sHost.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, r)
    );
    const roomCode = createRes.data.roomCode;

    const aloneStartRes: any = await new Promise((r) => sHost.emit(SOCKET_EVENTS.ROOM_START, {}, r));
    expect(aloneStartRes.success).toBe(false);
    expect(aloneStartRes.error.code).toBe('NOT_ENOUGH_PLAYERS');

    // Player joins but is not ready
    await new Promise((r) => sPlayer.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    const notReadyRes: any = await new Promise((r) => sHost.emit(SOCKET_EVENTS.ROOM_START, {}, r));
    expect(notReadyRes.success).toBe(false);
    expect(notReadyRes.error.code).toBe('PLAYERS_NOT_READY');
  });

  it('5. Protects against duplicate concurrent Start Game requests', async () => {
    const host = await guestService.createGuest('DupHost');
    const player = await guestService.createGuest('DupPlayer');
    const sHost = connectClient(host.rawSessionToken);
    const sPlayer = connectClient(player.rawSessionToken);

    await Promise.all([
      new Promise<void>((r) => sHost.on('connect', r)),
      new Promise<void>((r) => sPlayer.on('connect', r)),
    ]);

    const createRes: any = await new Promise((r) =>
      sHost.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, r)
    );
    const roomCode = createRes.data.roomCode;

    await new Promise((r) => sPlayer.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise((r) => sPlayer.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));

    // Fire 2 simultaneous start requests from host
    const [res1, res2]: [any, any] = await Promise.all([
      new Promise((r) => sHost.emit(SOCKET_EVENTS.ROOM_START, {}, r)),
      new Promise((r) => sHost.emit(SOCKET_EVENTS.ROOM_START, {}, r)),
    ]);

    // Exactly one must succeed, the other rejected or deduplicated
    const successCount = [res1, res2].filter((r) => r.success).length;
    expect(successCount).toBe(1);

    // Verify only ONE active match exists in DB for this room
    const matches = await prisma.match.findMany({
      where: { room: { roomCode } },
    });
    expect(matches).toHaveLength(1);
    expect(startingRoomLocks.has(roomCode)).toBe(false);
  });

  it('6. Reconnection immediately after start recovers game state accurately', async () => {
    const host = await guestService.createGuest('ReconHost');
    const player = await guestService.createGuest('ReconPlayer');
    const sHost = connectClient(host.rawSessionToken);
    const sPlayer = connectClient(player.rawSessionToken);

    await Promise.all([
      new Promise<void>((r) => sHost.on('connect', r)),
      new Promise<void>((r) => sPlayer.on('connect', r)),
    ]);

    const createRes: any = await new Promise((r) =>
      sHost.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, r)
    );
    const roomCode = createRes.data.roomCode;

    await new Promise((r) => sPlayer.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise((r) => sPlayer.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));

    const startRes: any = await new Promise((r) => sHost.emit(SOCKET_EVENTS.ROOM_START, {}, r));
    expect(startRes.success).toBe(true);

    // Player disconnects and connects new socket to resume
    sPlayer.disconnect();

    const sPlayerRecon = connectClient(player.rawSessionToken);
    await new Promise<void>((r) => sPlayerRecon.on('connect', r));

    const resumePromise = new Promise<{ state: PlayerGameState }>((r) =>
      sPlayerRecon.once(SOCKET_EVENTS.GAME_STATE, r)
    );

    const resumeRes: any = await new Promise((r) =>
      sPlayerRecon.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, r)
    );
    expect(resumeRes.success).toBe(true);

    const recovered = await resumePromise;
    expect(recovered.state.self.id).toBe(player.guest.id);
    expect(recovered.state.status).toBe('IN_PROGRESS');
    expect(recovered.state.self.hand.length).toBeGreaterThanOrEqual(7);
  });

  it('7. All seven game variants start immediately with correct decks and card distributions', async () => {
    const variants: { variant: string; playerCount: number; expectedHandSize: number }[] = [
      { variant: 'classic', playerCount: 2, expectedHandSize: 7 },
      { variant: 'uno_flip', playerCount: 2, expectedHandSize: 7 },
      { variant: 'uno_show_em_no_mercy', playerCount: 3, expectedHandSize: 7 },
      { variant: 'uno_all_wild', playerCount: 2, expectedHandSize: 7 },
      { variant: 'uno_flex', playerCount: 2, expectedHandSize: 7 },
      { variant: 'uno_teams', playerCount: 4, expectedHandSize: 7 },
      { variant: 'uno_attack', playerCount: 2, expectedHandSize: 7 },
    ];

    for (const v of variants) {
      const gList = await Promise.all(
        Array.from({ length: v.playerCount }, (_, i) =>
          guestService.createGuest(`VarHost_${v.variant}_${i}`)
        )
      );

      const sList = gList.map((g) => connectClient(g.rawSessionToken));
      await Promise.all(sList.map((s) => new Promise<void>((r) => s.on('connect', r))));

      const createRes: any = await new Promise((r) =>
        sList[0].emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: v.playerCount }, r)
      );
      const roomCode = createRes.data.roomCode;

      // Update variant settings
      await new Promise((r) =>
        sList[0].emit(SOCKET_EVENTS.ROOM_UPDATE_SETTINGS, { settings: { variant: v.variant } }, r)
      );

      for (let i = 1; i < v.playerCount; i++) {
        await new Promise((r) => sList[i].emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
        await new Promise((r) => sList[i].emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
      }

      const hostStartedPromise = new Promise<any>((r) => sList[0].once(SOCKET_EVENTS.GAME_STARTED, r));
      const hostStatePromise = new Promise<{ state: PlayerGameState }>((r) =>
        sList[0].once(SOCKET_EVENTS.GAME_STATE, r)
      );

      const startTime = Date.now();
      const startRes: any = await new Promise((r) => sList[0].emit(SOCKET_EVENTS.ROOM_START, {}, r));
      const elapsedMs = Date.now() - startTime;

      expect(startRes.success).toBe(true);
      expect(elapsedMs).toBeLessThan(1000); // Immediate initialization across all 7 variants!

      const started = await hostStartedPromise;
      const state = await hostStatePromise;

      expect(started.matchId).toBeDefined();
      expect(state.state.variant).toBe(v.variant);
      expect(state.state.self.hand.length).toBeGreaterThanOrEqual(v.expectedHandSize);
      expect(state.state.players).toHaveLength(v.playerCount);

      // Clean up for next variant
      sList.forEach((s) => s.disconnect());
    }
  });

  it('8. Database failure during initialization cleanly releases lock and reports error', async () => {
    const host = await guestService.createGuest('FailHost');
    const player = await guestService.createGuest('FailPlayer');
    const sHost = connectClient(host.rawSessionToken);
    const sPlayer = connectClient(player.rawSessionToken);

    await Promise.all([
      new Promise<void>((r) => sHost.on('connect', r)),
      new Promise<void>((r) => sPlayer.on('connect', r)),
    ]);

    const createRes: any = await new Promise((r) =>
      sHost.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, r)
    );
    const roomCode = createRes.data.roomCode;

    await new Promise((r) => sPlayer.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise((r) => sPlayer.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));

    // Temporarily mock createMatch to throw a simulated database failure
    const originalCreateMatch = gamePersistenceService.createMatch;
    gamePersistenceService.createMatch = async () => {
      throw new Error('Simulated PostgreSQL connection failure during transaction');
    };

    try {
      const startRes: any = await new Promise((r) => sHost.emit(SOCKET_EVENTS.ROOM_START, {}, r));
      expect(startRes.success).toBe(false);
      expect(startRes.error.message).toMatch(/Failed to start game|Simulated PostgreSQL/i);

      // Mutex lock must be released in finally block
      expect(startingRoomLocks.has(roomCode)).toBe(false);
    } finally {
      gamePersistenceService.createMatch = originalCreateMatch;
    }
  });
});
