import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { guestService } from '../../src/modules/guest/guest.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { cancelAllCountdownTimersForTesting } from '../../src/sockets/roomSocketHandler';
import { SOCKET_EVENTS, PlayerGameState } from '@uno-ultimate/game-protocol';
import { assertValidAttackGameState, AttackLauncher } from '@uno-ultimate/game-engine';

describe('UNO Attack — Server Socket.IO Multiplayer Integration Tests (Mattel Product GTX66)', () => {
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
        port = typeof addr === 'object' && addr ? addr.port : 4006;
        resolve();
      });
    });

    const s1 = await guestService.createGuest('AttackHost');
    p1Id = s1.guest.id;
    p1Token = s1.rawSessionToken;

    const s2 = await guestService.createGuest('AttackP2');
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
    AttackLauncher.setDeterministicOverride(null);
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

  it('creates and starts a UNO Attack match, verifies 112-card state and launcher operations', async () => {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);

    await Promise.all([
      new Promise<void>((res) => s1.on('connect', () => res())),
      new Promise<void>((res) => s2.on('connect', () => res())),
    ]);

    // Host creates room with variant 'uno_attack'
    const createRes = await new Promise<{ success: boolean; data?: { roomCode: string } }>((res) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'uno_attack' } },
        (response: any) => res(response)
      );
    });
    expect(createRes.success).toBe(true);
    const roomCode = createRes.data!.roomCode;

    // Player 2 joins
    const joinRes = await new Promise<{ success: boolean }>((res) => {
      s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, (response: any) => res(response));
    });
    expect(joinRes.success).toBe(true);

    // Player 2 readies up
    const readyRes = await new Promise<{ success: boolean }>((res) => {
      s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, (response: any) => res(response));
    });
    expect(readyRes.success).toBe(true);

    // Track state updates
    let p1State: PlayerGameState | null = null;
    let p2State: PlayerGameState | null = null;

    s1.on(SOCKET_EVENTS.GAME_STATE, (data: { state: PlayerGameState }) => {
      p1State = data.state;
    });

    s2.on(SOCKET_EVENTS.GAME_STATE, (data: { state: PlayerGameState }) => {
      p2State = data.state;
    });

    // Host starts match
    const startRes = await new Promise<{ success: boolean }>((res) => {
      s1.emit(SOCKET_EVENTS.ROOM_START, undefined, (response: any) => res(response));
    });
    expect(startRes.success).toBe(true);

    // Wait for match state
    await new Promise<void>((res) => {
      const interval = setInterval(() => {
        if (p1State && p2State) {
          clearInterval(interval);
          res();
        }
      }, 50);
    });

    expect(p1State!.variant).toBe('uno_attack');
    expect(p2State!.variant).toBe('uno_attack');

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    expect(session.state.variant).toBe('uno_attack');
    assertValidAttackGameState(session.state);

    // Verify 112 card conservation
    const totalCards =
      session.state.drawPile.length +
      session.state.discardPile.length +
      session.state.players.reduce((sum, p) => sum + p.hand.length, 0);
    expect(totalCards).toBe(112);

    // Identify current player
    const currentId = p1State!.currentTurnGuestId;
    const currentSocket = currentId === p1Id ? s1 : s2;

    // Test hitting the launcher via GAME_DRAW_CARD
    AttackLauncher.setDeterministicOverride(2); // Simulate launcher dispensing 2 cards
    const drawRes = await new Promise<{ success: boolean; data?: any }>((res) => {
      currentSocket.emit(SOCKET_EVENTS.GAME_DRAW_CARD, undefined, (response: any) => res(response));
    });
    expect(drawRes.success).toBe(true);

    // Verify turn advanced and conservation holds
    const afterSession = gameSessionManager.getSessionByRoomCode(roomCode)!;
    assertValidAttackGameState(afterSession.state);

    const afterTotalCards =
      afterSession.state.drawPile.length +
      afterSession.state.discardPile.length +
      afterSession.state.players.reduce((sum, p) => sum + p.hand.length, 0);
    expect(afterTotalCards).toBe(112);
  });

  it('creates and starts a UNO Attack match with 1 Wild Customizable card (110 cards)', async () => {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);

    await Promise.all([
      new Promise<void>((res) => s1.on('connect', () => res())),
      new Promise<void>((res) => s2.on('connect', () => res())),
    ]);

    // Host creates room with variant 'uno_attack' and 1 customizable card
    const createRes = await new Promise<{ success: boolean; data?: { roomCode: string } }>((res) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'uno_attack', attackCustomizableCount: 1 } },
        (response: any) => res(response)
      );
    });
    expect(createRes.success).toBe(true);
    const roomCode = createRes.data!.roomCode;

    await new Promise<{ success: boolean }>((res) => {
      s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, (response: any) => res(response));
    });
    await new Promise<{ success: boolean }>((res) => {
      s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, (response: any) => res(response));
    });

    let p1State: PlayerGameState | null = null;
    s1.on(SOCKET_EVENTS.GAME_STATE, (data: { state: PlayerGameState }) => {
      p1State = data.state;
    });

    const startRes = await new Promise<{ success: boolean }>((res) => {
      s1.emit(SOCKET_EVENTS.ROOM_START, undefined, (response: any) => res(response));
    });
    expect(startRes.success).toBe(true);

    await new Promise<void>((res) => {
      const interval = setInterval(() => {
        if (p1State) {
          clearInterval(interval);
          res();
        }
      }, 50);
    });

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    expect(session.state.attackCustomizableCount).toBe(1);
    assertValidAttackGameState(session.state);

    const totalCards =
      session.state.drawPile.length +
      session.state.discardPile.length +
      session.state.players.reduce((sum, p) => sum + p.hand.length, 0);
    expect(totalCards).toBe(110);
  });

  it('rejects room creation with attackCustomizableCount: 2', async () => {
    const s1 = createClient(p1Token);
    await new Promise<void>((res) => s1.on('connect', () => res()));

    const createRes = await new Promise<{ success: boolean; error?: { message: string } }>((res) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'uno_attack', attackCustomizableCount: 2 as any } },
        (response: any) => res(response)
      );
    });
    expect(createRes.success).toBe(false);
    s1.disconnect();
  });

  it('rejects settings update with attackCustomizableCount: 2', async () => {
    const s1 = createClient(p1Token);
    await new Promise<void>((res) => s1.on('connect', () => res()));

    const createRes = await new Promise<{ success: boolean; data?: { roomCode: string } }>((res) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'uno_attack', attackCustomizableCount: 3 } },
        (response: any) => res(response)
      );
    });
    expect(createRes.success).toBe(true);

    const updateRes = await new Promise<{ success: boolean; error?: { message: string } }>((res) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_UPDATE_SETTINGS,
        { settings: { variant: 'uno_attack', attackCustomizableCount: 2 } },
        (response: any) => res(response)
      );
    });
    expect(updateRes.success).toBe(false);
    s1.disconnect();
  });
});
