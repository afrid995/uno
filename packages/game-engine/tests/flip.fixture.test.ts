import { describe, it, expect } from 'vitest';
import {
  FlipFixtureBuilder,
  assertValidFlipGameState,
  validateFlipGameStateInvariants,
  FlipDeckFactory,
  GameState,
  Card,
} from '../src';
import { FlipMoveValidator } from '../src/variants/flip/flip.validator';

describe('UNO Flip Fixture Builder & Invariant Validation (Phase 5.2)', () => {
  describe('Fixture Generation & Physical Card Conservation', () => {
    it('creates a valid 112-card fixture satisfying all invariants on LIGHT side', () => {
      const state = FlipFixtureBuilder.createInitialGameFixture({
        activeSide: 'LIGHT',
      });

      expect(state.variant).toBe('uno_flip');
      expect(state.activeSide).toBe('LIGHT');

      // Assert total physical card count
      const totalCards =
        state.players.reduce((sum, p) => sum + p.hand.length, 0) +
        state.drawPile.length +
        state.discardPile.length;
      expect(totalCards).toBe(112);

      // Must pass full invariant assertion without throwing
      expect(() => assertValidFlipGameState(state)).not.toThrow();
    });

    it('creates a valid 112-card fixture satisfying all invariants on DARK side', () => {
      const state = FlipFixtureBuilder.createInitialGameFixture({
        activeSide: 'DARK',
      });

      expect(state.variant).toBe('uno_flip');
      expect(state.activeSide).toBe('DARK');

      const totalCards =
        state.players.reduce((sum, p) => sum + p.hand.length, 0) +
        state.drawPile.length +
        state.discardPile.length;
      expect(totalCards).toBe(112);

      // Verify all cards expose DARK side representation
      for (const p of state.players) {
        for (const c of p.hand) {
          expect(c.currentSide).toBe('DARK');
          expect(c.color).toBe(c.darkFace.color);
        }
      }

      expect(() => assertValidFlipGameState(state)).not.toThrow();
    });

    it('verifies every physical card ID is unique across all zones', () => {
      const state = FlipFixtureBuilder.createInitialGameFixture();
      const allIds = [
        ...state.players.flatMap((p) => p.hand.map((c) => c.id)),
        ...state.drawPile.map((c) => c.id),
        ...state.discardPile.map((c) => c.id),
      ];

      expect(allIds).toHaveLength(112);
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(112);
    });
  });

  describe('Flip Card Injection (Fix B)', () => {
    it('injects a playable Flip card on LIGHT side, strictly conserving 112 cards', () => {
      const state = FlipFixtureBuilder.createInitialGameFixture({ activeSide: 'LIGHT' });
      const activePlayerId = state.players[state.currentPlayerIndex].id;
      const initialHandSize = state.players[state.currentPlayerIndex].hand.length;

      const { nextState, injectedCard } = FlipFixtureBuilder.injectPlayableFlipCard(
        state,
        activePlayerId
      );

      // 1. Injected card must be a Flip card
      expect(injectedCard.value).toBe('flip');

      // 2. Injected card must be at index 0 of active player's hand
      const activePlayer = nextState.players.find((p) => p.id === activePlayerId)!;
      expect(activePlayer.hand[0].id).toBe(injectedCard.id);

      // 3. Hand size must remain identical
      expect(activePlayer.hand).toHaveLength(initialHandSize);

      // 4. Injected card must be legally playable on top discard
      const matchingColor = nextState.activeColor ?? nextState.topDiscardCard.color;
      expect(
        injectedCard.color === matchingColor || nextState.topDiscardCard.value === 'flip'
      ).toBe(true);

      // 5. Invariant check: exactly 112 cards, unique IDs
      expect(() => assertValidFlipGameState(nextState)).not.toThrow();
    });

    it('injects a playable Flip card on DARK side, strictly conserving 112 cards', () => {
      const state = FlipFixtureBuilder.createInitialGameFixture({ activeSide: 'DARK' });
      const activePlayerId = state.players[state.currentPlayerIndex].id;

      const { nextState, injectedCard } = FlipFixtureBuilder.injectPlayableFlipCard(
        state,
        activePlayerId
      );

      expect(injectedCard.value).toBe('flip');
      expect(injectedCard.currentSide).toBe('DARK');

      const activePlayer = nextState.players.find((p) => p.id === activePlayerId)!;
      expect(activePlayer.hand[0].id).toBe(injectedCard.id);

      const matchingColor = nextState.activeColor ?? nextState.topDiscardCard.color;
      expect(
        injectedCard.color === matchingColor || nextState.topDiscardCard.value === 'flip'
      ).toBe(true);

      expect(() => assertValidFlipGameState(nextState)).not.toThrow();
    });

    it('preserves all existing discard cards when injecting Flip card', () => {
      const state = FlipFixtureBuilder.createInitialGameFixture();
      const initialDiscardIds = state.discardPile.map((c) => c.id);

      const { nextState } = FlipFixtureBuilder.injectPlayableFlipCard(state);

      // Every card from the original discard pile must still be present in the new discard pile
      for (const id of initialDiscardIds) {
        expect(nextState.discardPile.some((c) => c.id === id)).toBe(true);
      }
    });

    it('does not duplicate or lose any physical cards during Flip injection', () => {
      const state = FlipFixtureBuilder.createInitialGameFixture();
      const { nextState, injectedCard } = FlipFixtureBuilder.injectPlayableFlipCard(state);

      const allCards = [
        ...nextState.players.flatMap((p) => p.hand),
        ...nextState.drawPile,
        ...nextState.discardPile,
      ];

      expect(allCards).toHaveLength(112);

      const occurrences = allCards.filter((c) => c.id === injectedCard.id);
      expect(occurrences).toHaveLength(1);
    });
  });

  describe('Starting Wild Injection (Fix C)', () => {
    it('injects Starting Wild state, preserving all 112 cards and setting valid pending selection', () => {
      const state = FlipFixtureBuilder.createInitialGameFixture({ activeSide: 'LIGHT' });
      const { nextState, wildCard } = FlipFixtureBuilder.injectStartingWild(state);

      // 1. Top discard must be a Wild card on LIGHT side
      expect(nextState.topDiscardCard.value).toBe('wild');
      expect(nextState.topDiscardCard.id).toBe(wildCard.id);
      expect(nextState.activeSide).toBe('LIGHT');

      // 2. activeColor must be null while selection is pending
      expect(nextState.activeColor).toBeNull();

      // 3. pendingActionState must be AWAITING_STARTING_WILD_COLOR_SELECTION
      expect(nextState.pendingActionState).toEqual({
        type: 'AWAITING_STARTING_WILD_COLOR_SELECTION',
        designatedPlayerId: nextState.players[(nextState.dealerIndex + 1) % nextState.players.length].id,
      });

      // 4. Current player index must point to designated player (left of dealer)
      expect(nextState.currentPlayerIndex).toBe(
        (nextState.dealerIndex + 1) % nextState.players.length
      );

      // 5. Total 112 cards strictly conserved
      const totalCards =
        nextState.players.reduce((sum, p) => sum + p.hand.length, 0) +
        nextState.drawPile.length +
        nextState.discardPile.length;
      expect(totalCards).toBe(112);

      // 6. Every physical card ID unique
      const ids = new Set([
        ...nextState.players.flatMap((p) => p.hand.map((c) => c.id)),
        ...nextState.drawPile.map((c) => c.id),
        ...nextState.discardPile.map((c) => c.id),
      ]);
      expect(ids.size).toBe(112);

      // 7. Passes full invariant assertion
      expect(() => assertValidFlipGameState(nextState)).not.toThrow();
    });
  });

  describe('Starting Wild Resolution via Flip Card Injection (Phase 6.1.2 Audit)', () => {
    it('resolves starting Wild state when target player already holds a matching Flip card (Path 1)', () => {
      const baseState = FlipFixtureBuilder.createInitialGameFixture({ activeSide: 'LIGHT' });
      const { nextState: wildState } = FlipFixtureBuilder.injectStartingWild(baseState);

      // Verify prerequisite starting Wild state
      expect(wildState.pendingActionState?.type).toBe('AWAITING_STARTING_WILD_COLOR_SELECTION');
      expect(wildState.activeColor).toBeNull();
      expect(wildState.topDiscardCard.value).toBe('wild');

      const activePlayerId = wildState.players[wildState.currentPlayerIndex].id;
      const activePlayerIdx = wildState.currentPlayerIndex;

      // Ensure active player deterministically holds a Flip card in hand
      const targetPlayer = wildState.players[activePlayerIdx];
      let stateWithFlipInHand: GameState = wildState;
      let heldFlipCard = targetPlayer.hand.find((c) => c.value === 'flip');

      if (!heldFlipCard) {
        // Swap a Flip card from drawPile into player's hand at index 0
        const flipIdx = wildState.drawPile.findIndex((c) => c.value === 'flip');
        expect(flipIdx).toBeGreaterThanOrEqual(0);
        heldFlipCard = wildState.drawPile[flipIdx];
        const swapOut = targetPlayer.hand[0];

        const newDrawPile = [...wildState.drawPile];
        newDrawPile[flipIdx] = swapOut;

        const newPlayers = wildState.players.map((p, idx) =>
          idx === activePlayerIdx
            ? { ...p, hand: [heldFlipCard!, ...p.hand.slice(1)] }
            : p
        );

        stateWithFlipInHand = {
          ...wildState,
          drawPile: newDrawPile,
          players: newPlayers,
        };
      }

      assertValidFlipGameState(stateWithFlipInHand);

      // Inject playable Flip card when player already holds one
      const { nextState, injectedCard } = FlipFixtureBuilder.injectPlayableFlipCard(
        stateWithFlipInHand,
        activePlayerId
      );

      // 1. Injected card matches held Flip card
      expect(injectedCard.id).toBe(heldFlipCard!.id);
      expect(injectedCard.value).toBe('flip');

      // 2. activeColor is resolved to the Flip card's color
      expect(nextState.activeColor).toBe(injectedCard.color);
      expect(nextState.activeColor).not.toBeNull();

      // 3. Stale starting-Wild pending action is cleared
      expect(nextState.pendingActionState).toBeNull();

      // 4. Injected card is at index 0
      expect(nextState.players[activePlayerIdx].hand[0].id).toBe(injectedCard.id);

      // 5. Card conservation and invariant validity
      expect(() => assertValidFlipGameState(nextState)).not.toThrow();

      // 6. Flip card is legally playable immediately on top discard
      const validation = FlipMoveValidator.validate(nextState, {
        type: 'PLAY_CARD',
        playerId: activePlayerId,
        cardId: injectedCard.id,
      });
      expect(validation.valid).toBe(true);
    });

    it('resolves starting Wild state when a Flip card must be located and swapped into target hand (Path 2)', () => {
      const baseState = FlipFixtureBuilder.createInitialGameFixture({ activeSide: 'LIGHT' });
      const { nextState: wildState } = FlipFixtureBuilder.injectStartingWild(baseState);

      expect(wildState.pendingActionState?.type).toBe('AWAITING_STARTING_WILD_COLOR_SELECTION');
      expect(wildState.activeColor).toBeNull();

      const activePlayerId = wildState.players[wildState.currentPlayerIndex].id;
      const activePlayerIdx = wildState.currentPlayerIndex;
      const targetPlayer = wildState.players[activePlayerIdx];

      // Ensure target player holds NO Flip cards by swapping any held Flip cards into drawPile
      const newDrawPile = [...wildState.drawPile];
      const nonFlipDrawCards = newDrawPile.filter((c) => c.value !== 'flip');

      let currentHand = [...targetPlayer.hand];
      let drawSwapIdx = 0;
      for (let i = 0; i < currentHand.length; i++) {
        if (currentHand[i].value === 'flip') {
          const replacement = nonFlipDrawCards[drawSwapIdx++];
          const dpIdx = newDrawPile.findIndex((c) => c.id === replacement.id);
          newDrawPile[dpIdx] = currentHand[i];
          currentHand[i] = replacement;
        }
      }

      const stateWithoutFlipInHand: GameState = {
        ...wildState,
        drawPile: newDrawPile,
        players: wildState.players.map((p, idx) =>
          idx === activePlayerIdx ? { ...p, hand: currentHand } : p
        ),
      };
      assertValidFlipGameState(stateWithoutFlipInHand);
      expect(stateWithoutFlipInHand.players[activePlayerIdx].hand.some((c) => c.value === 'flip')).toBe(false);

      // Inject playable Flip card (must locate in inventory and swap)
      const { nextState, injectedCard } = FlipFixtureBuilder.injectPlayableFlipCard(
        stateWithoutFlipInHand,
        activePlayerId
      );

      // 1. Injected card is a Flip card
      expect(injectedCard.value).toBe('flip');

      // 2. activeColor is resolved to the Flip card's color
      expect(nextState.activeColor).toBe(injectedCard.color);
      expect(nextState.activeColor).not.toBeNull();

      // 3. Stale starting-Wild pending action is cleared
      expect(nextState.pendingActionState).toBeNull();

      // 4. Injected card is at index 0 of active player's hand
      expect(nextState.players[activePlayerIdx].hand[0].id).toBe(injectedCard.id);

      // 5. Hand size is preserved
      expect(nextState.players[activePlayerIdx].hand).toHaveLength(targetPlayer.hand.length);

      // 6. Card conservation and invariant validity
      expect(() => assertValidFlipGameState(nextState)).not.toThrow();

      // 7. Legally playable immediately on top discard
      const validation = FlipMoveValidator.validate(nextState, {
        type: 'PLAY_CARD',
        playerId: activePlayerId,
        cardId: injectedCard.id,
      });
      expect(validation.valid).toBe(true);
    });
  });

  describe('Invariant Assertion Error Detection', () => {
    it('detects card count mismatch when cards are lost or duplicated', () => {
      const state = FlipFixtureBuilder.createInitialGameFixture();

      // Corrupt state by dropping one card from drawPile (111 cards)
      const corruptedShortState: GameState = {
        ...state,
        drawPile: state.drawPile.slice(1),
      };
      const resShort = validateFlipGameStateInvariants(corruptedShortState);
      expect(resShort.valid).toBe(false);
      expect(resShort.errors.some((e) => e.includes('Card conservation violation'))).toBe(true);
      expect(() => assertValidFlipGameState(corruptedShortState)).toThrow();

      // Corrupt state by duplicating top discard in drawPile (113 cards)
      const corruptedLongState: GameState = {
        ...state,
        drawPile: [...state.drawPile, state.topDiscardCard],
      };
      const resLong = validateFlipGameStateInvariants(corruptedLongState);
      expect(resLong.valid).toBe(false);
      expect(resLong.errors.some((e) => e.includes('Duplicate physical card IDs'))).toBe(true);
      expect(() => assertValidFlipGameState(corruptedLongState)).toThrow();
    });

    it('detects mismatched active face representations', () => {
      const state = FlipFixtureBuilder.createInitialGameFixture({ activeSide: 'LIGHT' });

      // Corrupt one card in player 1's hand by presenting Dark face while activeSide is LIGHT
      const corruptCard: Card = {
        ...state.players[0].hand[0],
        color: state.players[0].hand[0].darkFace.color,
        value: state.players[0].hand[0].darkFace.value,
        currentSide: 'DARK',
      };

      const corruptedState: GameState = {
        ...state,
        players: [
          {
            ...state.players[0],
            hand: [corruptCard, ...state.players[0].hand.slice(1)],
          },
          ...state.players.slice(1),
        ],
      };

      const res = validateFlipGameStateInvariants(corruptedState);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('does not expose correct LIGHT face'))).toBe(true);
      expect(() => assertValidFlipGameState(corruptedState)).toThrow();
    });

    it('detects top discard and discard pile discrepancies', () => {
      const state = FlipFixtureBuilder.createInitialGameFixture();

      // Swap topDiscardCard with a different card guaranteed not to match discardPile[last]
      const canonicalDeck = FlipDeckFactory.createFlipDeck();
      const differentCard = canonicalDeck.find((c) => c.id !== state.topDiscardCard.id)!;
      const fakeTop = FlipDeckFactory.flipCard(differentCard, state.activeSide ?? 'LIGHT');

      const corruptedState: GameState = {
        ...state,
        topDiscardCard: fakeTop,
      };

      const res = validateFlipGameStateInvariants(corruptedState);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('topDiscardCard ID'))).toBe(true);
      expect(() => assertValidFlipGameState(corruptedState)).toThrow();
    });

    it('detects invalid starting Wild state configurations', () => {
      const state = FlipFixtureBuilder.createInitialGameFixture({ activeSide: 'LIGHT' });
      const { nextState } = FlipFixtureBuilder.injectStartingWild(state);

      // 1. activeColor not null while awaiting color
      const badColorState: GameState = {
        ...nextState,
        activeColor: 'blue',
      };
      expect(validateFlipGameStateInvariants(badColorState).valid).toBe(false);

      // 2. designated player is not player to dealer left
      const badChooserState: GameState = {
        ...nextState,
        pendingActionState: {
          type: 'AWAITING_STARTING_WILD_COLOR_SELECTION',
          designatedPlayerId: 'wrong_player_id',
        },
      };
      expect(validateFlipGameStateInvariants(badChooserState).valid).toBe(false);
    });
  });
});
