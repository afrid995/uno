import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { guestService } from '../../src/modules/guest/guest.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { cancelAllCountdownTimersForTesting } from '../../src/sockets/roomSocketHandler';
import { prisma, MatchStatus } from '@uno-ultimate/database';
import { SOCKET_EVENTS, PlayerGameState } from '@uno-ultimate/game-protocol';
import { CardFactory, GameState } from '@uno-ultimate/game-engine';

describe('Game Full Round & Multi-Round Match Lifecycle Integration Tests', () => {
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
        port = typeof addr === 'object' && addr ? addr.port : 4002;
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

  it('completes a full Classic UNO round: card plays, UNO shout, score calculation and PostgreSQL persistence', async () => {
    const p1Socket = createClient(player1Token);
    const p2Socket = createClient(player2Token);

    await Promise.all([
      new Promise<void>((resolve) => p1Socket.on('connect', resolve)),
      new Promise<void>((resolve) => p2Socket.on('connect', resolve)),
    ]);

    // 1. Create and join room
    const createAck = await new Promise<any>((resolve) => {
      p1Socket.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, resolve);
    });
    expect(createAck.success).toBe(true);
    const roomCode = createAck.data.roomCode;

    await new Promise<any>((resolve) => {
      p2Socket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });
    await new Promise<any>((resolve) => {
      p2Socket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });

    // 2. Start game immediately
    const p1InitialStatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      p1Socket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    const startAck = await new Promise<any>((resolve) => {
      p1Socket.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
    });
    expect(startAck.success).toBe(true);
    await p1InitialStatePromise;

    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session).not.toBeNull();
    const matchId = session!.matchId;

    // 3. Test Unauthorized Moves & State Invariance
    // Current turn player vs inactive player
    const activePlayerIndex = session!.state.currentPlayerIndex;
    const activePlayerId = session!.state.players[activePlayerIndex].id;
    const inactivePlayerId = session!.state.players[1 - activePlayerIndex].id;
    const inactiveSocket = activePlayerId === player1GuestId ? p2Socket : p1Socket;

    const preRejectSeq = session!.state.sequenceNumber;

    // Inactive player tries to play out of turn -> rejected!
    const outOfTurnAck = await new Promise<any>((resolve) => {
      inactiveSocket.emit(
        SOCKET_EVENTS.GAME_PLAY_CARD,
        { cardId: 'classic_red_5_0' },
        resolve
      );
    });
    expect(outOfTurnAck.success).toBe(false);
    expect(outOfTurnAck.error.code).toBe('BAD_REQUEST');
    // Sequence number unchanged, state not corrupted
    expect(session!.state.sequenceNumber).toBe(preRejectSeq);

    // 4. Setup deterministic end-game state:
    // P1 has 2 cards: Red 5 and Red 7
    // P2 has: Red Skip (20 pts), Blue Draw Two (20 pts), and Wild (50 pts) = 90 total points
    // Top discard is Red 3
    const cardRed3 = CardFactory.createNumberCard('red', '3', 99);
    const cardRed5 = CardFactory.createNumberCard('red', '5', 98);
    const cardRed7 = CardFactory.createNumberCard('red', '7', 97);
    const cardRedSkip = CardFactory.createActionCard('red', 'skip', 96);
    const cardBlueD2 = CardFactory.createActionCard('blue', 'draw_two', 95);
    const cardWild = CardFactory.createWildCard('wild', 94);

    session!.state = {
      ...session!.state,
      topDiscardCard: cardRed3,
      activeColor: 'red',
      currentPlayerIndex: 0, // P1's turn
      turnDirection: 'clockwise',
      unoVulnerablePlayerId: null,
      pendingActionState: null,
      players: [
        {
          ...session!.state.players[0],
          id: player1GuestId,
          hand: [cardRed5, cardRed7],
          hasDeclaredUno: false,
          hasDrawnThisTurn: false,
          drawnCardId: null,
        },
        {
          ...session!.state.players[1],
          id: player2GuestId,
          hand: [cardRedSkip, cardBlueD2, cardWild],
          hasDeclaredUno: false,
          hasDrawnThisTurn: false,
          drawnCardId: null,
        },
      ],
    };

    // 5. P1 declares UNO while holding 2 cards
    const unoAck = await new Promise<any>((resolve) => {
      p1Socket.emit(SOCKET_EVENTS.GAME_UNO, {}, resolve);
    });
    expect(unoAck.success).toBe(true);
    expect(session!.state.players[0].hasDeclaredUno).toBe(true);

    // 6. P1 plays Red 5 down to 1 card
    const play1Ack = await new Promise<any>((resolve) => {
      p1Socket.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: cardRed5.id }, resolve);
    });
    expect(play1Ack.success).toBe(true);
    expect(session!.state.players[0].hand).toHaveLength(1);
    expect(session!.state.currentPlayerIndex).toBe(1); // Now P2's turn

    // 7. P2 draws a card and passes
    const drawAck = await new Promise<any>((resolve) => {
      p2Socket.emit(SOCKET_EVENTS.GAME_DRAW_CARD, {}, resolve);
    });
    expect(drawAck.success).toBe(true);

    const passAck = await new Promise<any>((resolve) => {
      p2Socket.emit(SOCKET_EVENTS.GAME_PASS_TURN, {}, resolve);
    });
    expect(passAck.success).toBe(true);
    expect(session!.state.currentPlayerIndex).toBe(0); // Back to P1's turn

    // 8. P1 plays their final card Red 7 -> Round completes!
    const roundFinishedPromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      p1Socket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    const finalPlayAck = await new Promise<any>((resolve) => {
      p1Socket.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: cardRed7.id }, resolve);
    });
    expect(finalPlayAck.success).toBe(true);
    expect(finalPlayAck.data.roundOver).toBe(true);

    const finalState = await roundFinishedPromise;
    expect(finalState.state.status).toBe('ROUND_OVER');
    expect(finalState.state.self.hand).toHaveLength(0);

    // 9. Verify Round Score Calculation (Mattel 42001 point values):
    // P2 had: Red Skip (20) + Blue Draw Two (20) + Wild (50) + 1 drawn card (scoreValue >= 0)
    // Minimum expected round score is at least 90
    expect(session!.state.roundWinner?.id).toBe(player1GuestId);
    const roundScore = session!.state.roundWinner?.roundScore ?? 0;
    expect(roundScore).toBeGreaterThanOrEqual(90);
    expect(session!.state.players[0].score).toBe(roundScore);

    // 10. Verify durable persistence in PostgreSQL database
    const dbMatch = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: true },
    });
    expect(dbMatch).not.toBeNull();
    expect(dbMatch!.status).toBe(MatchStatus.IN_PROGRESS); // Match continues because score < 500

    const dbP1 = dbMatch!.players.find((p) => p.guestId === player1GuestId);
    const dbP2 = dbMatch!.players.find((p) => p.guestId === player2GuestId);
    expect(dbP1?.score).toBe(roundScore);
    expect(dbP1?.cardCount).toBe(0);
    expect(dbP2?.score).toBe(0);
    expect(dbP2?.cardCount).toBeGreaterThanOrEqual(3);

    // Verify snapshot in database
    const dbSnapshot = await prisma.gameSnapshot.findFirst({
      where: { matchId },
      orderBy: { sequenceNumber: 'desc' },
    });
    expect(dbSnapshot).not.toBeNull();
    const parsedSnapshot =
      typeof dbSnapshot!.state === 'string'
        ? JSON.parse(dbSnapshot!.state)
        : (dbSnapshot!.state as Record<string, unknown>);
    expect(parsedSnapshot.status).toBe('ROUND_OVER');
  });

  it('handles multi-round progression, dealer rotation, score accumulation, and 500-point match completion', async () => {
    const mr1 = await guestService.createGuest('MultiRound1');
    const mr2 = await guestService.createGuest('MultiRound2');
    const p1Socket = createClient(mr1.rawSessionToken);
    const p2Socket = createClient(mr2.rawSessionToken);

    await Promise.all([
      new Promise<void>((resolve) => p1Socket.on('connect', resolve)),
      new Promise<void>((resolve) => p2Socket.on('connect', resolve)),
    ]);

    const createAck = await new Promise<any>((resolve) => {
      p1Socket.emit(SOCKET_EVENTS.ROOM_CREATE, { maxPlayers: 2 }, resolve);
    });
    expect(createAck.success).toBe(true);
    const roomCode = createAck.data.roomCode;

    await new Promise<any>((resolve) => {
      p2Socket.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });
    await new Promise<any>((resolve) => {
      p2Socket.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve);
    });

    const p1InitialStatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      p1Socket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    const startAck = await new Promise<any>((resolve) => {
      p1Socket.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
    });
    expect(startAck.success).toBe(true);
    await p1InitialStatePromise;

    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    expect(session).not.toBeNull();
    const matchId = session!.matchId;

    // Set round 1 to ROUND_OVER with P1 having 120 points, dealer was 0
    session!.state = {
      ...session!.state,
      status: 'ROUND_OVER',
      roundNumber: 1,
      dealerIndex: 0,
      players: [
        { ...session!.state.players[0], score: 120 },
        { ...session!.state.players[1], score: 0 },
      ],
    };

    // 1. Advance to next round via GAME_NEXT_ROUND
    const nextRoundStatePromise = new Promise<{ state: PlayerGameState }>((resolve) => {
      p1Socket.once(SOCKET_EVENTS.GAME_STATE, resolve);
    });

    const nextRoundAck = await new Promise<any>((resolve) => {
      p1Socket.emit(SOCKET_EVENTS.GAME_NEXT_ROUND, {}, resolve);
    });
    expect(nextRoundAck.success).toBe(true);

    const r2State = await nextRoundStatePromise;
    expect(r2State.state.roundNumber).toBe(2);
    expect(r2State.state.status).toBe('IN_PROGRESS');

    // Verify Dealer Rotation: dealer moved from 0 to 1
    expect(session!.state.dealerIndex).toBe(1);

    // Verify Fresh Hands dealt (7 cards each, or 9 if opening card was Draw Two per Mattel 42001)
    if (session!.state.topDiscardCard.value === 'draw_two') {
      const victimIndex = (session!.state.dealerIndex + 1) % 2;
      expect(session!.state.players[victimIndex].hand).toHaveLength(9);
      expect(session!.state.players[1 - victimIndex].hand).toHaveLength(7);
    } else {
      expect(session!.state.players[0].hand).toHaveLength(7);
      expect(session!.state.players[1].hand).toHaveLength(7);
    }

    // Verify Cumulative Score Retention: P1 still has 120 points
    expect(session!.state.players[0].score).toBe(120);

    // 2. Setup Round 2 end-game where P1 is at 480 cumulative points
    // P2 has Wild Draw Four (50 pts) in hand
    // P1 wins the round -> earns 50 points -> total 530 points (hits >= 500 target!)
    const cardBlue9 = CardFactory.createNumberCard('blue', '9', 88);
    const cardBlue4 = CardFactory.createNumberCard('blue', '4', 87);
    const cardWildDrawFour = CardFactory.createWildCard('wild_draw_four', 86);

    session!.state = {
      ...session!.state,
      topDiscardCard: cardBlue9,
      activeColor: 'blue',
      currentPlayerIndex: 0, // P1
      turnDirection: 'clockwise',
      unoVulnerablePlayerId: null,
      pendingActionState: null,
      players: [
        {
          ...session!.state.players[0],
          id: mr1.guest.id,
          score: 480,
          hand: [cardBlue4], // P1 has 1 card left
          hasDeclaredUno: true,
          hasDrawnThisTurn: false,
        },
        {
          ...session!.state.players[1],
          id: mr2.guest.id,
          score: 0,
          hand: [cardWildDrawFour], // 50 points
          hasDeclaredUno: false,
          hasDrawnThisTurn: false,
        },
      ],
    };

    // 3. P1 plays final card -> empties hand, accumulates 50 points, hits 530 points!
    const playFinalAck = await new Promise<any>((resolve) => {
      p1Socket.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: cardBlue4.id }, resolve);
    });
    expect(playFinalAck.success).toBe(true);
    expect(playFinalAck.data.matchOver).toBe(true);

    // 4. Assert Match Completion Status and Winner
    expect(session!.state.status).toBe('COMPLETED');
    expect(session!.state.winner?.id).toBe(mr1.guest.id);
    expect(session!.state.winner?.score).toBe(530);

    // 5. Verify PostgreSQL DB has COMPLETED status and winnerGuestId
    const dbMatch = await prisma.match.findUnique({
      where: { id: matchId },
      include: { players: true },
    });
    expect(dbMatch!.status).toBe(MatchStatus.COMPLETED);
    expect(dbMatch!.winnerGuestId).toBe(mr1.guest.id);

    const dbP1 = dbMatch!.players.find((p) => p.guestId === mr1.guest.id);
    const dbP2 = dbMatch!.players.find((p) => p.guestId === mr2.guest.id);
    expect(dbP1?.isWinner).toBe(true);
    expect(dbP1?.score).toBe(530);
    expect(dbP2?.isWinner).toBe(false);

    // 6. Verify subsequent gameplay attempts on a COMPLETED match are rejected
    const postGamePlayAck = await new Promise<any>((resolve) => {
      p1Socket.emit(SOCKET_EVENTS.GAME_DRAW_CARD, {}, resolve);
    });
    expect(postGamePlayAck.success).toBe(false);
  }, 30000);
});
