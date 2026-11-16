import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { guestService } from '../../src/modules/guest/guest.service';
import { gameSessionManager } from '../../src/modules/game/game.session.manager';
import { cancelAllCountdownTimersForTesting } from '../../src/sockets/roomSocketHandler';
import { SOCKET_EVENTS, PlayerGameState } from '@uno-ultimate/game-protocol';
import { NoMercyFixtureBuilder, assertValidNoMercyGameState, getPlayerGameState } from '@uno-ultimate/game-engine';

describe('UNO Show \'em No Mercy — Wild Reverse Draw 4 Stacking Regression Tests', () => {
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  let activeClients: ClientSocket[] = [];

  let p1Id: string;
  let p1Token: string;
  let p2Id: string;
  let p2Token: string;
  let p3Id: string;
  let p3Token: string;

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

    const s1 = await guestService.createGuest('Alice');
    p1Id = s1.guest.id;
    p1Token = s1.rawSessionToken;

    const s2 = await guestService.createGuest('Bob');
    p2Id = s2.guest.id;
    p2Token = s2.rawSessionToken;

    const s3 = await guestService.createGuest('Charlie');
    p3Id = s3.guest.id;
    p3Token = s3.rawSessionToken;
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

  it('allows Wild Reverse Draw 4 on Draw 4: penalty accumulates to +8, reverses direction, and passes to next player', async () => {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);
    const s3 = createClient(p3Token);

    await Promise.all([
      new Promise<void>((res) => s1.on('connect', res)),
      new Promise<void>((res) => s2.on('connect', res)),
      new Promise<void>((res) => s3.on('connect', res)),
    ]);

    // Alice creates 3-player No Mercy room
    const createAck = await new Promise<any>((resolve) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 3, settings: { variant: 'uno_show_em_no_mercy' } },
        resolve
      );
    });
    expect(createAck.success).toBe(true);
    const roomCode = createAck.data.roomCode;
    const roomId = createAck.data.id;

    // Bob and Charlie join
    await new Promise<any>((resolve) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve));
    await new Promise<any>((resolve) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve));

    await new Promise<any>((resolve) => s3.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve));
    await new Promise<any>((resolve) => s3.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve));

    let p1State: PlayerGameState | null = null;
    let p2State: PlayerGameState | null = null;
    let p3State: PlayerGameState | null = null;

    s1.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      if (payload.state.roomId === roomId) p1State = payload.state;
    });
    s2.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      if (payload.state.roomId === roomId) p2State = payload.state;
    });
    s3.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      if (payload.state.roomId === roomId) p3State = payload.state;
    });

    const startAck = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve);
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

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    expect(session.state.variant).toBe('uno_show_em_no_mercy');

    // Deterministically arrange players: Alice (idx 0), Bob (idx 1), Charlie (idx 2), direction clockwise
    session.state = {
      ...session.state,
      turnDirection: 'clockwise',
      currentPlayerIndex: 0,
    };

    // 1. Inject Draw Four into Alice's hand
    const { nextState: sWithD4, card: d4 } = NoMercyFixtureBuilder.injectPlayableCard(
      session.state,
      p1Id,
      'draw_four',
      session.state.activeColor ?? 'blue'
    );
    session.state = sWithD4;

    // Alice plays Draw Four on Bob
    const playD4Ack = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: d4.id }, resolve);
    });
    expect(playD4Ack.success).toBe(true);

    // Verify Bob is now targeted by stack penalty (+4)
    expect(session.state.pendingActionState?.type).toBe('AWAITING_STACK_RESOLUTION');
    if (session.state.pendingActionState?.type === 'AWAITING_STACK_RESOLUTION') {
      expect(session.state.pendingActionState.targetPlayerId).toBe(p2Id);
      expect(session.state.pendingActionState.accumulatedPenalty).toBe(4);
      expect(session.state.pendingActionState.lastStackedValue).toBe(4);
    }
    expect(session.state.currentPlayerIndex).toBe(1);

    // 2. Inject Wild Reverse Draw 4 into Bob's hand
    const { nextState: sWithWrd4, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(
      session.state,
      p2Id,
      'wild_reverse_draw_four'
    );
    session.state = sWithWrd4;

    // Verify Bob's player state projection:
    // Bob is targeted by stack, canStack is true, and playableCardIds includes Wild Reverse Draw 4!
    const bobView = getPlayerGameState(session.state, p2Id);
    expect(bobView.self.isTargetedByStack).toBe(true);
    expect(bobView.self.canStack).toBe(true);
    expect(bobView.self.playableCardIds).toContain(wrd4.id);

    // Bob plays Wild Reverse Draw 4 with chosenColor 'red'
    const playWrd4Ack = await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: wrd4.id, chosenColor: 'red' }, resolve);
    });
    expect(playWrd4Ack.success).toBe(true);

    // 3. Verify state invariants after Wild Reverse Draw 4 stack:
    // a. Direction of play reversed from clockwise to counter_clockwise
    expect(session.state.turnDirection).toBe('counter_clockwise');

    // b. Accumulated penalty became 4 + 4 = 8
    expect(session.state.pendingActionState?.type).toBe('AWAITING_STACK_RESOLUTION');
    if (session.state.pendingActionState?.type === 'AWAITING_STACK_RESOLUTION') {
      expect(session.state.pendingActionState.accumulatedPenalty).toBe(8);
      expect(session.state.pendingActionState.lastStackedValue).toBe(4);
      expect(session.state.pendingActionState.lastCardValue).toBe('wild_reverse_draw_four');

      // c. In counter_clockwise from Bob (idx 1), the next player is Alice (idx 0)!
      expect(session.state.pendingActionState.targetPlayerId).toBe(p1Id);
    }
    expect(session.state.currentPlayerIndex).toBe(0);
    assertValidNoMercyGameState(session.state);

    // 4. Further stacking: Alice stacks another Wild Reverse Draw 4!
    const { nextState: sWithWrd4Alice, card: wrd4Alice } = NoMercyFixtureBuilder.injectPlayableCard(
      session.state,
      p1Id,
      'wild_reverse_draw_four'
    );
    session.state = sWithWrd4Alice;

    const playWrd4AliceAck = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: wrd4Alice.id, chosenColor: 'green' }, resolve);
    });
    expect(playWrd4AliceAck.success).toBe(true);

    // Direction reverses back: counter_clockwise -> clockwise
    expect(session.state.turnDirection).toBe('clockwise');
    // Penalty accumulates: 8 + 4 = 12
    if (session.state.pendingActionState?.type === 'AWAITING_STACK_RESOLUTION') {
      expect(session.state.pendingActionState.accumulatedPenalty).toBe(12);
      expect(session.state.pendingActionState.lastStackedValue).toBe(4);
      // Next in clockwise from Alice (idx 0) is Bob (idx 1)!
      expect(session.state.pendingActionState.targetPlayerId).toBe(p2Id);
    }
    expect(session.state.currentPlayerIndex).toBe(1);

    // 5. Bob stacks Wild Draw Six (+6 >= 4)
    const { nextState: sWithWd6, card: wd6 } = NoMercyFixtureBuilder.injectPlayableCard(
      session.state,
      p2Id,
      'wild_draw_six'
    );
    session.state = sWithWd6;

    const playWd6Ack = await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: wd6.id, chosenColor: 'blue' }, resolve);
    });
    expect(playWd6Ack.success).toBe(true);

    // Direction remains clockwise, penalty becomes 12 + 6 = 18, target is Charlie (idx 2)!
    expect(session.state.turnDirection).toBe('clockwise');
    if (session.state.pendingActionState?.type === 'AWAITING_STACK_RESOLUTION') {
      expect(session.state.pendingActionState.accumulatedPenalty).toBe(18);
      expect(session.state.pendingActionState.lastStackedValue).toBe(6);
      expect(session.state.pendingActionState.targetPlayerId).toBe(p3Id);
    }
    expect(session.state.currentPlayerIndex).toBe(2);

    // 6. Charlie tries to stack a Wild Reverse Draw 4 (+4 < 6) -> REJECTED!
    const { nextState: sWithWrd4Charlie, card: wrd4Charlie } = NoMercyFixtureBuilder.injectPlayableCard(
      session.state,
      p3Id,
      'wild_reverse_draw_four'
    );
    session.state = sWithWrd4Charlie;

    const rejectStackAck = await new Promise<any>((resolve) => {
      s3.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: wrd4Charlie.id, chosenColor: 'yellow' }, resolve);
    });
    expect(rejectStackAck.success).toBe(false);
    expect(rejectStackAck.error?.message).toMatch(/Cannot stack a \+4 onto a \+6/);

    // 7. Charlie accepts the 18 cards penalty
    const acceptAck = await new Promise<any>((resolve) => {
      s3.emit(SOCKET_EVENTS.GAME_ACCEPT_STACK_PENALTY, {}, resolve);
    });
    expect(acceptAck.success).toBe(true);

    // Charlie had 7 cards, now 7 + 18 = 25 -> Mercy Rule Elimination!
    const charlieInState = session.state.players.find((p) => p.id === p3Id)!;
    expect(charlieInState.isEliminated).toBe(true);
    assertValidNoMercyGameState(session.state);

    // Cleanup room
    await new Promise<void>((res) => s3.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
    await new Promise<void>((res) => s2.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
    await new Promise<void>((res) => s1.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
  });

  it('2-player match: Wild Reverse Draw 4 stacked on Draw 4 rebounds penalty to opponent with +8', async () => {
    const s1 = createClient(p1Token);
    const s2 = createClient(p2Token);

    await Promise.all([
      new Promise<void>((res) => s1.on('connect', res)),
      new Promise<void>((res) => s2.on('connect', res)),
    ]);

    const createAck = await new Promise<any>((resolve) => {
      s1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { maxPlayers: 2, settings: { variant: 'uno_show_em_no_mercy' } },
        resolve
      );
    });
    const roomCode = createAck.data.roomCode;
    const roomId = createAck.data.id;

    await new Promise<any>((resolve) => s2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve));
    await new Promise<any>((resolve) => s2.emit(SOCKET_EVENTS.ROOM_READY, { isReady: true }, resolve));

    let p1State: PlayerGameState | null = null;
    let p2State: PlayerGameState | null = null;

    s1.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      if (payload.state.roomId === roomId) p1State = payload.state;
    });
    s2.on(SOCKET_EVENTS.GAME_STATE, (payload: { state: PlayerGameState }) => {
      if (payload.state.roomId === roomId) p2State = payload.state;
    });

    await new Promise<any>((resolve) => s1.emit(SOCKET_EVENTS.ROOM_START, { immediate: true }, resolve));

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (p1State && p2State) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
    });

    const session = gameSessionManager.getSessionByRoomCode(roomCode)!;
    session.state = { ...session.state, currentPlayerIndex: 0 };

    // P1 plays Draw Four
    const { nextState: sWithD4, card: d4 } = NoMercyFixtureBuilder.injectPlayableCard(
      session.state,
      p1Id,
      'draw_four',
      session.state.activeColor ?? 'blue'
    );
    session.state = sWithD4;

    const playD4Ack = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: d4.id }, resolve);
    });
    expect(playD4Ack.success).toBe(true);

    // P2 stacks Wild Reverse Draw 4 onto Draw Four
    const { nextState: sWithWrd4, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(
      session.state,
      p2Id,
      'wild_reverse_draw_four'
    );
    session.state = sWithWrd4;

    const playWrd4Ack = await new Promise<any>((resolve) => {
      s2.emit(SOCKET_EVENTS.GAME_PLAY_CARD, { cardId: wrd4.id, chosenColor: 'blue' }, resolve);
    });
    expect(playWrd4Ack.success).toBe(true);

    // In 2-player mode, the +8 penalty rebounds to P1!
    expect(session.state.pendingActionState?.type).toBe('AWAITING_STACK_RESOLUTION');
    if (session.state.pendingActionState?.type === 'AWAITING_STACK_RESOLUTION') {
      expect(session.state.pendingActionState.targetPlayerId).toBe(p1Id);
      expect(session.state.pendingActionState.accumulatedPenalty).toBe(8);
      expect(session.state.pendingActionState.lastStackedValue).toBe(4);
    }
    expect(session.state.currentPlayerIndex).toBe(0);

    // P1 accepts the 8 penalty cards
    const acceptAck = await new Promise<any>((resolve) => {
      s1.emit(SOCKET_EVENTS.GAME_ACCEPT_STACK_PENALTY, {}, resolve);
    });
    expect(acceptAck.success).toBe(true);
    expect(session.state.pendingActionState).toBeNull();

    await new Promise<void>((res) => s2.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
    await new Promise<void>((res) => s1.emit(SOCKET_EVENTS.ROOM_LEAVE, undefined, () => res()));
  });
});
