import { describe, it, expect } from 'vitest';
import '../src/variants/no-mercy/no-mercy.adapter';
import { NoMercyFixtureBuilder } from '../src/variants/no-mercy/no-mercy.fixture';
import { assertValidNoMercyGameState } from '../src/variants/no-mercy/no-mercy.invariants';
import { GameState } from '../src/game/game.types';
import { Card } from '../src/cards/card.types';

/**
 * Deterministically swaps two physical cards by ID across any game zones
 * (draw pile, discard pile, or player hands) while strictly preserving total cards
 * and unique card identities.
 */
function swapTwoCardsInState(state: GameState, idA: string, idB: string): GameState {
  if (idA === idB) return state;

  type Location =
    | { type: 'draw'; index: number }
    | { type: 'discard'; index: number }
    | { type: 'hand'; playerIndex: number; cardIndex: number };

  const findLoc = (id: string): Location => {
    const dIdx = state.drawPile.findIndex((c) => c.id === id);
    if (dIdx !== -1) return { type: 'draw', index: dIdx };
    const discIdx = state.discardPile.findIndex((c) => c.id === id);
    if (discIdx !== -1) return { type: 'discard', index: discIdx };
    for (let p = 0; p < state.players.length; p++) {
      const hIdx = state.players[p].hand.findIndex((c) => c.id === id);
      if (hIdx !== -1) return { type: 'hand', playerIndex: p, cardIndex: hIdx };
    }
    throw new Error(`Card ${id} not found in state`);
  };

  const locA = findLoc(idA);
  const locB = findLoc(idB);

  const getCard = (loc: Location): Card => {
    if (loc.type === 'draw') return state.drawPile[loc.index];
    if (loc.type === 'discard') return state.discardPile[loc.index];
    return state.players[loc.playerIndex].hand[loc.cardIndex];
  };

  const cardA = getCard(locA);
  const cardB = getCard(locB);

  const nextDrawPile = [...state.drawPile];
  const nextDiscardPile = [...state.discardPile];
  const nextPlayers = state.players.map((p) => ({ ...p, hand: [...p.hand] }));

  const setCard = (loc: Location, card: Card) => {
    if (loc.type === 'draw') nextDrawPile[loc.index] = card;
    else if (loc.type === 'discard') nextDiscardPile[loc.index] = card;
    else nextPlayers[loc.playerIndex].hand[loc.cardIndex] = card;
  };

  setCard(locA, cardB);
  setCard(locB, cardA);

  return {
    ...state,
    drawPile: nextDrawPile,
    discardPile: nextDiscardPile,
    players: nextPlayers,
  };
}

