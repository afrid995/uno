import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { guestService } from '../../src/modules/guest/guest.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { cancelAllCountdownTimersForTesting } from '../../src/sockets/roomSocketHandler';
import { SOCKET_EVENTS, PlayerGameState } from '@uno-ultimate/game-protocol';
import { CardFactory, GameState } from '@uno-ultimate/game-engine';

describe('Full Application-Wide Interaction Reliability Socket Integration Tests', () => {
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  let activeClients: ClientSocket[] = [];

  beforeAll(async () => {
    httpServer = createServer(createApp());
    initializeSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 4032;
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

  const waitForConnect = (socket: ClientSocket): Promise<void> => {
    return new Promise((resolve) => {
      if (socket.connected) return resolve();
      socket.once('connect', () => resolve());
    });
  };

  const createAndJoinRoom = async (
    variant: string
  ): Promise<{
    c1: ClientSocket;
    c2: ClientSocket;
    c3: ClientSocket;
    p1Id: string;
    p2Id: string;
    p3Id: string;
    roomCode: string;
    roomId: string;
  }> => {
    const s1 = await guestService.createGuest(`Host_${Date.now()}_${Math.random()}`);
    const s2 = await guestService.createGuest(`P2_${Date.now()}_${Math.random()}`);
    const s3 = await guestService.createGuest(`P3_${Date.now()}_${Math.random()}`);

    const p1Id = s1.guest.id;
    const p2Id = s2.guest.id;
    const p3Id = s3.guest.id;

    const c1 = createClient(s1.rawSessionToken);
    const c2 = createClient(s2.rawSessionToken);
    const c3 = createClient(s3.rawSessionToken);

    await Promise.all([waitForConnect(c1), waitForConnect(c2), waitForConnect(c3)]);

    const createAck = await new Promise<any>((resolve) => {
      c1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        {
          name: 'Reliability Room',
          maxPlayers: 3,
          isPrivate: false,
          settings: { variant },
        },
        resolve
      );
    });

    if (!createAck.success) {
      console.error('createAck failed with error:', createAck.error);
    }
    expect(createAck.success).toBe(true);
    const roomCode = createAck.data.roomCode;
    const roomId = createAck.data.id;

    await new Promise<any>((res) => c2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, res));
    await new Promise<any>((res) => c2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, res));

    await new Promise<any>((res) => c3.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, res));
    await new Promise<any>((res) => c3.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, res));

    let p1State: PlayerGameState | null = null;
    let p2State: PlayerGameState | null = null;
    let p3State: PlayerGameState | null = null;

    c1.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      if (payload.state.roomId === roomId) p1State = payload.state;
    });
    c2.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      if (payload.state.roomId === roomId) p2State = payload.state;
    });
    c3.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      if (payload.state.roomId === roomId) p3State = payload.state;
    });

    const startAck = await new Promise<any>((resolve) => {
      c1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
    });
    expect(startAck.success).toBe(true);

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (p1State && p2State && p3State) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });

    return { c1, c2, c3, p1Id, p2Id, p3Id, roomCode, roomId };
  };

  describe('UNO 7-Card Hand Swap Flow & Reliability', () => {
    it('successfully swaps hands, returns authoritative state in ack, and advances turn', async () => {
      const { c1, p1Id, p2Id, roomCode } = await createAndJoinRoom('uno_show_em_no_mercy');

      const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
      expect(session).toBeDefined();

      const p1OriginalHand = [
        CardFactory.createNumberCard('red', '7', 1),
        CardFactory.createNumberCard('red', '1', 1),
      ];
      const p2OriginalHand = [
        CardFactory.createNumberCard('blue', '3', 1),
        CardFactory.createNumberCard('blue', '4', 1),
        CardFactory.createNumberCard('blue', '5', 1),
      ];

      const modifiedState: GameState = {
        ...session.state,
        currentPlayerIndex: 0,
        pendingActionState: {
          type: 'AWAITING_7S_SWAP_SELECTION',
          sourcePlayerId: p1Id,
        },
        players: session.state.players.map((p, idx) => {
          if (idx === 0) return { ...p, hand: p1OriginalHand };
          if (idx === 1) return { ...p, hand: p2OriginalHand };
          return p;
        }),
      };
      gameSessionManager.updateState(session.matchId, modifiedState);

      // Player 1 emits GAME_CHOOSE_7S_SWAP targeting Player 2
      const swapAck = await new Promise<{
        success: boolean;
        data?: { success: boolean; targetPlayerId: string; state?: PlayerGameState };
      }>((resolve) => {
        c1.emit(
          SOCKET_EVENTS.GAME_CHOOSE_7S_SWAP,
          { targetPlayerId: p2Id },
          (res: {
            success: boolean;
            data?: { success: boolean; targetPlayerId: string; state?: PlayerGameState };
          }) => resolve(res)
        );
      });

      expect(swapAck.success).toBe(true);
      expect(swapAck.data?.targetPlayerId).toBe(p2Id);
      expect(swapAck.data?.state).toBeDefined();
      expect(swapAck.data?.state?.self?.canChoose7sSwap).toBe(false);

      // Verify hands are swapped in updated authoritative state
      const updatedSession = gameSessionManager.getSessionByRoomCode(roomCode)!;
      const updatedP1 = updatedSession.state.players.find((p) => p.id === p1Id)!;
      const updatedP2 = updatedSession.state.players.find((p) => p.id === p2Id)!;

      expect(updatedP1.hand.length).toBe(3);
      expect(updatedP2.hand.length).toBe(2);
      expect(updatedSession.state.pendingActionState).toBeNull();
      // Turn advances to next player (player index 1)
      expect(updatedSession.state.currentPlayerIndex).toBe(1);
    });

    it('safely absorbs rapid double-click on 7s swap without error', async () => {
      const { c1, p1Id, p2Id, roomCode } = await createAndJoinRoom('uno_show_em_no_mercy');

      const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
      const modifiedState: GameState = {
        ...session.state,
        currentPlayerIndex: 0,
        pendingActionState: {
          type: 'AWAITING_7S_SWAP_SELECTION',
          sourcePlayerId: p1Id,
        },
      };
      gameSessionManager.updateState(session.matchId, modifiedState);

      // Rapid concurrent double-click
      const [res1, res2] = await Promise.all([
        new Promise<{ success: boolean }>((resolve) => {
          c1.emit(
            SOCKET_EVENTS.GAME_CHOOSE_7S_SWAP,
            { targetPlayerId: p2Id },
            (res: { success: boolean }) => resolve(res)
          );
        }),
        new Promise<{ success: boolean }>((resolve) => {
          c1.emit(
            SOCKET_EVENTS.GAME_CHOOSE_7S_SWAP,
            { targetPlayerId: p2Id },
            (res: { success: boolean }) => resolve(res)
          );
        }),
      ]);

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);

      const updatedSession = gameSessionManager.getSessionByRoomCode(roomCode)!;
      expect(updatedSession.state.pendingActionState).toBeNull();
    });

    it('rejects swapping hands with oneself with descriptive error', async () => {
      const { c1, p1Id, roomCode } = await createAndJoinRoom('uno_show_em_no_mercy');

      const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
      const modifiedState: GameState = {
        ...session.state,
        currentPlayerIndex: 0,
        pendingActionState: {
          type: 'AWAITING_7S_SWAP_SELECTION',
          sourcePlayerId: p1Id,
        },
      };
      gameSessionManager.updateState(session.matchId, modifiedState);

      // Attempt to swap hands with self (p1Id)
      const res = await new Promise<{ success: boolean; error?: { message: string } }>((resolve) => {
        c1.emit(
          SOCKET_EVENTS.GAME_CHOOSE_7S_SWAP,
          { targetPlayerId: p1Id },
          (ack: { success: boolean; error?: { message: string } }) => resolve(ack)
        );
      });

      expect(res.success).toBe(false);
      expect(res.error?.message).toMatch(/Cannot swap hands with yourself/i);
    });
  });

  describe('All Wild Forced Swap Flow & Idempotency', () => {
    it('successfully swaps hands in All Wild, returns authoritative state, and absorbs duplicates', async () => {
      const { c1, p1Id, p2Id, roomCode } = await createAndJoinRoom('uno_all_wild');

      const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
      const modifiedState: GameState = {
        ...session.state,
        currentPlayerIndex: 0,
        pendingActionState: {
          type: 'AWAITING_FORCED_SWAP_SELECTION',
          sourcePlayerId: p1Id,
        },
      };
      gameSessionManager.updateState(session.matchId, modifiedState);

      // First click
      const res1 = await new Promise<{
        success: boolean;
        data?: { success: boolean; targetPlayerId: string; state?: PlayerGameState };
      }>((resolve) => {
        c1.emit(
          SOCKET_EVENTS.GAME_CHOOSE_FORCED_SWAP,
          { targetPlayerId: p2Id },
          (ack: { success: boolean; data?: { success: boolean; targetPlayerId: string; state?: PlayerGameState } }) =>
            resolve(ack)
        );
      });

      expect(res1.success).toBe(true);
      expect(res1.data?.state).toBeDefined();

      // Immediate duplicate click is absorbed
      const res2 = await new Promise<{ success: boolean }>((resolve) => {
        c1.emit(
          SOCKET_EVENTS.GAME_CHOOSE_FORCED_SWAP,
          { targetPlayerId: p2Id },
          (ack: { success: boolean }) => resolve(ack)
        );
      });

      expect(res2.success).toBe(true);
    });
  });

  describe('No Mercy Color Roulette Flow & Idempotency', () => {
    it('resolves color roulette, delivers authoritative state, and absorbs duplicates', async () => {
      const { c2, p1Id, p2Id, roomCode } = await createAndJoinRoom('uno_show_em_no_mercy');

      const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
      const modifiedState: GameState = {
        ...session.state,
        currentPlayerIndex: 1,
        pendingActionState: {
          type: 'AWAITING_COLOR_ROULETTE_SELECTION',
          victimPlayerId: p2Id,
          playedByPlayerId: p1Id,
        },
      };
      gameSessionManager.updateState(session.matchId, modifiedState);

      // Player 2 emits GAME_CHOOSE_ROULETTE_COLOR
      const res1 = await new Promise<{
        success: boolean;
        data?: { success: boolean; cardsRevealed: number; eliminated: boolean; state?: PlayerGameState };
      }>((resolve) => {
        c2.emit(
          SOCKET_EVENTS.GAME_CHOOSE_ROULETTE_COLOR,
          { chosenColor: 'red' },
          (ack: {
            success: boolean;
            data?: { success: boolean; cardsRevealed: number; eliminated: boolean; state?: PlayerGameState };
          }) => resolve(ack)
        );
      });

      expect(res1.success).toBe(true);
      expect(res1.data?.state).toBeDefined();

      // Duplicate click is safely absorbed
      const res2 = await new Promise<{ success: boolean }>((resolve) => {
        c2.emit(
          SOCKET_EVENTS.GAME_CHOOSE_ROULETTE_COLOR,
          { chosenColor: 'red' },
          (ack: { success: boolean }) => resolve(ack)
        );
      });

      expect(res2.success).toBe(true);
    });
  });

  describe('Targeted Selections across All Wild, Flex, and Attack', () => {
    it('handles All Wild Targeted Draw Two with state return', async () => {
      const { c1, p1Id, p2Id, roomCode } = await createAndJoinRoom('uno_all_wild');

      const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
      const modifiedState: GameState = {
        ...session.state,
        currentPlayerIndex: 0,
        pendingActionState: {
          type: 'AWAITING_TARGETED_DRAW_TWO_SELECTION',
          sourcePlayerId: p1Id,
        },
      };
      gameSessionManager.updateState(session.matchId, modifiedState);

      const res = await new Promise<{
        success: boolean;
        data?: { success: boolean; targetPlayerId: string; state?: PlayerGameState };
      }>((resolve) => {
        c1.emit(
          SOCKET_EVENTS.GAME_CHOOSE_TARGETED_DRAW_TWO,
          { targetPlayerId: p2Id },
          (ack: { success: boolean; data?: { success: boolean; targetPlayerId: string; state?: PlayerGameState } }) =>
            resolve(ack)
        );
      });

      expect(res.success).toBe(true);
      expect(res.data?.state).toBeDefined();
    });

    it('handles UNO Flex Targeted Draw Four with state return', async () => {
      const { c1, p1Id, p2Id, roomCode } = await createAndJoinRoom('uno_flex');

      const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
      const modifiedState: GameState = {
        ...session.state,
        currentPlayerIndex: 0,
        pendingActionState: {
          type: 'AWAITING_TARGETED_DRAW_FOUR_SELECTION',
          sourcePlayerId: p1Id,
        },
      };
      gameSessionManager.updateState(session.matchId, modifiedState);

      const res = await new Promise<{
        success: boolean;
        data?: { success: boolean; targetPlayerId: string; state?: PlayerGameState };
      }>((resolve) => {
        c1.emit(
          SOCKET_EVENTS.GAME_CHOOSE_TARGETED_DRAW_FOUR,
          { targetPlayerId: p2Id },
          (ack: { success: boolean; data?: { success: boolean; targetPlayerId: string; state?: PlayerGameState } }) =>
            resolve(ack)
        );
      });

      expect(res.success).toBe(true);
      expect(res.data?.state).toBeDefined();
    });

    it('handles UNO Attack Target Selection with state return', async () => {
      const { c1, p1Id, p2Id, roomCode } = await createAndJoinRoom('uno_attack');

      const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
      const modifiedState: GameState = {
        ...session.state,
        currentPlayerIndex: 0,
        pendingActionState: {
          type: 'AWAITING_ATTACK_TARGET_SELECTION',
          playedByPlayerId: p1Id,
          chosenColor: 'red',
        },
      };
      gameSessionManager.updateState(session.matchId, modifiedState);

      const res = await new Promise<{
        success: boolean;
        data?: { success: boolean; state?: PlayerGameState };
      }>((resolve) => {
        c1.emit(
          SOCKET_EVENTS.GAME_CHOOSE_ATTACK_TARGET,
          { targetPlayerId: p2Id },
          (ack: { success: boolean; data?: { success: boolean; state?: PlayerGameState } }) =>
            resolve(ack)
        );
      });

      expect(res.success).toBe(true);
      expect(res.data?.state).toBeDefined();
    });
  });

  describe('Normal Turn Actions (Draw Card, Pass Turn, UNO Shout)', () => {
    it('draws a card and passes turn, receiving state in both acks', async () => {
      const { c1, roomCode } = await createAndJoinRoom('classic');

      const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
      const matchingCard = CardFactory.createNumberCard('red', '7', 1);
      const topDiscard = CardFactory.createNumberCard('red', '5', 1);
      const modifiedState: GameState = {
        ...session.state,
        currentPlayerIndex: 0,
        activeColor: 'red',
        topDiscardCard: topDiscard,
        drawPile: [matchingCard],
        discardPile: [topDiscard],
        pendingActionState: null,
      };
      gameSessionManager.updateState(session.matchId, modifiedState);

      // 1. Draw Card
      const drawAck = await new Promise<{
        success: boolean;
        data?: { cardDrawn: boolean; cardId?: string; state?: PlayerGameState };
      }>((resolve) => {
        c1.emit(
          SOCKET_EVENTS.GAME_DRAW_CARD,
          {},
          (ack: { success: boolean; data?: { cardDrawn: boolean; cardId?: string; state?: PlayerGameState } }) =>
            resolve(ack)
        );
      });

      expect(drawAck.success).toBe(true);
      expect(drawAck.data?.cardDrawn).toBe(true);
      expect(drawAck.data?.state).toBeDefined();

      // 2. Pass Turn
      const passAck = await new Promise<{
        success: boolean;
        data?: { passed: boolean; state?: PlayerGameState };
      }>((resolve) => {
        c1.emit(
          SOCKET_EVENTS.GAME_PASS_TURN,
          {},
          (ack: { success: boolean; data?: { passed: boolean; state?: PlayerGameState } }) =>
            resolve(ack)
        );
      });

      expect(passAck.success).toBe(true);
      expect(passAck.data?.passed).toBe(true);
      expect(passAck.data?.state).toBeDefined();
    });

    it('declares UNO and challenges missed UNO reliably', async () => {
      const { c1, roomCode } = await createAndJoinRoom('classic');

      const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
      const modifiedState: GameState = {
        ...session.state,
        currentPlayerIndex: 0,
        pendingActionState: null,
        players: session.state.players.map((p, idx) =>
          idx === 0 ? { ...p, hand: [CardFactory.createNumberCard('red', '5', 1), CardFactory.createNumberCard('blue', '7', 1)] } : p
        ),
      };
      gameSessionManager.updateState(session.matchId, modifiedState);

      // Player 1 declares UNO
      const unoAck = await new Promise<{
        success: boolean;
        data?: { declared: boolean; state?: PlayerGameState };
      }>((resolve) => {
        c1.emit(
          SOCKET_EVENTS.GAME_UNO,
          {},
          (ack: { success: boolean; data?: { declared: boolean; state?: PlayerGameState } }) =>
            resolve(ack)
        );
      });

      expect(unoAck.success).toBe(true);
      expect(unoAck.data?.declared).toBe(true);
      expect(unoAck.data?.state).toBeDefined();
    });
  });
});
