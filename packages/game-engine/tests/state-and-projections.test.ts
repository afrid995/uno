import { describe, it, expect } from 'vitest';
import { GameFactory } from '../src/game/game.factory';
import { GameEngine } from '../src/game/game.state';
import { GameSerializer } from '../src/game/game.serializer';
import { getPublicGameState } from '../src/projections/public-state';
import { getPlayerGameState } from '../src/projections/player-state';
import { createSeededRng } from '../src/testing/deterministic-random';
import { DeckManager } from '../src/deck/deck.manager';

describe('Game State, Factory, Projections, and Serialization', () => {
  const players = [
    { id: 'guest_1', username: 'Alice' },
    { id: 'guest_2', username: 'Bob' },
    { id: 'guest_3', username: 'Charlie' },
  ];

  it('GameFactory rejects player counts outside official bounds (2 to 10)', () => {
    expect(() =>
      GameFactory.createGame({ roomId: 'r1', players: [{ id: 'solo', username: 'Solo' }] })
    ).toThrow(/Invalid player count/);

    const elevenPlayers = Array.from({ length: 11 }, (_, i) => ({
      id: `p${i}`,
      username: `Player${i}`,
    }));
    expect(() =>
      GameFactory.createGame({ roomId: 'r1', players: elevenPlayers })
    ).toThrow(/Invalid player count/);
  });

  it('GameFactory initializes match with 7 cards per player and starting discard pile', () => {
    const rng = createSeededRng(999);
    const state = GameFactory.createGame({ roomId: 'room_123', players }, rng);

    expect(state.status).toBe('IN_PROGRESS');
    expect(state.players).toHaveLength(3);
    for (const p of state.players) {
      expect(p.hand).toHaveLength(7);
    }
    expect(state.topDiscardCard).toBeDefined();
    // Starting card cannot be a Wild Draw Four per official Mattel rules
    expect(state.topDiscardCard.value).not.toBe('wild_draw_four');

    // Total cards conserved: 3 * 7 hands + 1 discard + remaining draw pile = 108
    expect(
      DeckManager.assertDeckConservation(
        state.drawPile,
        state.discardPile,
        state.players.map((p) => p.hand),
        108
      )
    ).toBe(true);
  });

  describe('State Projections & Privacy Safeguards', () => {
    it('getPublicGameState strictly conceals private hands and draw pile', () => {
      const state = GameFactory.createGame({ roomId: 'room_123', players });
      const publicView = getPublicGameState(state);

      // Verify no hand arrays exist in public player objects
      for (const p of publicView.players) {
        const actualPlayer = state.players.find((x) => x.id === p.id)!;
        expect(p).toHaveProperty('cardCount', actualPlayer.hand.length);
        expect((p as unknown as { hand?: unknown }).hand).toBeUndefined();
      }

      // Verify draw pile cards are not exposed
      expect((publicView as unknown as { drawPile?: unknown }).drawPile).toBeUndefined();
      expect(publicView.drawPileCount).toBe(state.drawPile.length);
    });

    it('getPlayerGameState exposes only the requesting player own hand and legal moves', () => {
      const state = GameFactory.createGame({ roomId: 'room_123', players });
      const aliceView = getPlayerGameState(state, 'guest_1');

      // Alice can see her own hand
      expect(aliceView.self.id).toBe('guest_1');
      expect(aliceView.self.hand).toHaveLength(state.players[0].hand.length);

      // Opponents' hands in public list remain concealed
      for (const p of aliceView.players) {
        const actualPlayer = state.players.find((x) => x.id === p.id)!;
        expect((p as unknown as { hand?: unknown }).hand).toBeUndefined();
        expect(p.cardCount).toBe(actualPlayer.hand.length);
      }

      // Legal moves are computed
      expect(Array.isArray(aliceView.self.playableCardIds)).toBe(true);
    });

    it('never exposes challenged opponent hand or inspectedChallengedHand to challenger or any player', () => {
      const state = GameFactory.createGame({ roomId: 'room_123', players });
      // Simulate state with an inspection hand if one existed
      const stateWithInspection = {
        ...state,
        inspectionHand: {
          challengerPlayerId: 'guest_1',
          offenderPlayerId: 'guest_2',
          hand: state.players[1].hand,
        },
      };

      const challengerProjection = getPlayerGameState(stateWithInspection, 'guest_1');
      const offenderProjection = getPlayerGameState(stateWithInspection, 'guest_2');
      const observerProjection = getPlayerGameState(stateWithInspection, 'guest_3');

      // None of the players receive inspectedChallengedHand or offender's private cards
      expect((challengerProjection as any).inspectedChallengedHand).toBeUndefined();
      expect((offenderProjection as any).inspectedChallengedHand).toBeUndefined();
      expect((observerProjection as any).inspectedChallengedHand).toBeUndefined();

      // Challenger can only see their own cards
      expect(challengerProjection.self.id).toBe('guest_1');
      expect(challengerProjection.self.hand).toEqual(state.players[0].hand);

      // Challenger cannot see offender's cards anywhere in public players list
      const offenderInPublic = challengerProjection.players.find((p) => p.id === 'guest_2')!;
      expect((offenderInPublic as any).hand).toBeUndefined();
      expect(offenderInPublic.cardCount).toBe(state.players[1].hand.length);
    });

    it('throws error when requesting private projection for non-participant', () => {
      const state = GameFactory.createGame({ roomId: 'room_123', players });
      expect(() => getPlayerGameState(state, 'intruder_guest')).toThrow(/not a participant/);
    });
  });

  describe('Game State Serialization and Round-Trip Restoration', () => {
    it('serializes GameState to JSON and deserializes back with identical fidelity', () => {
      const rng = createSeededRng(42);
      const originalState = GameFactory.createGame({ roomId: 'room_serialize', players }, rng);

      const json = GameSerializer.serialize(originalState);
      expect(typeof json).toBe('string');

      const restored = GameSerializer.deserialize(json);
      expect(restored).toEqual(originalState);
    });

    it('GameEngine class encapsulates dispatch and serialization', () => {
      const rng = createSeededRng(100);
      const state = GameFactory.createGame({ roomId: 'room_engine', players }, rng);
      const engine = new GameEngine(state);

      const serialized = engine.serialize();
      const restoredEngine = GameEngine.deserialize(serialized);

      expect(restoredEngine.getState()).toEqual(engine.getState());
      expect(restoredEngine.getPublicState()).toEqual(engine.getPublicState());
    });
  });

  describe('End-to-End Deterministic Match Simulation', () => {
    it('executes a sequence of valid moves deterministically using seeded RNG', () => {
      const rng = createSeededRng(777);
      const state = GameFactory.createGame({ roomId: 'room_sim', players }, rng);
      const engine = new GameEngine(state);

      // Current player Alice
      const currentPlayerId = engine.getState().players[engine.getState().currentPlayerIndex].id;
      const playerState = engine.getPlayerState(currentPlayerId);

      if (playerState.self.playableCardIds.length > 0) {
        const cardToPlay = playerState.self.playableCardIds[0];
        const card = playerState.self.hand.find((c) => c.id === cardToPlay)!;

        const { nextState } = engine.dispatch(
          {
            type: 'PLAY_CARD',
            playerId: currentPlayerId,
            cardId: cardToPlay,
            chosenColor: card.type === 'wild' ? 'blue' : undefined,
          },
          rng
        );

        expect(nextState.topDiscardCard.id).toBe(cardToPlay);
      } else {
        // Draw card
        const { nextState } = engine.dispatch(
          {
            type: 'DRAW_CARD',
            playerId: currentPlayerId,
          },
          rng
        );
        expect(nextState.players.find((p) => p.id === currentPlayerId)?.hand.length).toBe(8);
      }
    });
  });
});
