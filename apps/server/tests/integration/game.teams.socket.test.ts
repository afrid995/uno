import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { guestService } from '../../src/modules/guest/guest.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { cancelAllCountdownTimersForTesting } from '../../src/sockets/roomSocketHandler';
import { SOCKET_EVENTS, PlayerGameState } from '@uno-ultimate/game-protocol';
import { assertValidTeamsGameState } from '@uno-ultimate/game-engine';
import { gamePersistenceService } from '../../src/modules/game/game.persistence.service';

describe('UNO Teams — Server Socket.IO Multiplayer Integration Tests (Mattel Product HXT58)', () => {
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  let activeClients: ClientSocket[] = [];

  let p1Id: string;
  let p1Token: string;
  let p2Id: string;
  let p2Token: string;
  let p3Id: string;
  let p3Token: string;
  let p4Id: string;
  let p4Token: string;

  beforeAll(async () => {
    httpServer = createServer(createApp());
    initializeSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 4005;
        resolve();
      });
    });

    const s1 = await guestService.createGuest('TeamsHost');
    p1Id = s1.guest.id;
    p1Token = s1.rawSessionToken;

    const s2 = await guestService.createGuest('TeamsP2');
    p2Id = s2.guest.id;
    p2Token = s2.rawSessionToken;

    const s3 = await guestService.createGuest('TeamsP3');
    p3Id = s3.guest.id;
    p3Token = s3.rawSessionToken;

    const s4 = await guestService.createGuest('TeamsP4');
    p4Id = s4.guest.id;
    p4Token = s4.rawSessionToken;
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

  it('creates and starts a UNO Teams 4-player match, verifies team assignments and setup initial pass', async () => {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);
    const s3 = createClient(p3Token);
    const s4 = createClient(p4Token);

    await Promise.all([
      new Promise<void>((res) => s1.on('connect', () => res())),
      new Promise<void>((res) => s2.on('connect', () => res())),
      new Promise<void>((res) => s3.on('connect', () => res())),
      new Promise<void>((res) => s4.on('connect', () => res())),
    ]);

    // Host creates room with variant 'uno_teams' and maxPlayers 4
    const createRes = await new Promise<{ success: boolean; data?: { roomCode: string } }>((res) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 4, settings: { variant: 'uno_teams' } },
        (response: any) => res(response)
      );
    });
    expect(createRes.success).toBe(true);
    const roomCode = createRes.data!.roomCode;

    // Players 2, 3, 4 join
    for (const s of [s2, s3, s4]) {
      const joinRes = await new Promise<{ success: boolean }>((res) => {
        s.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, (response: any) => res(response));
      });
      expect(joinRes.success).toBe(true);
    }

    // Players 2, 3, 4 ready up
    for (const s of [s2, s3, s4]) {
      const readyRes = await new Promise<{ success: boolean }>((res) => {
        s.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, (response: any) => res(response));
      });
      expect(readyRes.success).toBe(true);
    }

    // Capture initial game states
    let p1State: PlayerGameState | null = null;
    let p2State: PlayerGameState | null = null;
    let p3State: PlayerGameState | null = null;
    let p4State: PlayerGameState | null = null;

    s1.on(SOCKET_EVENTS.GAME_STATE, (payload: any) => {
      p1State = payload.state;
    });
    s2.on(SOCKET_EVENTS.GAME_STATE, (payload: any) => {
      p2State = payload.state;
    });
    s3.on(SOCKET_EVENTS.GAME_STATE, (payload: any) => {
      p3State = payload.state;
    });
    s4.on(SOCKET_EVENTS.GAME_STATE, (payload: any) => {
      p4State = payload.state;
    });

    // Host starts game (immediate: true for test)
    const startRes = await new Promise<{ success: boolean }>((res) => {
      s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true } as any, (response: any) => res(response));
    });
    expect(startRes.success).toBe(true);

    // Wait for initial game states
    for (let i = 0; i < 20; i++) {
      if (p1State && p2State && p3State && p4State) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(p1State).not.toBeNull();
    expect(p1State!.variant).toBe('uno_teams');

    // Verify team assignments
    expect(p1State!.self.teamId).toBe('team_1');
    expect(p2State!.self.teamId).toBe('team_2');
    expect(p3State!.self.teamId).toBe('team_1');
    expect(p4State!.self.teamId).toBe('team_2');

    // Setup step 6: pending initial pass
    expect(p1State!.pendingActionState?.type).toBe('AWAITING_TEAM_INITIAL_PASS');
    expect(p1State!.self.canTeamInitialPass).toBe(true);

    // Verify 112 card conservation in authoritative session
    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session).not.toBeNull();
    assertValidTeamsGameState(session!.state);

    // Execute initial pass for all 4 players
    const c1 = p1State!.self.hand[0];
    const c2 = p2State!.self.hand[0];
    const c3 = p3State!.self.hand[0];
    const c4 = p4State!.self.hand[0];

    await new Promise<void>((resolve, reject) => {
      s1.emit(SOCKET_EVENTS.GAME_TEAM_INITIAL_PASS, { cardId: c1.id }, (res: any) => {
        if (res.success) resolve();
        else reject(new Error(res.error?.message));
      });
    });

    await new Promise<void>((resolve, reject) => {
      s2.emit(SOCKET_EVENTS.GAME_TEAM_INITIAL_PASS, { cardId: c2.id }, (res: any) => {
        if (res.success) resolve();
        else reject(new Error(res.error?.message));
      });
    });

    await new Promise<void>((resolve, reject) => {
      s3.emit(SOCKET_EVENTS.GAME_TEAM_INITIAL_PASS, { cardId: c3.id }, (res: any) => {
        if (res.success) resolve();
        else reject(new Error(res.error?.message));
      });
    });

    await new Promise<void>((resolve, reject) => {
      s4.emit(SOCKET_EVENTS.GAME_TEAM_INITIAL_PASS, { cardId: c4.id }, (res: any) => {
        if (res.success) resolve();
        else reject(new Error(res.error?.message));
      });
    });

    // Wait for updated states after all passed
    await new Promise((r) => setTimeout(r, 100));

    expect(p1State!.pendingActionState).toBeNull();
    expect(p1State!.status).toBe('IN_PROGRESS');

    // p1 (Team 1) should now have received c3 (from partner p3)
    expect(p1State!.self.hand.some((c) => c.id === c3.id)).toBe(true);
    // p3 (Team 1) should now have received c1 (from partner p1)
    expect(p3State!.self.hand.some((c) => c.id === c1.id)).toBe(true);
  });
});
