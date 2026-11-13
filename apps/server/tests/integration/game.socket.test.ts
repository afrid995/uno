import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { guestService } from '../../src/modules/guest/guest.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { gamePersistenceService } from '../../src/modules/game/game.persistence.service';
import { activeCountdownTimers, cancelAllCountdownTimersForTesting, PRODUCTION_COUNTDOWN_MS, setCountdownDurationForTesting, resetCountdownDurationForTesting } from '../../src/sockets/roomSocketHandler';
import { prisma } from '@uno-ultimate/database';
import { SOCKET_EVENTS, PlayerGameState } from '@uno-ultimate/game-protocol';

describe('Game Socket.IO Multiplayer Integration Tests', () => {
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
        port = typeof addr === 'object' && addr ? addr.port : 4001;
        resolve();
      });
    });

    const hostSession = await guestService.createGuest('GameHost');
    hostGuestId = hostSession.guest.id;
    hostToken = hostSession.rawSessionToken;

    const playerSession = await guestService.createGuest('GamePlayer');
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

  it('runs complete multiplayer match flow: start, private state delivery, turn actions, reconnection', async () => {
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

    // 2. Player joins room
    const joinAck = await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });
    expect(joinAck.success).toBe(true);

    // 3. Player marks ready
    const readyAck = await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });
    expect(readyAck.success).toBe(true);

    // 4. Setup state listeners for game start
    const hostStatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });
    const playerStatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      playerSocket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    // 5. Host starts game with immediate: true (test mode)
    const startAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
    });
    expect(startAck.success).toBe(true);

    const [hostStateEvent, playerStateEvent] = await Promise.all([
      hostStatePromise,
      playerStatePromise,
    ]);

    // 6. Security & Information Hiding assertions:
    // Host receives their own hand, NOT player's hand!
    expect(hostStateEvent.state.self.id).toBe(hostGuestId);
    expect(hostStateEvent.state.self.hand).toHaveLength(7);
    // Opponent hand is only exposed as a cardCount
    const hostViewOfPlayer = hostStateEvent.state.players.find((p) => p.id === playerGuestId);
    expect(hostViewOfPlayer).toBeDefined();
    expect(hostViewOfPlayer?.cardCount).toBe(7);
    expect((hostViewOfPlayer as any).hand).toBeUndefined();

    // Player receives their own hand, NOT host's hand!
    expect(playerStateEvent.state.self.id).toBe(playerGuestId);
    expect(playerStateEvent.state.self.hand).toHaveLength(7);
    const playerViewOfHost = playerStateEvent.state.players.find((p) => p.id === hostGuestId);
    expect(playerViewOfHost?.cardCount).toBe(7);
    expect((playerViewOfHost as any).hand).toBeUndefined();

    // 7. Verify Turn Enforcement
    const activePlayerId = hostStateEvent.state.currentTurnGuestId;
    const inactiveSocket = activePlayerId === hostGuestId ? playerSocket : hostSocket;
    const activeSocket = activePlayerId === hostGuestId ? hostSocket : playerSocket;
    const activeGuestId = activePlayerId;
    const activeState = activePlayerId === hostGuestId ? hostStateEvent.state : playerStateEvent.state;

    // Inactive player tries to draw out of turn -> rejected!
    const outOfTurnAck = await new Promise<any>((resolve) => {
      inactiveSocket.emit(SOCKET_EVENTS.GAME_DRAW_CARD, {}, resolve);
    });
    expect(outOfTurnAck.success).toBe(false);
    expect(outOfTurnAck.error.code).toBe('BAD_REQUEST');

    // 8. Active player plays a card or draws
    if (activeState.self.playableCardIds.length > 0) {
      const cardToPlay = activeState.self.playableCardIds[0];
      const nextStatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
        activeSocket.once(SOCKET_EVENTS.GAME_STATE, resolve);
      });

      const playAck = await new Promise<any>((resolve) => {
        activeSocket.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: cardToPlay, chosenColor: 'red' }, resolve);
      });
      expect(playAck.success).toBe(true);

      const updatedActiveState = await nextStatePromise;
      expect(updatedActiveState.state.self.hand).toHaveLength(6);
    } else {
      // No playable card: active player draws
      const drawAck = await new Promise<any>((resolve) => {
        activeSocket.emit(SOCKET_EVENTS.GAME_DRAW_CARD, {}, resolve);
      });
      expect(drawAck.success).toBe(true);
      expect(drawAck.data.cardDrawn).toBe(true);
    }

    // 9. Reconnection during active match:
    // Create new socket with same token, connect and resume
    const reconnectSocket = createClient(activePlayerId === hostGuestId ? hostToken : playerToken);
    await new Promise<void>((resolve) => reconnectSocket.on('connect', resolve));

    const reconnectedStatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      reconnectSocket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    const resumeAck = await new Promise<any>((resolve) => {
      reconnectSocket.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, resolve);
    });
    expect(resumeAck.success).toBe(true);

    const reconnectedState = await reconnectedStatePromise;
    expect(reconnectedState.state.roomId).toBe(hostStateEvent.state.roomId);
    expect(reconnectedState.state.self.id).toBe(activeGuestId);
    expect(reconnectedState.state.status).toBe('IN_PROGRESS');
  });

  it('handles UNO declaration and Wild Draw Four socket operations cleanly', async () => {
    const hostSocket = createClient(hostToken);
    const playerSocket = createClient(playerToken);

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', resolve)),
      new Promise<void>((resolve) => playerSocket.on('connect', resolve)),
    ]);

    const createAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, resolve);
    });
    const roomCode = createAck.data.roomCode;

    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });
    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });

    const gameStatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    const startAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
    });
    expect(startAck.success).toBe(true);
    await gameStatePromise;

    // Test UNO shout: player with 7 cards calls UNO -> rejected because they hold > 2 cards
    const unoAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.GAME_UNO, {}, resolve);
    });
    expect(unoAck.success).toBe(false);
    expect(unoAck.error.code).toBe('BAD_REQUEST');

    // Test UNO challenge: neither player has missed UNO shout -> rejected
    const challengeAck = await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.GAME_CHALLENGE_UNO, { targetPlayerId: hostGuestId }, resolve);
    });
    expect(challengeAck.success).toBe(false);

    // Test WDF accept when no WDF is pending -> rejected
    const acceptWdfAck = await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, {}, resolve);
    });
    expect(acceptWdfAck.success).toBe(false);
  });

  it('recovers active match from database snapshot on room:resume after in-process session loss', async () => {
    const hostSocket = createClient(hostToken);
    const playerSocket = createClient(playerToken);

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', resolve)),
      new Promise<void>((resolve) => playerSocket.on('connect', resolve)),
    ]);

    const createAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, resolve);
    });
    const roomCode = createAck.data.roomCode;

    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });
    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });

    const hostStatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
    });

    const initialHostState = await hostStatePromise;
    expect(initialHostState.state.status).toBe('IN_PROGRESS');

    // Simulate IN-PROCESS SESSION LOSS: clear all in-memory game sessions completely!
    // This verifies state rehydration from the database snapshot within the single-instance server architecture.
    gameSessionManager.clearAllSessionsForTesting();
    expect(gameSessionManager.getSessionByRoomCode(roomCode)).toBeNull();

    // Disconnect host socket and reconnect with fresh client
    hostSocket.disconnect();
    const resumedHostSocket = createClient(hostToken);
    await new Promise<void>((resolve) => resumedHostSocket.on('connect', resolve));

    const recoveredStatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      resumedHostSocket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    const resumeAck = await new Promise<any>((resolve) => {
      resumedHostSocket.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, resolve);
    });
    expect(resumeAck.success).toBe(true);

    const recoveredState = await recoveredStatePromise;
    // Verify recovered state matches the database snapshot!
    expect(recoveredState.state.status).toBe('IN_PROGRESS');
    expect(recoveredState.state.self.id).toBe(hostGuestId);
    expect(recoveredState.state.self.hand).toHaveLength(7);
    expect(recoveredState.state.roundNumber).toBe(1);

    // Verify in-memory session was properly rehydrated
    expect(gameSessionManager.getSessionByRoomCode(roomCode)).not.toBeNull();

    // Verify non-member cannot recover state
    const strangerSession = await guestService.createGuest('Stranger');
    const strangerSocket = createClient(strangerSession.rawSessionToken);
    await new Promise<void>((resolve) => strangerSocket.on('connect', resolve));

    const strangerResumeAck = await new Promise<any>((resolve) => {
      strangerSocket.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, resolve);
    });
    expect(strangerResumeAck.success).toBe(false);
    expect(strangerResumeAck.error.code).toBe('NOT_IN_ROOM');
  });

  it('enforces 5-second countdown in production mode when immediate is sent', async () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      // Temporarily switch NODE_ENV to production
      process.env.NODE_ENV = 'production';

      const prodHost = await guestService.createGuest('ProdHost');
      const prodPlayer = await guestService.createGuest('ProdPlayer');
      const hostSocket = createClient(prodHost.rawSessionToken);
      const playerSocket = createClient(prodPlayer.rawSessionToken);

      await Promise.all([
        new Promise<void>((resolve) => hostSocket.on('connect', resolve)),
        new Promise<void>((resolve) => playerSocket.on('connect', resolve)),
      ]);

      const createAck = await new Promise<any>((resolve) => {
        hostSocket.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, resolve);
      });
      const roomCode = createAck.data.roomCode;

      await new Promise<any>((resolve) => {
        playerSocket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
      });
      await new Promise<any>((resolve) => {
        playerSocket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
      });

      let gameStartedImmediately = false;
      hostSocket.once(SOCKET_EVENTS.GAME_STARTED, () => {
        gameStartedImmediately = true;
      });

      // Attempt immediate bypass in production
      const startAck = await new Promise<any>((resolve) => {
        hostSocket.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
      });
      expect(startAck.success).toBe(true);

      // Wait 150ms: in production, game must NOT have started immediately (countdown is 5000ms)
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(gameStartedImmediately).toBe(false);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('persists strictly increasing, unique sequence numbers in GameEvent table', async () => {
    const seqHost = await guestService.createGuest('SeqHost');
    const seqPlayer = await guestService.createGuest('SeqPlayer');
    const hostSocket = createClient(seqHost.rawSessionToken);
    const playerSocket = createClient(seqPlayer.rawSessionToken);

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', resolve)),
      new Promise<void>((resolve) => playerSocket.on('connect', resolve)),
    ]);

    const createAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, resolve);
    });
    const roomCode = createAck.data.roomCode;

    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });
    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });

    const hostStatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    const startAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
    });
    expect(startAck.success).toBe(true);
    await hostStatePromise;

    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session).not.toBeNull();
    const matchId = session!.matchId;

    // Active player plays or draws
    const activePlayerId = session!.state.players[session!.state.currentPlayerIndex].id;
    const activeSocket = activePlayerId === seqHost.guest.id ? hostSocket : playerSocket;

    const drawAck = await new Promise<any>((resolve) => {
      activeSocket.emit(SOCKET_EVENTS.GAME_DRAW_CARD, {}, resolve);
    });
    expect(drawAck.success).toBe(true);

    // Query events from PostgreSQL
    const events = await prisma.gameEvent.findMany({
      where: { matchId },
      orderBy: { sequenceNumber: 'asc' },
    });

    expect(events.length).toBeGreaterThan(0);
    // Verify sequence numbers are strictly monotonic and unique: 1, 2, ...
    for (let i = 0; i < events.length; i++) {
      expect(events[i].sequenceNumber).toBe(i + 1);
    }
  });

  it('cancels match start countdown when player unreadies or leaves before timer fires', async () => {
    const cHost = await guestService.createGuest('CancelHost');
    const cPlayer = await guestService.createGuest('CancelPlayer');
    const hostSocket = createClient(cHost.rawSessionToken);
    const playerSocket = createClient(cPlayer.rawSessionToken);

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', resolve)),
      new Promise<void>((resolve) => playerSocket.on('connect', resolve)),
    ]);

    const createAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, resolve);
    });
    const roomCode = createAck.data.roomCode;

    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });
    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });

    // 1. Host triggers start with 5-second countdown (immediate: false)
    const hostStartingPromise = new Promise<{ countdownSeconds: number }>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.ROOM_STARTING, resolve);
    });

    const startAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_START, { immediate: false }, resolve);
    });
    expect(startAck.success).toBe(true);

    const startingPayload = await hostStartingPromise;
    expect(startingPayload.countdownSeconds).toBe(5);
    expect(activeCountdownTimers.has(roomCode)).toBe(true);

    // 2. Player unreadies before timer fires
    const cancelStartingPromise = new Promise<{ countdownSeconds: number }>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.ROOM_STARTING, resolve);
    });

    const unreadyAck = await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: false }, resolve);
    });
    expect(unreadyAck.success).toBe(true);

    const cancelPayload = await cancelStartingPromise;
    expect(cancelPayload.countdownSeconds).toBe(0);
    // Active timer must be deleted!
    expect(activeCountdownTimers.has(roomCode)).toBe(false);

    // 3. Player re-readies and host starts again, but player leaves room
    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });

    await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_START, { immediate: false }, resolve);
    });
    expect(activeCountdownTimers.has(roomCode)).toBe(true);

    // Player leaves room -> timer cancelled
    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_LEAVE, { roomCode }, resolve);
    });
    expect(activeCountdownTimers.has(roomCode)).toBe(false);

    // 4. Player re-joins, re-readies, countdown starts, and player disconnects -> timer cancelled
    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });
    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });
    await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_START, { immediate: false }, resolve);
    });
    expect(activeCountdownTimers.has(roomCode)).toBe(true);

    playerSocket.disconnect();
    // Allow server disconnect event to process
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(activeCountdownTimers.has(roomCode)).toBe(false);
  });

  it('executes full countdown and starts game after configured duration', async () => {
    expect(PRODUCTION_COUNTDOWN_MS).toBe(5000);

    // Verify production cannot tamper with countdown duration
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(() => setCountdownDurationForTesting(100)).toThrow(/test environment/i);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }

    // In test environment, configure deterministic 200ms countdown duration
    setCountdownDurationForTesting(200);

    const fHost = await guestService.createGuest('FullCountdownHost');
    const fPlayer = await guestService.createGuest('FullCountdownPlayer');
    const hostSocket = createClient(fHost.rawSessionToken);
    const playerSocket = createClient(fPlayer.rawSessionToken);

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', resolve)),
      new Promise<void>((resolve) => playerSocket.on('connect', resolve)),
    ]);

    const createAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, resolve);
    });
    const roomCode = createAck.data.roomCode;

    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });
    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });

    const gameStartedPromise = new Promise<{ matchId: string }>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.GAME_STARTED, resolve);
    });

    const startAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_START, { immediate: false }, resolve);
    });
    expect(startAck.success).toBe(true);
    expect(activeCountdownTimers.has(roomCode)).toBe(true);

    // Before countdown completes (50ms): game must NOT have started yet!
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(gameSessionManager.getSessionByRoomCode(roomCode)).toBeNull();

    // After countdown completes: game MUST start and broadcast GAME_STARTED!
    const startedData = await gameStartedPromise;
    expect(startedData.matchId).toBeDefined();
    expect(gameSessionManager.getSessionByRoomCode(roomCode)).not.toBeNull();
    expect(activeCountdownTimers.has(roomCode)).toBe(false);

    // Reset countdown configuration
    resetCountdownDurationForTesting();
  });

  it('rolls back state and does not advance in-memory sequence number when database transaction fails', async () => {
    const rbHost = await guestService.createGuest('RollbackHost');
    const rbPlayer = await guestService.createGuest('RollbackPlayer');
    const hostSocket = createClient(rbHost.rawSessionToken);
    const playerSocket = createClient(rbPlayer.rawSessionToken);

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', resolve)),
      new Promise<void>((resolve) => playerSocket.on('connect', resolve)),
    ]);

    const createAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, resolve);
    });
    const roomCode = createAck.data.roomCode;

    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });
    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });

    const hostStatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    const startAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
    });
    expect(startAck.success).toBe(true);
    await hostStatePromise;

    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session).not.toBeNull();
    const initialSeq = session!.state.sequenceNumber;
    const activePlayerIndex = session!.state.currentPlayerIndex;
    const activePlayerId = session!.state.players[activePlayerIndex].id;
    const initialHandLength = session!.state.players[activePlayerIndex].hand.length;
    const activeSocket = activePlayerId === rbHost.guest.id ? hostSocket : playerSocket;

    // Simulate database transaction failure during action persistence
    const spy = vi
      .spyOn(gamePersistenceService, 'persistActionBatch')
      .mockRejectedValueOnce(new Error('Simulated database write error / connection drop'));

    // Attempt action -> must fail
    const failedDrawAck = await new Promise<any>((resolve) => {
      activeSocket.emit(SOCKET_EVENTS.GAME_DRAW_CARD, {}, resolve);
    });
    expect(failedDrawAck.success).toBe(false);

    // CRITICAL: In-memory state MUST NOT have advanced!
    expect(session!.state.sequenceNumber).toBe(initialSeq);
    expect(session!.state.players[activePlayerIndex].hand).toHaveLength(initialHandLength);
    expect(session!.state.players[activePlayerIndex].hasDrawnThisTurn).toBe(false);

    // Restore persistence service and retry action -> must succeed cleanly
    spy.mockRestore();

    const successDrawAck = await new Promise<any>((resolve) => {
      activeSocket.emit(SOCKET_EVENTS.GAME_DRAW_CARD, {}, resolve);
    });
    expect(successDrawAck.success).toBe(true);

    // Now state advances cleanly
    expect(session!.state.sequenceNumber).toBe(initialSeq + 1);
    expect(session!.state.players[activePlayerIndex].hand).toHaveLength(initialHandLength + 1);
    expect(session!.state.players[activePlayerIndex].hasDrawnThisTurn).toBe(true);
  });

  it('rolls back partially executed database writes inside Prisma $transaction on database error', async () => {
    const txHost = await guestService.createGuest('TxHost');
    const txPlayer = await guestService.createGuest('TxPlayer');
    const hostSocket = createClient(txHost.rawSessionToken);
    const playerSocket = createClient(txPlayer.rawSessionToken);

    await Promise.all([
      new Promise<void>((resolve) => hostSocket.on('connect', resolve)),
      new Promise<void>((resolve) => playerSocket.on('connect', resolve)),
    ]);

    const createAck = await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, resolve);
    });
    const roomCode = createAck.data.roomCode;

    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });
    await new Promise<any>((resolve) => {
      playerSocket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });

    const hostStatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      hostSocket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    await new Promise<any>((resolve) => {
      hostSocket.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
    });
    await hostStatePromise;

    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session).not.toBeNull();
    const matchId = session!.matchId;
    const initialSeq = session!.state.sequenceNumber;

    // Check baseline database values before failure
    const dbMatchBefore = await prisma.match.findUnique({ where: { id: matchId } });
    const dbEventsBefore = await prisma.gameEvent.findMany({ where: { matchId } });
    const initialDbSeq = dbMatchBefore!.sequenceNumber;
    const initialEventCount = dbEventsBefore.length;

    const activePlayerIndex = session!.state.currentPlayerIndex;
    const activePlayerId = session!.state.players[activePlayerIndex].id;
    const activeSocket = activePlayerId === txHost.guest.id ? hostSocket : playerSocket;

    // Intercept prisma.$transaction to simulate an error inside the transaction after initial writes occur
    const originalTransaction = prisma.$transaction.bind(prisma);
    const txSpy = vi.spyOn(prisma, '$transaction').mockImplementationOnce(async (callback: any) => {
      return originalTransaction(async (tx: any) => {
        // Intercept tx.gameSnapshot.upsert to throw an error at the end of the transaction!
        tx.gameSnapshot.upsert = async () => {
          throw new Error('Injected failure inside database transaction (after Match and Event writes)');
        };
        return callback(tx);
      });
    });

    // Attempt gameplay action -> must fail due to error inside transaction
    const failAck = await new Promise<any>((resolve) => {
      activeSocket.emit(SOCKET_EVENTS.GAME_DRAW_CARD, {}, resolve);
    });
    expect(failAck.success).toBe(false);

    // 1. In-memory session state MUST NOT advance
    expect(session!.state.sequenceNumber).toBe(initialSeq);

    // 2. PostgreSQL database MUST have completely rolled back to pre-action state!
    const dbMatchAfter = await prisma.match.findUnique({ where: { id: matchId } });
    expect(dbMatchAfter!.sequenceNumber).toBe(initialDbSeq);

    const dbEventsAfter = await prisma.gameEvent.findMany({ where: { matchId } });
    expect(dbEventsAfter.length).toBe(initialEventCount); // No orphaned event inserted!

    // 3. Restore transaction and execute valid action -> succeeds and commits cleanly
    txSpy.mockRestore();

    const successAck = await new Promise<any>((resolve) => {
      activeSocket.emit(SOCKET_EVENTS.GAME_DRAW_CARD, {}, resolve);
    });
    expect(successAck.success).toBe(true);

    const dbMatchCommitted = await prisma.match.findUnique({ where: { id: matchId } });
    expect(dbMatchCommitted!.sequenceNumber).toBe(initialDbSeq + 1);

    const dbEventsCommitted = await prisma.gameEvent.findMany({ where: { matchId } });
    expect(dbEventsCommitted.length).toBe(initialEventCount + 1);
  });
});