describe('No Mercy Fixture Builder — swapCardIntoHand Fallback Regression Tests (Phase 6.1.3)', () => {
  describe('Path 1: Draw Pile Swap', () => {
    it('swaps a card from the draw pile into the target player hand when present in draw pile', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const p1InitialHand = [...state.players[0].hand];
      const p1EvictedCard = p1InitialHand[0];
      const targetCard = state.drawPile[0];
      const initialDrawPileLength = state.drawPile.length;

      // Ensure p1 does not already hold this exact physical card
      expect(p1InitialHand.some((c) => c.id === targetCard.id)).toBe(false);

      const { nextState, card: injectedCard } = NoMercyFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.id === targetCard.id
      );

      // Verify injected card is in target hand at index 0
      expect(injectedCard.id).toBe(targetCard.id);
      expect(nextState.players[0].hand[0].id).toBe(targetCard.id);

      // Verify evicted card replaces target card in draw pile at index 0
      expect(nextState.drawPile[0].id).toBe(p1EvictedCard.id);

      // Verify hand sizes and draw pile length remain unchanged
      expect(nextState.players[0].hand.length).toBe(p1InitialHand.length);
      expect(nextState.players[1].hand.length).toBe(state.players[1].hand.length);
      expect(nextState.drawPile.length).toBe(initialDrawPileLength);
      expect(nextState.discardPile.length).toBe(state.discardPile.length);

      // Strict 168-card conservation and unique IDs
      assertValidNoMercyGameState(nextState);
    });
  });

  describe('Path 2: Opponent Hand Swap (Requirement 2.A)', () => {
    it('swaps a card from an opponent hand into the target player hand when absent from draw pile', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      // Select a card from draw pile to deterministically place into Bob's hand
      const cardForBob = state.drawPile[0];
      const bobCardToEvict = state.players[1].hand[0];

      // Deterministically place cardForBob into Bob's hand and bobCardToEvict into draw pile
      const arrangedDrawPile = [bobCardToEvict, ...state.drawPile.slice(1)];
      const arrangedBobHand = [cardForBob, ...state.players[1].hand.slice(1)];

      const arrangedState: GameState = {
        ...state,
        drawPile: arrangedDrawPile,
        players: [
          state.players[0],
          { ...state.players[1], hand: arrangedBobHand },
        ],
      };
      assertValidNoMercyGameState(arrangedState);

      const p1InitialHand = [...arrangedState.players[0].hand];
      const p1EvictedCard = p1InitialHand[0];
      const p2InitialHand = [...arrangedState.players[1].hand];

      // Precondition checks:
      // 1. Target player (p1) does not hold cardForBob
      expect(p1InitialHand.some((c) => c.id === cardForBob.id)).toBe(false);
      // 2. Draw pile does not contain cardForBob
      expect(arrangedDrawPile.some((c) => c.id === cardForBob.id)).toBe(false);
      // 3. Opponent (p2) holds cardForBob
      expect(p2InitialHand.some((c) => c.id === cardForBob.id)).toBe(true);

      // Execute swap
      const { nextState, card: injectedCard } = NoMercyFixtureBuilder.swapCardIntoHand(
        arrangedState,
        'p1',
        (c) => c.id === cardForBob.id
      );

      // Assertions:
      // 1. Requested card enters target player's hand at index 0
      expect(injectedCard.id).toBe(cardForBob.id);
      expect(nextState.players[0].hand[0].id).toBe(cardForBob.id);

      // 2. Evicted target card moves to opponent's hand at index 0
      expect(nextState.players[1].hand[0].id).toBe(p1EvictedCard.id);
      expect(nextState.players[1].hand.some((c) => c.id === cardForBob.id)).toBe(false);

      // 3. Both hand sizes remain unchanged
      expect(nextState.players[0].hand.length).toBe(p1InitialHand.length);
      expect(nextState.players[1].hand.length).toBe(p2InitialHand.length);

      // 4. Draw pile and discard pile remain untouched
      expect(nextState.drawPile.length).toBe(arrangedDrawPile.length);
      expect(nextState.discardPile.length).toBe(arrangedState.discardPile.length);

      // 5. Strict 168-card conservation and unique card IDs
      assertValidNoMercyGameState(nextState);
    });

    it('selects the first matching opponent in player-array iteration order when multiple opponents hold competing matching cards (Phase 6.1.4)', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
          { id: 'p4', username: 'Dave' },
        ],
      });

      // In UNO Show 'em No Mercy, there are exactly 2 copies of 'skip_everyone' in blue:
      // 'nm_blue_skip_everyone_copy_1' and 'nm_blue_skip_everyone_copy_2'.
      // Both have identical value ('skip_everyone'), color ('blue'), and type ('action'), but unique physical IDs.
      const cardForBobId = 'nm_blue_skip_everyone_copy_1';
      const cardForCharlieId = 'nm_blue_skip_everyone_copy_2';

      // Deterministically arrange state:
      // Swap cardForBobId into Bob's hand (index 1) at slot 0
      const stateWithBob = swapTwoCardsInState(state, cardForBobId, state.players[1].hand[0].id);
      // Swap cardForCharlieId into Charlie's hand (index 2) at slot 0
      const arrangedState = swapTwoCardsInState(
        stateWithBob,
        cardForCharlieId,
        stateWithBob.players[2].hand[0].id
      );

      // Verify arranged state conforms to full 168-card invariants
      assertValidNoMercyGameState(arrangedState);

      const predicate = (c: Card) => c.value === 'skip_everyone' && c.color === 'blue';

      const cardForBob = arrangedState.players[1].hand[0];
      const cardForCharlie = arrangedState.players[2].hand[0];

      // Precondition Assertions:
      // 1. Both cards satisfy the predicate with different unique IDs but same value and color
      expect(predicate(cardForBob)).toBe(true);
      expect(predicate(cardForCharlie)).toBe(true);
      expect(cardForBob.id).toBe(cardForBobId);
      expect(cardForCharlie.id).toBe(cardForCharlieId);
      expect(cardForBob.id).not.toBe(cardForCharlieId);
      expect(cardForBob.value).toBe(cardForCharlie.value);
      expect(cardForBob.color).toBe(cardForCharlie.color);

      // 2. Target player Alice (p1, index 0) holds no cards matching the predicate
      expect(arrangedState.players[0].hand.some(predicate)).toBe(false);

      // 3. Draw pile holds no cards matching the predicate
      expect(arrangedState.drawPile.some(predicate)).toBe(false);

      // 4. Discard pile holds no cards matching the predicate
      expect(arrangedState.discardPile.some(predicate)).toBe(false);

      // 5. Dave (p4, index 3) holds no cards matching the predicate
      expect(arrangedState.players[3].hand.some(predicate)).toBe(false);

      // 6. At least two opponents (Bob at index 1 and Charlie at index 2) hold cards matching the predicate
      expect(arrangedState.players[1].hand.some(predicate)).toBe(true);
      expect(arrangedState.players[2].hand.some(predicate)).toBe(true);

      const aliceInitialHand = [...arrangedState.players[0].hand];
      const aliceEvictedCard = aliceInitialHand[0];
      const charlieInitialHandSnapshot = arrangedState.players[2].hand.map((c) => c.id);
      const daveInitialHandSnapshot = arrangedState.players[3].hand.map((c) => c.id);

      // Execute swap targeting Alice (p1)
      const { nextState, card: injectedCard } = NoMercyFixtureBuilder.swapCardIntoHand(
        arrangedState,
        'p1',
        predicate
      );

      // Core Verification Assertions:
      // 1. The helper selects the first matching opponent in documented player-array iteration order:
      //    Bob (index 1) is evaluated before Charlie (index 2), so Bob's card (cardForBobId) is selected.
      expect(injectedCard.id).toBe(cardForBobId);
      expect(nextState.players[0].hand[0].id).toBe(cardForBobId);

      // 2. The target player's evicted card moves to that selected opponent (Bob at index 1)
      expect(nextState.players[1].hand[0].id).toBe(aliceEvictedCard.id);
      expect(nextState.players[1].hand.some(predicate)).toBe(false);

      // 3. The later matching opponent (Charlie at index 2) remains completely unchanged, retaining cardForCharlieId
      expect(nextState.players[2].hand[0].id).toBe(cardForCharlieId);
      expect(nextState.players[2].hand.map((c) => c.id)).toEqual(charlieInitialHandSnapshot);

      // 4. Later non-matching opponent (Dave at index 3) also remains completely unchanged
      expect(nextState.players[3].hand.map((c) => c.id)).toEqual(daveInitialHandSnapshot);

      // 5. All hand sizes remain strictly unchanged (all 7 cards)
      expect(nextState.players[0].hand.length).toBe(7);
      expect(nextState.players[1].hand.length).toBe(7);
      expect(nextState.players[2].hand.length).toBe(7);
      expect(nextState.players[3].hand.length).toBe(7);

      // 6. Draw pile and discard pile remain untouched
      expect(nextState.drawPile.length).toBe(arrangedState.drawPile.length);
      expect(nextState.discardPile.length).toBe(arrangedState.discardPile.length);

      // 7. Strict 168 physical cards conservation and ID uniqueness
      assertValidNoMercyGameState(nextState);
    });

    it('iterates past non-matching opponents in player order to swap from a later opponent', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
          { id: 'p4', username: 'Dave' },
        ],
      });

      // Place target card in Dave (player index 3), while Bob (index 1) and Charlie (index 2) don't have it
      const targetCard = state.drawPile[0];
      const daveEvictedCard = state.players[3].hand[2];

      const arrangedDaveHand = state.players[3].hand.map((c, idx) =>
        idx === 2 ? targetCard : c
      );
      const arrangedDrawPile = [daveEvictedCard, ...state.drawPile.slice(1)];

      const arrangedState: GameState = {
        ...state,
        drawPile: arrangedDrawPile,
        players: state.players.map((p, idx) =>
          idx === 3 ? { ...p, hand: arrangedDaveHand } : p
        ),
      };
      assertValidNoMercyGameState(arrangedState);

      const p1InitialHand = [...arrangedState.players[0].hand];
      const p1EvictedCard = p1InitialHand[0];

      const { nextState, card } = NoMercyFixtureBuilder.swapCardIntoHand(
        arrangedState,
        'p1',
        (c) => c.id === targetCard.id
      );

      // Alice (p1) now holds targetCard
      expect(card.id).toBe(targetCard.id);
      expect(nextState.players[0].hand[0].id).toBe(targetCard.id);

      // Dave (p4) receives Alice's evicted card at index 2
      expect(nextState.players[3].hand[2].id).toBe(p1EvictedCard.id);

      // Bob (p2) and Charlie (p3) hands are completely untouched
      expect(nextState.players[1].hand.map((c) => c.id)).toEqual(
        arrangedState.players[1].hand.map((c) => c.id)
      );
      expect(nextState.players[2].hand.map((c) => c.id)).toEqual(
        arrangedState.players[2].hand.map((c) => c.id)
      );

      // All hand sizes preserved
      expect(nextState.players[0].hand.length).toBe(p1InitialHand.length);
      expect(nextState.players[3].hand.length).toBe(arrangedDaveHand.length);

      assertValidNoMercyGameState(nextState);
    });
  });

  describe('Path 3: Deep Discard Swap (Requirement 2.B)', () => {
    it('swaps a card from beneath the top discard into target player hand while keeping top discard unchanged', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      // Prepend 2 cards from draw pile to discard pile beneath the top discard
      const deepCard0 = state.drawPile[0];
      const deepCard1 = state.drawPile[1];
      const topDiscard = state.topDiscardCard;

      const arrangedDiscardPile = [deepCard0, deepCard1, ...state.discardPile];
      const arrangedDrawPile = state.drawPile.slice(2);

      const arrangedState: GameState = {
        ...state,
        drawPile: arrangedDrawPile,
        discardPile: arrangedDiscardPile,
        topDiscardCard: topDiscard,
      };
      assertValidNoMercyGameState(arrangedState);

      const p1InitialHand = [...arrangedState.players[0].hand];
      const p1EvictedCard = p1InitialHand[0];

      // Precondition checks:
      // 1. Target player does not hold deepCard1
      expect(p1InitialHand.some((c) => c.id === deepCard1.id)).toBe(false);
      // 2. Draw pile does not hold deepCard1
      expect(arrangedDrawPile.some((c) => c.id === deepCard1.id)).toBe(false);
      // 3. Opponent does not hold deepCard1
      expect(arrangedState.players[1].hand.some((c) => c.id === deepCard1.id)).toBe(false);
      // 4. deepCard1 is located strictly beneath the top discard at index 1
      expect(arrangedDiscardPile[1].id).toBe(deepCard1.id);
      expect(arrangedDiscardPile[arrangedDiscardPile.length - 1].id).toBe(topDiscard.id);

      // Execute swap
      const { nextState, card: injectedCard } = NoMercyFixtureBuilder.swapCardIntoHand(
        arrangedState,
        'p1',
        (c) => c.id === deepCard1.id
      );

      // Assertions:
      // 1. Requested card enters target player's hand at index 0
      expect(injectedCard.id).toBe(deepCard1.id);
      expect(nextState.players[0].hand[0].id).toBe(deepCard1.id);

      // 2. Evicted card replaces requested card at its previous discard position (index 1)
      expect(nextState.discardPile[1].id).toBe(p1EvictedCard.id);

      // 3. deepCard0 at index 0 remains unchanged
      expect(nextState.discardPile[0].id).toBe(deepCard0.id);

      // 4. Top discard card at the end of discardPile remains strictly unchanged
      expect(nextState.discardPile[nextState.discardPile.length - 1].id).toBe(topDiscard.id);
      expect(nextState.topDiscardCard.id).toBe(topDiscard.id);

      // 5. Hand sizes and pile sizes remain preserved
      expect(nextState.players[0].hand.length).toBe(p1InitialHand.length);
      expect(nextState.players[1].hand.length).toBe(arrangedState.players[1].hand.length);
      expect(nextState.discardPile.length).toBe(arrangedDiscardPile.length);
      expect(nextState.drawPile.length).toBe(arrangedDrawPile.length);

      // 6. Strict 168-card conservation and unique card IDs
      assertValidNoMercyGameState(nextState);
    });

    it('does not touch or swap the active top discard card even if it matches the predicate', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const topDiscard = state.topDiscardCard;

      // Ensure neither p1, p2, drawPile, nor deep discard has topDiscard (IDs are unique)
      // Attempting to swap topDiscard itself must throw because top discard is excluded from deep discard search
      expect(() =>
        NoMercyFixtureBuilder.swapCardIntoHand(state, 'p1', (c) => c.id === topDiscard.id)
      ).toThrow('No matching card found in existing game inventory to swap.');

      // State is completely unchanged
      expect(state.topDiscardCard.id).toBe(topDiscard.id);
      expect(state.discardPile[state.discardPile.length - 1].id).toBe(topDiscard.id);
    });
  });

  describe('Edge Cases & Failure Behavior (Requirement 2.C & Section 3 Review)', () => {
    it('returns the existing card without mutating state when target player already holds a matching card', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const alreadyHeldCard = state.players[0].hand[2];
      const initialHandSnapshot = state.players[0].hand.map((c) => c.id);

      const { nextState, card } = NoMercyFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.id === alreadyHeldCard.id
      );

      // Returns same state reference and matching card
      expect(card.id).toBe(alreadyHeldCard.id);
      expect(nextState).toBe(state);
      expect(nextState.players[0].hand.map((c) => c.id)).toEqual(initialHandSnapshot);
    });

    it('throws a clear error and preserves input state immutably when no card matches anywhere', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const stateSnapshot = JSON.stringify(state);

      expect(() =>
        NoMercyFixtureBuilder.swapCardIntoHand(state, 'p1', (c) => c.id === 'non_existent_card_999')
      ).toThrow('No matching card found in existing game inventory to swap.');

      // Original state was not mutated
      expect(JSON.stringify(state)).toBe(stateSnapshot);
    });

    it('throws an error and preserves input state immutably if targetPlayerId does not exist in state', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture();
      const stateSnapshot = JSON.stringify(state);

      expect(() =>
        NoMercyFixtureBuilder.swapCardIntoHand(state, 'unknown_player', () => true)
      ).toThrow('Player unknown_player not found in state.');

      // Original state was not mutated (byte-for-byte serialization equality)
      expect(JSON.stringify(state)).toBe(stateSnapshot);
    });

    it('throws an error and preserves input state immutably if target player has an empty hand', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture();
      const emptyHandState: GameState = {
        ...state,
        drawPile: [...state.drawPile, ...state.players[0].hand],
        players: state.players.map((p, idx) => (idx === 0 ? { ...p, hand: [] } : p)),
      };
      assertValidNoMercyGameState(emptyHandState);
      const stateSnapshot = JSON.stringify(emptyHandState);

      expect(() =>
        NoMercyFixtureBuilder.swapCardIntoHand(emptyHandState, 'p1', () => true)
      ).toThrow('Player p1 has no cards to swap.');

      // Original state was not mutated (byte-for-byte serialization equality)
      expect(JSON.stringify(emptyHandState)).toBe(stateSnapshot);
    });
  });
});
