import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { guestService } from '../../src/modules/guest/guest.service';
import { gameService } from '../../src/modules/game/game.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { cancelAllCountdownTimersForTesting } from '../../src/sockets/roomSocketHandler';
import { prisma, MatchStatus, RoomStatus } from '@uno-ultimate/database';
import { SOCKET_EVENTS, PlayerGameState, GameWinner } from '@uno-ultimate/game-protocol';
import { CardFactory } from '@uno-ultimate/game-engine';

describe('Match Winner & Room Isolation Integration Tests', () => {
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
        port = typeof addr === 'object' && addr ? addr.port : 4005;
        resolve();
      });
    });

    const p1Session = await guestService.createGuest('Alice');
    player1GuestId = p1Session.guest.id;
    player1Token = p1Session.rawSessionToken;

    const p2Session = await guestService.createGuest('Bob');
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

  it('guarantees match winner isolation across newly created rooms and matches', async () => {
    const p1Socket = createClient(player1Token);
    const p2Socket = createClient(player2Token);

    await Promise.all([
      new Promise<void>((resolve) => p1Socket.on('connect', resolve)),
      new Promise<void>((resolve) => p2Socket.on('connect', resolve)),
    ]);

    // ==========================================
    // STAGE 1: Room 1 & Match 1 (Alice Wins)
    // ==========================================

    // 1. Create Room 1
    const createRoom1Ack = await new Promise<any>((resolve) => {
      p1Socket.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, resolve);
    });
    expect(createRoom1Ack.success).toBe(true);
    const room1Code = createRoom1Ack.data.roomCode;
    const room1Id = createRoom1Ack.data.id;

    // Join and Ready Bob
    await new Promise<any>((resolve) => {
      p2Socket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode: room1Code }, resolve);
    });
    await new Promise<any>((resolve) => {
      p2Socket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });

    // Start Match 1
    const p1Match1StatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      p1Socket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });
    const startMatch1Ack = await new Promise<any>((resolve) => {
      p1Socket.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
    });
    expect(startMatch1Ack.success).toBe(true);
    const match1InitState = (await p1Match1StatePromise).state;
    const match1Id = match1InitState.id;

    // Retrieve active session in engine
    const session1 = gameSessionManager.getSessionByRoomCode(room1Code);
    expect(session1).not.toBeNull();

    // Rig Match 1: Player 1 has 1 playable card and already has 480 points so 1 play wins the 500pt match!
    const winCard1 = CardFactory.createNumberCard('red', '5', 101);
    const cardRed3 = CardFactory.createNumberCard('red', '3', 104);
    session1!.state = {
      ...session1!.state,
      topDiscardCard: cardRed3,
      activeColor: 'red',
      currentPlayerIndex: 0,
      turnDirection: 'clockwise',
      unoVulnerablePlayerId: null,
      pendingActionState: null,
      players: [
        {
          ...session1!.state.players[0],
          id: player1GuestId,
          hand: [winCard1],
          score: 480,
          hasDeclaredUno: true,
          hasDrawnThisTurn: false,
          drawnCardId: null,
        },
        {
          ...session1!.state.players[1],
          id: player2GuestId,
          hand: [
            CardFactory.createActionCard('blue', 'draw_two', 102),
            CardFactory.createActionCard('blue', 'draw_two', 103),
          ],
          hasDeclaredUno: false,
          hasDrawnThisTurn: false,
          drawnCardId: null,
        },
      ],
    };

    // Listen for GAME_FINISHED on Match 1
    const p1FinishedPromise1 = new Promise<{ matchId?: string; winner: GameWinner; finalScores: Record<string, number> }>((resolve) => {
      p1Socket.once(SOCKET_EVENTS.GAME_FINISHED, resolve);
    });

    // Play final card
    const playCardAck1 = await new Promise<any>((resolve) => {
      p1Socket.emit(
        SOCKET_EVENTS.GAME_PLAY_CARD,
        { cardId: winCard1.id },
        resolve
      );
    });
    expect(playCardAck1.success).toBe(true);
    expect(playCardAck1.data.matchOver).toBe(true);

    const finishEvent1 = await p1FinishedPromise1;
    expect(finishEvent1.matchId).toBe(match1Id);
    expect(finishEvent1.winner.id).toBe(player1GuestId);
    expect(finishEvent1.winner.username).toBe('Alice');
    expect(finishEvent1.winner.score).toBeGreaterThanOrEqual(500);

    // Verify Room 1 status transitioned to FINISHED in PostgreSQL
    const room1InDb = await prisma.room.findUnique({ where: { id: room1Id } });
    expect(room1InDb?.status).toBe(RoomStatus.FINISHED);

    // Verify Match 1 status in PostgreSQL is COMPLETED and winner is Alice
    const match1InDb = await prisma.match.findUnique({ where: { id: match1Id } });
    expect(match1InDb?.status).toBe(MatchStatus.COMPLETED);
    expect(match1InDb?.winnerGuestId).toBe(player1GuestId);

    // Verify in-memory session was cleaned up
    expect(gameSessionManager.getSessionByRoomCode(room1Code)).toBeNull();

    // Verify getOrRecoverPlayerState and recoverMatchIfActive reject completed match
    const p1RecoverState = await gameService.getOrRecoverPlayerState(player1GuestId, room1Id, room1Code);
    expect(p1RecoverState).toBeNull();
    const recoverMatch = await gameService.recoverMatchIfActive(room1Id, room1Code);
    expect(recoverMatch).toBeNull();

    // Both players leave Room 1
    await new Promise<any>((resolve) => p1Socket.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, resolve));
    await new Promise<any>((resolve) => p2Socket.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, resolve));

    // ==========================================
    // STAGE 2: Room 2 & Match 2 (Bob Wins)
    // ==========================================

    // 2. Create completely new Room 2 with Bob as Host
    const createRoom2Ack = await new Promise<any>((resolve) => {
      p2Socket.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, resolve);
    });
    expect(createRoom2Ack.success).toBe(true);
    const room2Code = createRoom2Ack.data.roomCode;
    const room2Id = createRoom2Ack.data.id;
    expect(room2Code).not.toBe(room1Code);

    // Alice joins Room 2 and readies up
    await new Promise<any>((resolve) => {
      p1Socket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode: room2Code }, resolve);
    });
    await new Promise<any>((resolve) => {
      p1Socket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });

    // Start Match 2
    const p1Match2StatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      p1Socket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });
    const p2Match2StatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      p2Socket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    const startMatch2Ack = await new Promise<any>((resolve) => {
      p2Socket.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
    });
    expect(startMatch2Ack.success).toBe(true);

    const [p1NewState, p2NewState] = await Promise.all([
      p1Match2StatePromise,
      p2Match2StatePromise,
    ]);

    // INVARIANCE VERIFICATIONS ON FRESH GAME STATE:
    const match2State = p1NewState.state;
    const match2Id = match2State.id;
    expect(match2Id).not.toBe(match1Id);

    // Initial state must be completely clean:
    expect(match2State.status).toBe('IN_PROGRESS');
    expect(match2State.winner).toBeNull();
    expect(match2State.roundWinner).toBeNull();
    expect(match2State.roundNumber).toBe(1);
    expect(match2State.turnNumber).toBe(1);

    // All players start with 0 score, no leftover points from Match 1:
    for (const p of match2State.players) {
      expect(p.score).toBe(0);
    }

    // Now rig Match 2 for BOB to win
    const session2 = gameSessionManager.getSessionByRoomCode(room2Code);
    expect(session2).not.toBeNull();

    // Identify Bob's index in Match 2
    const bobIndex = session2!.state.players.findIndex((p) => p.id === player2GuestId);
    const aliceIndex = 1 - bobIndex;

    const winCard2 = CardFactory.createNumberCard('yellow', '7', 201);
    const topCard2 = CardFactory.createNumberCard('yellow', '2', 203);
    session2!.state = {
      ...session2!.state,
      topDiscardCard: topCard2,
      activeColor: 'yellow',
      currentPlayerIndex: bobIndex,
      turnDirection: 'clockwise',
      unoVulnerablePlayerId: null,
      pendingActionState: null,
      players: [
        {
          ...session2!.state.players[bobIndex],
          id: player2GuestId,
          hand: [winCard2],
          score: 490,
          hasDeclaredUno: true,
          hasDrawnThisTurn: false,
          drawnCardId: null,
        },
        {
          ...session2!.state.players[aliceIndex],
          id: player1GuestId,
          hand: [
            CardFactory.createActionCard('green', 'skip', 202),
          ],
          hasDeclaredUno: false,
          hasDrawnThisTurn: false,
          drawnCardId: null,
        },
      ],
    };

    // Listen for GAME_FINISHED on Match 2
    const p1FinishedPromise2 = new Promise<{ matchId?: string; winner: GameWinner; finalScores: Record<string, number> }>((resolve) => {
      p1Socket.once(SOCKET_EVENTS.GAME_FINISHED, resolve);
    });
    const p2FinishedPromise2 = new Promise<{ matchId?: string; winner: GameWinner; finalScores: Record<string, number> }>((resolve) => {
      p2Socket.once(SOCKET_EVENTS.GAME_FINISHED, resolve);
    });

    // Bob plays final card
    const playCardAck2 = await new Promise<any>((resolve) => {
      p2Socket.emit(
        SOCKET_EVENTS.GAME_PLAY_CARD,
        { cardId: winCard2.id },
        resolve
      );
    });
    expect(playCardAck2.success).toBe(true);
    expect(playCardAck2.data.matchOver).toBe(true);

    const [finishP1_2, finishP2_2] = await Promise.all([
      p1FinishedPromise2,
      p2FinishedPromise2,
    ]);

    // Bob must be declared the Champion of Match 2!
    expect(finishP1_2.matchId).toBe(match2Id);
    expect(finishP1_2.winner.id).toBe(player2GuestId);
    expect(finishP1_2.winner.username).toBe('Bob');

    expect(finishP2_2.matchId).toBe(match2Id);
    expect(finishP2_2.winner.id).toBe(player2GuestId);
    expect(finishP2_2.winner.username).toBe('Bob');

    // Verify Match 2 in DB has Bob as winner, and Match 1 remains preserved with Alice
    const match1DbFinal = await prisma.match.findUnique({ where: { id: match1Id } });
    const match2DbFinal = await prisma.match.findUnique({ where: { id: match2Id } });

    expect(match1DbFinal?.winnerGuestId).toBe(player1GuestId);
    expect(match2DbFinal?.winnerGuestId).toBe(player2GuestId);
  });

  it('guarantees concurrency isolation: match completion in Room A does not leak into Room B', async () => {
    // Create 4 distinct players for 2 concurrent rooms
    const pA1 = await guestService.createGuest('AliceConcurrent');
    const pA2 = await guestService.createGuest('BobConcurrent');
    const pB1 = await guestService.createGuest('CharlieConcurrent');
    const pB2 = await guestService.createGuest('DavidConcurrent');

    const sA1 = createClient(pA1.rawSessionToken);
    const sA2 = createClient(pA2.rawSessionToken);
    const sB1 = createClient(pB1.rawSessionToken);
    const sB2 = createClient(pB2.rawSessionToken);

    await Promise.all([
      new Promise<void>((r) => sA1.on('connect', r)),
      new Promise<void>((r) => sA2.on('connect', r)),
      new Promise<void>((r) => sB1.on('connect', r)),
      new Promise<void>((r) => sB2.on('connect', r)),
    ]);

    // Create Room A (Classic)
    const roomAAck = await new Promise<any>((r) => sA1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, r));
    const roomACode = roomAAck.data.roomCode;
    await new Promise<any>((r) => sA2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode: roomACode }, r));
    await new Promise<any>((r) => sA2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));

    // Create Room B (UNO Flip)
    const roomBAck = await new Promise<any>((r) => sB1.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2, settings: { variant: 'uno_flip' } }, r));
    const roomBCode = roomBAck.data.roomCode;
    await new Promise<any>((r) => sB2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode: roomBCode }, r));
    await new Promise<any>((r) => sB2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, r));

    // Start both matches
    const stateAPromise = new Promise<{ state: PlayerGameState }>((r) => sA1.once(SOCKET_EVENTS.GAME_STATE, r));
    const stateBPromise = new Promise<{ state: PlayerGameState }>((r) => sB1.once(SOCKET_EVENTS.GAME_STATE, r));

    await Promise.all([
      new Promise<any>((r) => sA1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r)),
      new Promise<any>((r) => sB1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, r)),
    ]);

    const stateA = (await stateAPromise).state;
    const stateB = (await stateBPromise).state;

    expect(stateA.variant).toBe('classic');
    expect(stateB.variant).toBe('uno_flip');
    expect(stateA.id).not.toBe(stateB.id);

    // Verify both are present in session manager
    const sessionA = gameSessionManager.getSessionByRoomCode(roomACode);
    const sessionB = gameSessionManager.getSessionByRoomCode(roomBCode);
    expect(sessionA).not.toBeNull();
    expect(sessionB).not.toBeNull();

    // Rig Match A so Alice wins
    const winCardA = CardFactory.createNumberCard('red', '5', 301);
    const topCardA = CardFactory.createNumberCard('red', '3', 302);
    sessionA!.state = {
      ...sessionA!.state,
      topDiscardCard: topCardA,
      activeColor: 'red',
      currentPlayerIndex: 0,
      turnDirection: 'clockwise',
      unoVulnerablePlayerId: null,
      pendingActionState: null,
      players: [
        {
          ...sessionA!.state.players[0],
          id: pA1.guest.id,
          hand: [winCardA],
          score: 490,
          hasDeclaredUno: true,
          hasDrawnThisTurn: false,
          drawnCardId: null,
        },
        {
          ...sessionA!.state.players[1],
          id: pA2.guest.id,
          hand: [CardFactory.createActionCard('blue', 'draw_two', 303)],
          hasDeclaredUno: false,
          hasDrawnThisTurn: false,
          drawnCardId: null,
        },
      ],
    };

    // Set up spy for Room B clients: they must NEVER receive GAME_FINISHED from Room A!
    let roomBLeakDetected = false;
    const roomBLeakHandler = (payload: any) => {
      if (payload.matchId === stateA.id) {
        roomBLeakDetected = true;
      }
    };
    sB1.on(SOCKET_EVENTS.GAME_FINISHED, roomBLeakHandler);
    sB2.on(SOCKET_EVENTS.GAME_FINISHED, roomBLeakHandler);

    // Complete Match A
    const matchAFinishedPromise = new Promise<{ matchId?: string; winner: GameWinner }>((r) => {
      sA1.once(SOCKET_EVENTS.GAME_FINISHED, r);
    });

    const playAckA = await new Promise<any>((r) => sA1.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: winCardA.id }, r));
    expect(playAckA.success).toBe(true);
    expect(playAckA.data.matchOver).toBe(true);

    const finishA = await matchAFinishedPromise;
    expect(finishA.matchId).toBe(stateA.id);
    expect(finishA.winner.id).toBe(pA1.guest.id);

    // Verify Room A session cleaned up, but Room B session REMAINS fully intact and IN_PROGRESS!
    expect(gameSessionManager.getSessionByRoomCode(roomACode)).toBeNull();
    const activeBAfterA = gameSessionManager.getSessionByRoomCode(roomBCode);
    expect(activeBAfterA).not.toBeNull();
    expect(activeBAfterA!.state.status).toBe('IN_PROGRESS');
    expect(activeBAfterA!.state.id).toBe(stateB.id);

    // Check that Room B sockets never received Match A's GAME_FINISHED event
    expect(roomBLeakDetected).toBe(false);

    // Clean up listeners
    sB1.off(SOCKET_EVENTS.GAME_FINISHED, roomBLeakHandler);
    sB2.off(SOCKET_EVENTS.GAME_FINISHED, roomBLeakHandler);
  });
});
