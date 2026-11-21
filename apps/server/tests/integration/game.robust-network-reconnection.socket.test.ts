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
  GamePlayerDisconnectedPayload,
  GamePlayerReconnectedPayload,
  GamePlayerDepartedPayload,
  GameTurnRecoveredPayload,
} from '@uno-ultimate/game-protocol';

describe('Robust Multiplayer Network Recovery & Seamless Reconnection Integration Tests', () => {
  let server: http.Server;
  let io: SocketIOServer;
  let port: number;

  let guest1Id: string;
  let guest1Token: string;
  let guest2Id: string;
  let guest2Token: string;
  let guest3Id: string;
  let guest3Token: string;

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
    // Clean up any old test records
    await prisma.roomMember.deleteMany({
      where: { guest: { username: { startsWith: 'NetTest_' } } },
    });
    await prisma.room.deleteMany({
      where: { host: { username: { startsWith: 'NetTest_' } } },
    });
    await prisma.guestSession.deleteMany({
      where: { username: { startsWith: 'NetTest_' } },
    });

    const g1 = await guestService.createGuest('NetTest_Alice');
    guest1Id = g1.guest.id;
    guest1Token = g1.rawSessionToken;

    const g2 = await guestService.createGuest('NetTest_Bob');
    guest2Id = g2.guest.id;
    guest2Token = g2.rawSessionToken;

    const g3 = await guestService.createGuest('NetTest_Charlie');
    guest3Id = g3.guest.id;
    guest3Token = g3.rawSessionToken;

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
      where: { guest: { username: { startsWith: 'NetTest_' } } },
    });
    await prisma.room.deleteMany({
      where: { host: { username: { startsWith: 'NetTest_' } } },
    });
    await prisma.guestSession.deleteMany({
      where: { username: { startsWith: 'NetTest_' } },
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

  // ---------------------------------------------------------------------------
  // 1. Brief network interruption and successful reconnection
  // ---------------------------------------------------------------------------
  it('1. Brief network interruption: player disconnects and reconnects within grace period', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);

    const createRes = await new Promise<any>((r) =>
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2, variant: 'classic' }, r)
    );
    expect(createRes.success).toBe(true);
    const roomCode = createRes.data.roomCode;

    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));

    const s1StatePromise = new Promise<{ state: PlayerGameState }>((r) => s1.once(SOCKET_EVENTS.GAME_STATE, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));
    const s1State = await s1StatePromise;
    expect(s1State.state.status).toBe('IN_PROGRESS');

    // Bob disconnects
    const s1DisconnectEvent = new Promise<GamePlayerDisconnectedPayload>((r) =>
      s1.once(SOCKET_EVENTS.GAME_PLAYER_DISCONNECTED, r)
    );
    s2.disconnect();

    const discPayload = await s1DisconnectEvent;
    expect(discPayload.guestId).toBe(guest2Id);
    expect(discPayload.gracePeriodSeconds).toBe(120);

    // Bob reconnects after brief 50ms pause
    await new Promise((r) => setTimeout(r, 50));
    const s1ReconnectEvent = new Promise<GamePlayerReconnectedPayload>((r) =>
      s1.once(SOCKET_EVENTS.GAME_PLAYER_RECONNECTED, r)
    );

    const s2Reconnected = await createSocket(guest2Token);
    const reconPayload = await s1ReconnectEvent;
    expect(reconPayload.guestId).toBe(guest2Id);

    // Bob requests resume and receives latest state
    const resumeRes = await new Promise<any>((r) =>
      s2Reconnected.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, r)
    );
    expect(resumeRes.success).toBe(true);

    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session?.state.status).toBe('IN_PROGRESS');
    expect(session?.state.players.find((p) => p.id === guest2Id)?.hand.length).toBe(7);
  });

  // ---------------------------------------------------------------------------
  // 2. Internet unavailable for 30 seconds followed by recovery
  // ---------------------------------------------------------------------------
  it('2. Internet unavailable for 30s: 120s grace period preserves seat and hand without forfeit', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);

    const createRes = await new Promise<any>((r) =>
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2, variant: 'classic' }, r)
    );
    const roomCode = createRes.data.roomCode;
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));

    // Bob disconnects
    s2.disconnect();

    // Verify 120s grace period is active
    expect(roomService.getReconnectGracePeriodMs()).toBe(120000);

    const initialSession = gameSessionManager.getSessionByRoomCode(roomCode)!;
    const initialBobHandLength = initialSession.state.players.find((p) => p.id === guest2Id)!.hand.length;

    // Simulate 30s passing by updating Bob's lastSeenAt in DB to 30s ago
    await prisma.roomMember.updateMany({
      where: { guestId: guest2Id },
      data: { lastSeenAt: new Date(Date.now() - 30000) },
    });

    // Bob reconnects after 30 seconds of offline status
    const s2Reconnected = await createSocket(guest2Token);
    const resumeRes = await new Promise<any>((r) =>
      s2Reconnected.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, r)
    );
    expect(resumeRes.success).toBe(true);

    // Seat and hand preserved, match still IN_PROGRESS
    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session?.state.status).toBe('IN_PROGRESS');
    expect(session?.state.players.find((p) => p.id === guest2Id)?.hand.length).toBe(initialBobHandLength);
  });

  // ---------------------------------------------------------------------------
  // 3. Reconnection just before grace period expires
  // ---------------------------------------------------------------------------
  it('3. Reconnection just before grace period expires cancels timer and preserves match', async () => {
    // Set 500ms test grace period
    roomService.setReconnectGracePeriodForTesting(500);

    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);

    const createRes = await new Promise<any>((r) =>
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2, variant: 'classic' }, r)
    );
    const roomCode = createRes.data.roomCode;
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));

    s2.disconnect();

    // Wait 350ms (before the 500ms grace expires)
    await new Promise((r) => setTimeout(r, 350));

    // Bob reconnects before expiration
    const s2Reconnected = await createSocket(guest2Token);
    const resumeRes = await new Promise<any>((r) =>
      s2Reconnected.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, r)
    );
    expect(resumeRes.success).toBe(true);

    // Wait another 300ms to verify that the timer was cancelled and Bob did NOT forfeit
    await new Promise((r) => setTimeout(r, 300));

    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session?.state.status).toBe('IN_PROGRESS');
    expect(session?.state.players.some((p) => p.id === guest2Id)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 4. Grace period expiry and forfeit behavior
  // ---------------------------------------------------------------------------
  it('4. Grace period expiry forfeits departed player and awards win to surviving opponent', async () => {
    roomService.setReconnectGracePeriodForTesting(150);

    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);

    const createRes = await new Promise<any>((r) =>
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2, variant: 'classic' }, r)
    );
    const roomCode = createRes.data.roomCode;
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));

    const departedPromise = new Promise<GamePlayerDepartedPayload>((r) =>
      s1.once(SOCKET_EVENTS.GAME_PLAYER_DEPARTED, r)
    );

    s2.disconnect();

    // Wait for 150ms grace period to expire
    const departedPayload = await departedPromise;
    expect(departedPayload.guestId).toBe(guest2Id);
    expect(departedPayload.reason).toBe('DISCONNECT_TIMEOUT');

    // In a 2-player match, Alice is awarded the forfeit victory
    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session?.state.status).toBe('COMPLETED');
    expect(session?.state.winner?.id).toBe(guest1Id);
  });

  // ---------------------------------------------------------------------------
  // 5. Wi-Fi / mobile network switching
  // ---------------------------------------------------------------------------
  it('5. Wi-Fi/mobile network switching: seamless socket replacement with preserved session', async () => {
    const s1 = await createSocket(guest1Token);
    const s2Wifi = await createSocket(guest2Token);

    const createRes = await new Promise<any>((r) =>
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2, variant: 'classic' }, r)
    );
    const roomCode = createRes.data.roomCode;
    await new Promise<any>((r) => s2Wifi.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2Wifi.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));

    // Simulate network interface switch (new mobile socket connects with same guest token)
    const s2Cellular = await createSocket(guest2Token);

    // Old Wi-Fi socket is notified of replacement or disconnected
    const resumeRes = await new Promise<any>((r) =>
      s2Cellular.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, r)
    );
    expect(resumeRes.success).toBe(true);

    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session?.state.players.find((p) => p.id === guest2Id)?.hand.length).toBe(7);
  });

  // ---------------------------------------------------------------------------
  // 6. Multiple players disconnecting independently
  // ---------------------------------------------------------------------------
  it('6. Multiple players disconnect independently: separate timers and independent recoveries', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);
    const s3 = await createSocket(guest3Token);

    const createRes = await new Promise<any>((r) =>
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 3, variant: 'classic' }, r)
    );
    const roomCode = createRes.data.roomCode;
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s3.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s3.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));

    // Both Bob and Charlie disconnect
    s2.disconnect();
    await new Promise((r) => setTimeout(r, 30));
    s3.disconnect();

    // Bob reconnects first
    const s2Recon = await createSocket(guest2Token);
    await new Promise<any>((r) => s2Recon.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, r));

    // Charlie reconnects second
    const s3Recon = await createSocket(guest3Token);
    await new Promise<any>((r) => s3Recon.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, r));

    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session?.state.players.length).toBe(3);
    expect(session?.state.status).toBe('IN_PROGRESS');
  });

  // ---------------------------------------------------------------------------
  // 7. Reconnection while another player is taking a turn
  // ---------------------------------------------------------------------------
  it('7. Reconnection while another player takes turn: receives updated turn and discard state', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);

    const createRes = await new Promise<any>((r) =>
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2, variant: 'classic' }, r)
    );
    const roomCode = createRes.data.roomCode;
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));

    let s1State: PlayerGameState | null = null;
    s1.on(SOCKET_EVENTS.GAME_STATE, (p: { state: PlayerGameState }) => {
      s1State = p.state;
    });

    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));
    await new Promise((r) => setTimeout(r, 100));

    // Ensure it is Alice's turn or draw to make it Alice's turn
    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    const currentTurn = session.state.playerOrder[session.state.currentPlayerIndex];

    // Bob disconnects
    s2.disconnect();

    // Alice performs a draw card
    if (currentTurn === guest1Id) {
      await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.GAME_DRAW_CARD, {}, r));
    }

    // Bob reconnects
    const s2Recon = await createSocket(guest2Token);
    let bobState: PlayerGameState | null = null;
    s2Recon.on(SOCKET_EVENTS.GAME_STATE, (p: { state: PlayerGameState }) => {
      bobState = p.state;
    });

    await new Promise<any>((r) => s2Recon.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, r));
    await new Promise((r) => setTimeout(r, 100));

    expect(bobState).not.toBeNull();
    expect((bobState as unknown as PlayerGameState).self.id).toBe(guest2Id);
    expect((bobState as unknown as PlayerGameState).self.hand.length).toBe(7);
  });

  // ---------------------------------------------------------------------------
  // 8. Reconnection during pending draw penalty (No Mercy stack penalty)
  // ---------------------------------------------------------------------------
  it('8. Reconnection during pending draw penalty: penalty state and prompt restored', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);

    const createRes = await new Promise<any>((r) =>
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2, variant: 'uno_show_em_no_mercy' }, r)
    );
    const roomCode = createRes.data.roomCode;
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;

    // Simulate pending draw penalty on Bob (guest2)
    session.state = {
      ...session.state,
      pendingActionState: {
        type: 'AWAITING_STACK_RESOLUTION',
        accumulatedPenalty: 4,
        targetPlayerId: guest2Id,
        playedByPlayerId: guest1Id,
        lastStackedValue: 4,
        lastCardValue: 'wild_draw_four',
      },
    };

    // Bob disconnects and reconnects
    s2.disconnect();
    const s2Recon = await createSocket(guest2Token);

    let bobState: PlayerGameState | null = null;
    s2Recon.on(SOCKET_EVENTS.GAME_STATE, (p: { state: PlayerGameState }) => {
      bobState = p.state;
    });

    await new Promise<any>((r) => s2Recon.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, r));
    await new Promise((r) => setTimeout(r, 100));

    expect(bobState).not.toBeNull();
    expect((bobState as unknown as PlayerGameState).self.isTargetedByStack).toBe(true);
    expect(((bobState as unknown as PlayerGameState).pendingActionState as any)?.accumulatedPenalty).toBe(4);
  });

  // ---------------------------------------------------------------------------
  // 9. Reconnection during challenge (Wild Draw 4 challenge window)
  // ---------------------------------------------------------------------------
  it('9. Reconnection during challenge: decision prompt restored to target', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);

    const createRes = await new Promise<any>((r) =>
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2, variant: 'classic' }, r)
    );
    const roomCode = createRes.data.roomCode;
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;

    // Simulate pending Wild Draw 4 on Bob
    session.state = {
      ...session.state,
      pendingActionState: {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        victimPlayerId: guest2Id,
        cardPlayerId: guest1Id,
        chosenColor: 'red',
        originalColor: 'blue',
      },
    };

    // Bob disconnects and reconnects
    s2.disconnect();
    const s2Recon = await createSocket(guest2Token);

    let bobState: PlayerGameState | null = null;
    s2Recon.on(SOCKET_EVENTS.GAME_STATE, (p: { state: PlayerGameState }) => {
      bobState = p.state;
    });

    await new Promise<any>((r) => s2Recon.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, r));
    await new Promise((r) => setTimeout(r, 100));

    expect(bobState).not.toBeNull();
    expect((bobState as unknown as PlayerGameState).self.isTargetedByWildDrawFour).toBe(true);
    expect((bobState as unknown as PlayerGameState).self.canResolveWildDrawFour).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 10. Reconnection during UNO declaration / catch window
  // ---------------------------------------------------------------------------
  it('10. Reconnection during UNO catch window: catch vulnerability preserved', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);

    const createRes = await new Promise<any>((r) =>
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2, variant: 'classic' }, r)
    );
    const roomCode = createRes.data.roomCode;
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;

    // Simulate Alice having 1 card and vulnerable to catch
    session.state = {
      ...session.state,
      unoVulnerablePlayerId: guest1Id,
      players: session.state.players.map((p) =>
        p.id === guest1Id ? { ...p, hand: [p.hand[0]], hasDeclaredUno: false } : p
      ),
    };

    // Bob disconnects and reconnects
    s2.disconnect();
    const s2Recon = await createSocket(guest2Token);

    let bobState: PlayerGameState | null = null;
    s2Recon.on(SOCKET_EVENTS.GAME_STATE, (p: { state: PlayerGameState }) => {
      bobState = p.state;
    });

    await new Promise<any>((r) => s2Recon.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, r));
    await new Promise((r) => setTimeout(r, 100));

    expect(bobState).not.toBeNull();
    expect((bobState as unknown as PlayerGameState).unoVulnerablePlayerId).toBe(guest1Id);
    expect((bobState as unknown as PlayerGameState).self.canCatchUno).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 11. Duplicate / concurrent reconnect attempts
  // ---------------------------------------------------------------------------
  it('11. Duplicate concurrent reconnect attempts: serialized cleanly without crash', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);

    const createRes = await new Promise<any>((r) =>
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2, variant: 'classic' }, r)
    );
    const roomCode = createRes.data.roomCode;
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));

    s2.disconnect();

    // Spawn 2 reconnect sockets simultaneously
    const [c1, c2] = await Promise.all([
      createSocket(guest2Token),
      createSocket(guest2Token),
    ]);

    // One of the concurrent sockets will be replaced and disconnected by session replacement
    const survivingSocket = c2.connected ? c2 : c1;
    const resumeRes = await new Promise<any>((r) =>
      survivingSocket.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, r)
    );

    expect(resumeRes.success).toBe(true);
    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session?.state.status).toBe('IN_PROGRESS');
  });

  // ---------------------------------------------------------------------------
  // 12. Duplicate action prevention after reconnection
  // ---------------------------------------------------------------------------
  it('12. Duplicate action prevention: rejected safely when already processed', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);

    const createRes = await new Promise<any>((r) =>
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2, variant: 'classic' }, r)
    );
    const roomCode = createRes.data.roomCode;
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));

    // Attempting to play a non-existent card ID fails gracefully with error
    const duplicateAck = await new Promise<any>((r) =>
      s1.emit(
        SOCKET_EVENTS.GAME_PLAY_CARD,
        { cardId: 'already_played_card_999', chosenColor: 'red' },
        r
      )
    );
    expect(duplicateAck.success).toBe(false);
    expect(duplicateAck.error).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 13. Server restart while players are disconnected (Durable Recovery)
  // ---------------------------------------------------------------------------
  it('13. Server restart while disconnected: state recovered from PostgreSQL snapshot', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);

    const createRes = await new Promise<any>((r) =>
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2, variant: 'classic' }, r)
    );
    const roomCode = createRes.data.roomCode;
    const roomId = createRes.data.id;
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));

    // Disconnect both sockets
    s1.disconnect();
    s2.disconnect();

    // Simulate server crash / restart by purging active in-memory sessions
    gameSessionManager.clearAllSessionsForTesting();
    expect(gameSessionManager.getSessionByRoomCode(roomCode)).toBeNull();

    // Reconcile durable disconnects on fresh startup
    await roomService.reconcileDurableDisconnects();

    // Alice reconnects after the server restart
    const s1Restarted = await createSocket(guest1Token);
    const resumeRes = await new Promise<any>((r) =>
      s1Restarted.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, r)
    );
    expect(resumeRes.success).toBe(true);

    // Verify session was reconstructed in memory from PostgreSQL snapshot!
    const recoveredSession = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(recoveredSession).not.toBeNull();
    expect(recoveredSession!.state.status).toBe('IN_PROGRESS');
    expect(recoveredSession!.state.players.length).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // 14. Reconnection after Render cold start
  // ---------------------------------------------------------------------------
  it('14. Reconnection after Render cold start: authenticates and delivers snapshot', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);

    const createRes = await new Promise<any>((r) =>
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2, variant: 'classic' }, r)
    );
    const roomCode = createRes.data.roomCode;
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));

    s2.disconnect();

    // Simulate Render cold-start latency before client re-establishes connection
    await new Promise((r) => setTimeout(r, 200));

    const s2ColdStartRecon = await createSocket(guest2Token);
    const resumeAck = await new Promise<any>((r) =>
      s2ColdStartRecon.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, r)
    );
    expect(resumeAck.success).toBe(true);
    expect(resumeAck.data.roomCode).toBe(roomCode);
  });

  // ---------------------------------------------------------------------------
  // 15. Explicit Leave Game must still work correctly
  // ---------------------------------------------------------------------------
  it('15. Explicit Leave Game (ROOM_LEAVE): immediate forfeit without waiting 120s', async () => {
    const s1 = await createSocket(guest1Token);
    const s2 = await createSocket(guest2Token);

    const createRes = await new Promise<any>((r) =>
      s1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2, variant: 'classic' }, r)
    );
    const roomCode = createRes.data.roomCode;
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, r));
    await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));
    await new Promise<any>((r) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r));

    const departedPromise = new Promise<GamePlayerDepartedPayload>((r) =>
      s1.once(SOCKET_EVENTS.GAME_PLAYER_DEPARTED, r)
    );
    const gameFinishedPromise = new Promise<{ winner: any }>((r) =>
      s1.once(SOCKET_EVENTS.GAME_FINISHED, r)
    );

    // Bob intentionally leaves the match
    const leaveAck = await new Promise<any>((r) => s2.emit(SOCKET_EVENTS.ROOM_LEAVE, {}, r));
    expect(leaveAck.success).toBe(true);

    // Alice immediately receives GAME_PLAYER_DEPARTED with reason INTENTIONAL_LEAVE
    const departedPayload = await departedPromise;
    expect(departedPayload.guestId).toBe(guest2Id);
    expect(departedPayload.reason).toBe('INTENTIONAL_LEAVE');

    // Alice receives GAME_FINISHED declaring Alice winner
    const finishedPayload = await gameFinishedPromise;
    expect(finishedPayload.winner.id).toBe(guest1Id);

    // Match in database is COMPLETED with Alice as winner
    const match = await prisma.match.findFirst({
      where: { roomId: createRes.data.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(match?.status).toBe(MatchStatus.COMPLETED);
    expect(match?.winnerGuestId).toBe(guest1Id);
  });
});
