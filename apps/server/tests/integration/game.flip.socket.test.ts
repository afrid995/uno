import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { guestService } from '../../src/modules/guest/guest.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { cancelAllCountdownTimersForTesting } from '../../src/sockets/roomSocketHandler';
import { prisma } from '@uno-ultimate/database';
import { SOCKET_EVENTS, PlayerGameState } from '@uno-ultimate/game-protocol';
import { FlipDeckFactory } from '@uno-ultimate/game-engine';

describe('UNO Flip Multiplayer Integration & Persistence Tests', () => {
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  let activeClients: ClientSocket[] = [];

  let player1Token: string;
  let player1GuestId: string;
  let player2Token: string;
  let player2GuestId: string;

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

    const p1Session = await guestService.createGuest('AliceFlip');
    player1GuestId = p1Session.guest.id;
    player1Token = p1Session.rawSessionToken;

    const p2Session = await guestService.createGuest('BobFlip');
    player2GuestId = p2Session.guest.id;
    player2Token = p2Session.rawSessionToken;
  });

  afterAll(async () => {
    for (const client of activeClients) {
      if (client.connected) client.disconnect();
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  afterEach(() => {
    cancelAllCountdownTimersForTesting();
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

  it('selects UNO Flip variant, starts match, plays Flip card, syncs Dark Side, and recovers from crash', async () => {
    const p1Socket = createClient(player1Token);
    const p2Socket = createClient(player2Token);

    await Promise.all([
      new Promise<void>((resolve) => p1Socket.on('connect', resolve)),
      new Promise<void>((resolve) => p2Socket.on('connect', resolve)),
    ]);

    // 1. Host creates room with UNO Flip variant
    const createAck = await new Promise<any>((resolve) => {
      p1Socket.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'uno_flip' } },
        resolve
      );
    });
    expect(createAck.success).toBe(true);
    const roomCode = createAck.data.roomCode;
    expect(createAck.data.settings.variant).toBe('uno_flip');

    // 2. Bob joins and marks ready
    await new Promise<any>((resolve) => {
      p2Socket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });
    await new Promise<any>((resolve) => {
      p2Socket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });

    // 3. Host starts match
    const p1InitialPromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      p1Socket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });
    const p2InitialPromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      p2Socket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    const startAck = await new Promise<any>((resolve) => {
      p1Socket.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
    });
    expect(startAck.success).toBe(true);

    const { state: p1Initial } = await p1InitialPromise;
    const { state: p2Initial } = await p2InitialPromise;

    expect(p1Initial.activeSide).toBe('LIGHT');
    expect(p2Initial.activeSide).toBe('LIGHT');
    expect(p1Initial.self.hand.length).toBeGreaterThanOrEqual(7);
    expect(p2Initial.self.hand.length).toBeGreaterThanOrEqual(7);

    // 4. Inject a Flip card into current player's hand and set matching discard
    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session).toBeDefined();

    const deck = FlipDeckFactory.createFlipDeck();
    const flipCard = deck.find((c) => c.lightFace.value === 'flip' && c.lightFace.color === 'blue')!;
    const blueDiscard = deck.find((c) => c.lightFace.value === '5' && c.lightFace.color === 'blue')!;

    const currentIdx = session!.state.currentPlayerIndex;
    const currentPlayerId = session!.state.players[currentIdx].id;
    const currentSocket = currentPlayerId === player1GuestId ? p1Socket : p2Socket;
    const otherSocket = currentPlayerId === player1GuestId ? p2Socket : p1Socket;

    session!.state = {
      ...session!.state,
      topDiscardCard: blueDiscard,
      discardPile: [blueDiscard],
      activeColor: 'blue',
      players: session!.state.players.map((p, idx) =>
        idx === currentIdx
          ? { ...p, hand: [flipCard, ...p.hand.slice(1)] }
          : p
      ),
    };

    // 5. Play the Flip card over WebSocket
    const p1DarkPromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      p1Socket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });
    const p2DarkPromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      p2Socket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    const playAck = await new Promise<any>((resolve) => {
      currentSocket.emit(
        SOCKET_EVENTS.GAME_PLAY_CARD,
        { cardId: flipCard.id },
        resolve
      );
    });
    expect(playAck.success).toBe(true);

    const { state: p1Dark } = await p1DarkPromise;
    const { state: p2Dark } = await p2DarkPromise;

    // Both players receive projection showing DARK side active!
    expect(p1Dark.activeSide).toBe('DARK');
    expect(p2Dark.activeSide).toBe('DARK');

    // All cards in hand are on DARK side
    expect(p1Dark.self.hand.every((c) => c.currentSide === 'DARK')).toBe(true);
    expect(p2Dark.self.hand.every((c) => c.currentSide === 'DARK')).toBe(true);

    // 6. Test crash / restart recovery:
    // Clear all in-memory sessions to simulate hard server restart
    gameSessionManager.clearAllSessionsForTesting();
    expect(gameSessionManager.getSessionByRoomCode(roomCode)).toBeNull();

    // Alice resumes session via ROOM_RESUME
    const resumeStatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      p1Socket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    const resumeAck = await new Promise<any>((resolve) => {
      p1Socket.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, resolve);
    });
    expect(resumeAck.success).toBe(true);

    const { state: recoveredState } = await resumeStatePromise;

    // Snapshot was rehydrated from PostgreSQL!
    expect(recoveredState.activeSide).toBe('DARK');
    expect(recoveredState.self.hand.every((c) => c.currentSide === 'DARK')).toBe(true);
  });
});
