import { describe, it, expect } from 'vitest';
import '../src/variants/all-wild/all-wild.adapter';
import { VariantRegistry } from '../src/variants/variant.types';
import { assertValidAllWildGameState } from '../src/variants/all-wild/all-wild.invariants';
import { AllWildFixtureBuilder } from '../src/variants/all-wild/all-wild.fixture';
import { ALL_WILD_RULES, ALL_WILD_CARD_POINTS } from '../src/variants/all-wild/all-wild.constants';
import { Card } from '../src/cards/card.types';

describe('UNO All Wild — Official Rules & Mechanics (Mattel HHL33)', () => {
  const adapter = VariantRegistry.get('uno_all_wild');

  describe('1. Setup, Player Counts & Initial State', () => {
    it('enforces 2 to 10 players limits', () => {
      expect(() => {
        adapter.createGame({
          roomId: 'r1',
          players: [{ id: 'p1', username: 'P1' }],
          variant: 'uno_all_wild',
        });
      }).toThrow(/Invalid player count 1/);

      expect(() => {
        adapter.createGame({
          roomId: 'r1',
          players: Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, username: `P${i}` })),
          variant: 'uno_all_wild',
        });
      }).toThrow(/Invalid player count 11/);

      const state = adapter.createGame({
        roomId: 'r1',
        players: [
          { id: 'p1', username: 'P1' },
          { id: 'p2', username: 'P2' },
          { id: 'p3', username: 'P3' },
        ],
        variant: 'uno_all_wild',
      });
      expect(state.players).toHaveLength(3);
      assertValidAllWildGameState(state);
    });

    it('deals 7 cards to each player and starts with 1 card on the discard pile', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'P1' },
          { id: 'p2', username: 'P2' },
          { id: 'p3', username: 'P3' },
        ],
        dealerIndex: 2,
      });

      for (const player of state.players) {
        expect(player.hand).toHaveLength(7);
      }
      expect(state.discardPile).toHaveLength(1);
      // Total cards = 7 * 3 + 1 + drawPile = 112
      expect(state.drawPile.length).toBe(112 - 21 - 1);
      assertValidAllWildGameState(state);
    });

    it('ignores the action of the first card turned over from the draw pile', () => {
      // Regardless of what card is turned face up, the action is ignored and player takes regular first turn.
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'P1' },
          { id: 'p2', username: 'P2' },
        ],
        dealerIndex: 1, // Player 0 starts
      });

      expect(state.currentPlayerIndex).toBe(0);
      expect(state.turnDirection).toBe('clockwise');
      expect(state.pendingActionState).toBeNull();
    });

    it('preserves exact 112 physical cards invariant throughout game creation', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture();
      assertValidAllWildGameState(state);
    });
  });

  describe('2. General Play Validity', () => {
    it('allows playing any card without color or number matching restrictions', () => {
      const baseState = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1, // p1 starts
      });

      const { nextState: s1, card: c1 } = AllWildFixtureBuilder.injectPlayableCard(baseState, 'p1', 'wild');
      expect(adapter.validateMove(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: c1.id }).valid).toBe(true);

      const { nextState: s2, card: c2 } = AllWildFixtureBuilder.injectPlayableCard(baseState, 'p1', 'wild_reverse');
      expect(adapter.validateMove(s2, { type: 'PLAY_CARD', playerId: 'p1', cardId: c2.id }).valid).toBe(true);

      const { nextState: s3, card: c3 } = AllWildFixtureBuilder.injectPlayableCard(baseState, 'p1', 'wild_draw_four');
      expect(adapter.validateMove(s3, { type: 'PLAY_CARD', playerId: 'p1', cardId: c3.id }).valid).toBe(true);
    });

    it('rejects playing a card that is not in the player hand', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1,
      });
      const result = adapter.validateMove(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: 'non_existent_card_id',
      });
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/not in/i);
    });

    it('rejects play from a player out of turn', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1, // p1 starts (index 0)
      });
      const p2Card = state.players[1].hand[0];
      const result = adapter.validateMove(state, {
        type: 'PLAY_CARD',
        playerId: 'p2',
        cardId: p2Card.id,
      });
      expect(result.valid).toBe(false);
      expect(result.message).toMatch(/not (your|player's) turn/i);
    });
  });

  describe('3. Standard Wild & Basic Action Cards', () => {
    it('Standard Wild advances turn to next player naturally', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }, { id: 'p3', username: 'P3' }],
        dealerIndex: 2, // p1 starts (index 0)
      });
      const { nextState: s1, card: w1 } = AllWildFixtureBuilder.injectPlayableCard(state, 'p1', 'wild');

      const { nextState: next } = adapter.processAction(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: w1.id });
      expect(next.currentPlayerIndex).toBe(1);
      expect(next.topDiscardCard.id).toBe(w1.id);
      assertValidAllWildGameState(next);
    });

    it('Wild Reverse reverses direction in 3+ player games', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }, { id: 'p3', username: 'P3' }],
        dealerIndex: 2, // p1 starts (index 0)
      });
      const { nextState: s1, card: rev1 } = AllWildFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_reverse');

      const { nextState: next } = adapter.processAction(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: rev1.id });
      expect(next.turnDirection).toBe('counter_clockwise');
      expect(next.currentPlayerIndex).toBe(2); // In counter_clockwise from 0, next is index 2
      assertValidAllWildGameState(next);
    });

    it('Wild Reverse acts as a Skip in 2-player games (turn returns to active player)', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1, // p1 starts (index 0)
      });
      const { nextState: s1, card: rev1 } = AllWildFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_reverse');

      const { nextState: next } = adapter.processAction(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: rev1.id });
      expect(next.currentPlayerIndex).toBe(0); // active player gets another turn
      assertValidAllWildGameState(next);
    });

    it('Wild Skip skips the next player in 3+ player games', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }, { id: 'p3', username: 'P3' }],
        dealerIndex: 2, // p1 starts (index 0)
      });
      const { nextState: s1, card: sk1 } = AllWildFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_skip');

      const { nextState: next } = adapter.processAction(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: sk1.id });
      expect(next.currentPlayerIndex).toBe(2); // p2 skipped, turn goes to p3
      assertValidAllWildGameState(next);
    });

    it('Wild Skip skips the opponent in 2-player games (turn returns to active player)', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1, // p1 starts (index 0)
      });
      const { nextState: s1, card: sk1 } = AllWildFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_skip');

      const { nextState: next } = adapter.processAction(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: sk1.id });
      expect(next.currentPlayerIndex).toBe(0); // opponent skipped, p1 gets another turn
      assertValidAllWildGameState(next);
    });

    it('Wild Skip Two skips next 2 players in 4+ player games', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'P1' },
          { id: 'p2', username: 'P2' },
          { id: 'p3', username: 'P3' },
          { id: 'p4', username: 'P4' },
        ],
        dealerIndex: 3, // p1 starts (index 0)
      });
      const { nextState: s1, card: sk2 } = AllWildFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_skip_two');

      const { nextState: next } = adapter.processAction(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: sk2.id });
      expect(next.currentPlayerIndex).toBe(3); // p2 and p3 skipped, turn goes to p4
      assertValidAllWildGameState(next);
    });

    it('Wild Skip Two skips next 2 players in 3-player games (returns to active player)', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }, { id: 'p3', username: 'P3' }],
        dealerIndex: 2, // p1 starts (index 0)
      });
      const { nextState: s1, card: sk2 } = AllWildFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_skip_two');

      const { nextState: next } = adapter.processAction(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: sk2.id });
      expect(next.currentPlayerIndex).toBe(0); // 2 players skipped in 3p = returns to p1
      assertValidAllWildGameState(next);
    });

    it('Wild Skip Two in 2-player games returns turn to active player', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1, // p1 starts (index 0)
      });
      const { nextState: s1, card: sk2 } = AllWildFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_skip_two');

      const { nextState: next } = adapter.processAction(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: sk2.id });
      expect(next.currentPlayerIndex).toBe(0); // opponent skipped, p1 goes again
      assertValidAllWildGameState(next);
    });

    it('Wild Draw Two forces next player to draw 2 cards and skips them', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }, { id: 'p3', username: 'P3' }],
        dealerIndex: 2, // p1 starts (index 0)
      });
      const { nextState: s1, card: d2 } = AllWildFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_draw_two');
      const p2InitialHandCount = s1.players[1].hand.length;

      const { nextState: next } = adapter.processAction(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d2.id });
      // p2 should have drawn 2 cards
      expect(next.players[1].hand).toHaveLength(p2InitialHandCount + 2);
      // p2 was skipped, so turn is at p3 (index 2)
      expect(next.currentPlayerIndex).toBe(2);
      assertValidAllWildGameState(next);
    });

    it('Wild Draw Four forces next player to draw 4 cards and skips them', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }, { id: 'p3', username: 'P3' }],
        dealerIndex: 2, // p1 starts (index 0)
      });
      const { nextState: s1, card: d4 } = AllWildFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_draw_four');
      const p2InitialHandCount = s1.players[1].hand.length;

      const { nextState: next } = adapter.processAction(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d4.id });
      expect(next.players[1].hand).toHaveLength(p2InitialHandCount + 4);
      expect(next.currentPlayerIndex).toBe(2);
      assertValidAllWildGameState(next);
    });
  });

  describe('4. Targeted Draw Two & Forced Swap Action Cards', () => {
    it('Wild Targeted Draw Two enters pendingActionState, forces chosen opponent to draw 2, and advances turn naturally', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }, { id: 'p3', username: 'P3' }],
        dealerIndex: 2, // p1 starts (index 0)
      });
      const { nextState: s1, card: td2 } = AllWildFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_targeted_draw_two');
      const p3InitialHandCount = s1.players[2].hand.length;
      const p2InitialHandCount = s1.players[1].hand.length;

      // Play Wild Targeted Draw Two
      const { nextState: intermediate } = adapter.processAction(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: td2.id });
      expect(intermediate.pendingActionState).toEqual({
        type: 'AWAITING_TARGETED_DRAW_TWO_SELECTION',
        sourcePlayerId: 'p1',
      });
      // Turn stays with p1 while choosing target
      expect(intermediate.currentPlayerIndex).toBe(0);

      // Validate move: cannot target self
      const invalidSelf = adapter.validateMove(intermediate, {
        type: 'CHOOSE_TARGETED_DRAW_TWO_TARGET',
        playerId: 'p1',
        targetPlayerId: 'p1',
      });
      expect(invalidSelf.valid).toBe(false);
      expect(invalidSelf.message).toMatch(/cannot target yourself/i);

      // Validate move: other players cannot submit target selection
      const invalidOther = adapter.validateMove(intermediate, {
        type: 'CHOOSE_TARGETED_DRAW_TWO_TARGET',
        playerId: 'p2',
        targetPlayerId: 'p3',
      });
      expect(invalidOther.valid).toBe(false);

      // Choose p3 as target
      const { nextState: resolved } = adapter.processAction(intermediate, {
        type: 'CHOOSE_TARGETED_DRAW_TWO_TARGET',
        playerId: 'p1',
        targetPlayerId: 'p3',
      });

      // p3 received 2 cards
      expect(resolved.players[2].hand).toHaveLength(p3InitialHandCount + 2);
      // p2 was unaffected
      expect(resolved.players[1].hand).toHaveLength(p2InitialHandCount);
      // pendingActionState cleared
      expect(resolved.pendingActionState).toBeNull();
      // Turn naturally advanced clockwise to p2 (index 1)
      expect(resolved.currentPlayerIndex).toBe(1);
      assertValidAllWildGameState(resolved);
    });

    it('Wild Forced Swap enters pendingActionState, swaps hands with chosen opponent, and advances turn naturally', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }, { id: 'p3', username: 'P3' }],
        dealerIndex: 2, // p1 starts (index 0)
      });

      // Adjust p1 hand to 2 cards, p2 hand to 5 cards first
      const s1 = AllWildFixtureBuilder.setHandSize(state, 'p1', 2);
      const s2 = AllWildFixtureBuilder.setHandSize(s1, 'p2', 5);

      // Inject wild_forced_swap into p1's hand
      const { nextState: s3, card: swap1 } = AllWildFixtureBuilder.injectPlayableCard(s2, 'p1', 'wild_forced_swap');

      const p1CardsBefore = s3.players[0].hand.map((c) => c.id);
      const p2CardsBefore = s3.players[1].hand.map((c) => c.id);

      // Play Wild Forced Swap (swap1 will be discarded, leaving p1 with 1 card)
      const { nextState: intermediate } = adapter.processAction(s3, { type: 'PLAY_CARD', playerId: 'p1', cardId: swap1.id });
      expect(intermediate.pendingActionState).toEqual({
        type: 'AWAITING_FORCED_SWAP_SELECTION',
        sourcePlayerId: 'p1',
      });

      // Validate move: cannot swap with self
      const invalidSelf = adapter.validateMove(intermediate, {
        type: 'CHOOSE_FORCED_SWAP_TARGET',
        playerId: 'p1',
        targetPlayerId: 'p1',
      });
      expect(invalidSelf.valid).toBe(false);

      // Choose p2 as swap target
      const { nextState: resolved } = adapter.processAction(intermediate, {
        type: 'CHOOSE_FORCED_SWAP_TARGET',
        playerId: 'p1',
        targetPlayerId: 'p2',
      });

      // P1 now has p2's previous hand (5 cards)
      expect(resolved.players[0].hand).toHaveLength(5);
      expect(resolved.players[0].hand.map((c) => c.id)).toEqual(p2CardsBefore);

      // P2 now has p1's remaining hand (1 card)
      expect(resolved.players[1].hand).toHaveLength(1);
      const remainingP1CardId = p1CardsBefore.find((id) => id !== swap1.id);
      expect(resolved.players[1].hand[0].id).toBe(remainingP1CardId);

      // Turn advances to next player clockwise (p2 at index 1)
      expect(resolved.currentPlayerIndex).toBe(1);
      expect(resolved.pendingActionState).toBeNull();
      assertValidAllWildGameState(resolved);
    });
  });

  describe('5. Draw Decision Rules & Restrictions', () => {
    it('allows a player to choose to draw even when they have playable cards in hand', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1, // p1 starts
      });

      const validation = adapter.validateMove(state, { type: 'DRAW_CARD', playerId: 'p1' });
      expect(validation.valid).toBe(true);

      const { nextState: next } = adapter.processAction(state, { type: 'DRAW_CARD', playerId: 'p1' });
      expect(next.players[0].hand).toHaveLength(8);
      expect(next.players[0].hasDrawnThisTurn).toBe(true);
      expect(next.players[0].drawnCardId).toBeDefined();
      // Turn does not advance yet (player can play drawn card or pass)
      expect(next.currentPlayerIndex).toBe(0);
      assertValidAllWildGameState(next);
    });

    it('allows immediately playing the newly drawn card', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1, // p1 starts
      });

      const { nextState: drawnState } = adapter.processAction(state, { type: 'DRAW_CARD', playerId: 'p1' });
      const drawnCardId = drawnState.players[0].drawnCardId!;

      const playValidation = adapter.validateMove(drawnState, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: drawnCardId,
      });
      expect(playValidation.valid).toBe(true);

      const { nextState: afterPlay } = adapter.processAction(drawnState, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: drawnCardId,
      });
      expect(afterPlay.topDiscardCard.id).toBe(drawnCardId);
      assertValidAllWildGameState(afterPlay);
    });

    it('strictly rejects playing any pre-existing hand card after drawing', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1, // p1 starts
      });

      const existingCard = state.players[0].hand[0];
      const { nextState: drawnState } = adapter.processAction(state, { type: 'DRAW_CARD', playerId: 'p1' });

      const invalidPlay = adapter.validateMove(drawnState, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: existingCard.id,
      });
      expect(invalidPlay.valid).toBe(false);
      expect(invalidPlay.message).toMatch(/after drawing, you may only play the newly drawn card/i);
    });

    it('allows player to pass after drawing, advancing turn to next player', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1, // p1 starts
      });

      const { nextState: drawnState } = adapter.processAction(state, { type: 'DRAW_CARD', playerId: 'p1' });
      const passValidation = adapter.validateMove(drawnState, { type: 'PASS_TURN', playerId: 'p1' });
      expect(passValidation.valid).toBe(true);

      const { nextState: passedState } = adapter.processAction(drawnState, { type: 'PASS_TURN', playerId: 'p1' });
      expect(passedState.currentPlayerIndex).toBe(1);
      expect(passedState.players[0].hasDrawnThisTurn).toBe(false);
      expect(passedState.players[0].drawnCardId).toBeNull();
      assertValidAllWildGameState(passedState);
    });

    it('rejects PASS_TURN if player has not drawn yet', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1,
      });

      const passValidation = adapter.validateMove(state, { type: 'PASS_TURN', playerId: 'p1' });
      expect(passValidation.valid).toBe(false);
      expect(passValidation.message).toMatch(/cannot pass without drawing/i);
    });
  });

  describe('6. UNO Obligation & Challenge (Catching)', () => {
    it('applies 2-card penalty when challenged if player did not call UNO upon playing second-to-last card', () => {
      const base = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }, { id: 'p3', username: 'P3' }],
        dealerIndex: 2, // p1 starts (index 0)
      });
      // P1 holds 2 cards
      const s1 = AllWildFixtureBuilder.setHandSize(base, 'p1', 2);
      const { nextState: s2, card: cardToPlay } = AllWildFixtureBuilder.injectPlayableCard(s1, 'p1', 'wild');

      // p1 plays card without calling UNO -> hand size becomes 1
      const { nextState: afterPlay } = adapter.processAction(s2, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: cardToPlay.id,
      });
      expect(afterPlay.players[0].hand).toHaveLength(1);
      expect(afterPlay.players[0].hasDeclaredUno).toBe(false);
      expect(afterPlay.unoVulnerablePlayerId).toBe('p1');

      // p2 catches p1
      const challengeValidation = adapter.validateMove(afterPlay, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p2',
        targetPlayerId: 'p1',
      });
      expect(challengeValidation.valid).toBe(true);

      const { nextState: afterCatch } = adapter.processAction(afterPlay, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p2',
        targetPlayerId: 'p1',
      });
      // p1 penalized 2 cards (hand size now 3)
      expect(afterCatch.players[0].hand).toHaveLength(3);
      expect(afterCatch.unoVulnerablePlayerId).toBeNull();
      assertValidAllWildGameState(afterCatch);
    });

    it('rejects challenge if player successfully called UNO', () => {
      const base = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }, { id: 'p3', username: 'P3' }],
        dealerIndex: 2, // p1 starts
      });
      const s1 = AllWildFixtureBuilder.setHandSize(base, 'p1', 2);
      const { nextState: s2, card: cardToPlay } = AllWildFixtureBuilder.injectPlayableCard(s1, 'p1', 'wild');

      // p1 calls UNO first
      const { nextState: unoState } = adapter.processAction(s2, { type: 'CALL_UNO', playerId: 'p1' });
      expect(unoState.players[0].hasDeclaredUno).toBe(true);

      // p1 plays card
      const { nextState: afterPlay } = adapter.processAction(unoState, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: cardToPlay.id,
      });
      expect(afterPlay.players[0].hand).toHaveLength(1);
      expect(afterPlay.unoVulnerablePlayerId).toBeNull();

      // p2 tries to challenge p1
      const challengeValidation = adapter.validateMove(afterPlay, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p2',
        targetPlayerId: 'p1',
      });
      expect(challengeValidation.valid).toBe(false);
      expect(challengeValidation.message).toMatch(/not vulnerable/i);
    });

    it('cannot catch player after the next player has already played a card', () => {
      const base = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }, { id: 'p3', username: 'P3' }],
        dealerIndex: 2, // p1 starts
      });
      const s1 = AllWildFixtureBuilder.setHandSize(base, 'p1', 2);
      const { nextState: s2, card: p1Card } = AllWildFixtureBuilder.injectPlayableCard(s1, 'p1', 'wild');

      // p1 plays down to 1 without calling UNO
      const { nextState: state1 } = adapter.processAction(s2, { type: 'PLAY_CARD', playerId: 'p1', cardId: p1Card.id });
      // p2 takes their turn and plays standard wild
      const { nextState: state1WithWild, card: p2Card } = AllWildFixtureBuilder.injectPlayableCard(state1, 'p2', 'wild');
      const { nextState: state2 } = adapter.processAction(state1WithWild, { type: 'PLAY_CARD', playerId: 'p2', cardId: p2Card.id });

      // Turn is at p3. p3 attempts to catch p1
      const challengeValidation = adapter.validateMove(state2, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p3',
        targetPlayerId: 'p1',
      });
      expect(challengeValidation.valid).toBe(false);
    });
  });

  describe('7. Winning & Optional Scoring', () => {
    it('ends the game with winner set when a player plays their last card', () => {
      const base = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1, // p1 starts
      });
      // P1 has 1 card left
      const s1 = AllWildFixtureBuilder.setHandSize(base, 'p1', 1);
      const lastCard = s1.players[0].hand[0];

      const { nextState: next } = adapter.processAction(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: lastCard.id,
      });

      expect(['ROUND_OVER', 'COMPLETED']).toContain(next.status);
      expect(next.roundWinner?.id).toBe('p1');
      assertValidAllWildGameState(next);
    });

    it('calculates optional scoring accurately (20 for standard, 50 for action cards)', () => {
      // p1 wins; p2 holds 1 standard wild (20) and 1 wild reverse (50) -> 70 pts
      // p3 holds 1 wild draw four (50) and 1 wild forced swap (50) -> 100 pts
      // Total points for p1 = 170 pts
      const remainingOpponentCards: Card[] = [
        { id: 'c1', color: 'wild', value: 'wild', type: 'wild' },
        { id: 'c2', color: 'wild', value: 'wild_reverse', type: 'wild' },
        { id: 'c3', color: 'wild', value: 'wild_draw_four', type: 'wild' },
        { id: 'c4', color: 'wild', value: 'wild_forced_swap', type: 'wild' },
      ];

      const score = remainingOpponentCards.reduce((sum, card) => {
        return sum + (ALL_WILD_CARD_POINTS[card.value] || 0);
      }, 0);

      expect(score).toBe(20 + 50 + 50 + 50);
      expect(score).toBe(170);
    });
  });

  describe('8. Discard Recycling & Card Conservation Invariant', () => {
    it('recycles discard pile when draw pile is exhausted, preserving all 112 cards', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1, // p1 starts
      });

      // Force draw pile to have only 1 card, rest in discard pile
      const oneCardDraw = [state.drawPile[0]];
      const restDiscard = [...state.drawPile.slice(1), ...state.discardPile];

      const lowDrawState = {
        ...state,
        drawPile: oneCardDraw,
        discardPile: restDiscard,
        topDiscardCard: restDiscard[restDiscard.length - 1],
      };
      assertValidAllWildGameState(lowDrawState);

      // P1 draws 1 card (empties draw pile)
      const { nextState: afterDraw1 } = adapter.processAction(lowDrawState, { type: 'DRAW_CARD', playerId: 'p1' });
      expect(afterDraw1.drawPile).toHaveLength(0);

      // P1 passes
      const { nextState: afterPass } = adapter.processAction(afterDraw1, { type: 'PASS_TURN', playerId: 'p1' });

      // P2 now draws when draw pile is empty -> triggers recycling of discard pile
      const { nextState: afterDraw2 } = adapter.processAction(afterPass, { type: 'DRAW_CARD', playerId: 'p2' });
      expect(afterDraw2.drawPile.length).toBeGreaterThan(0);
      expect(afterDraw2.discardPile).toHaveLength(1);
      expect(afterDraw2.discardPile[0].id).toBe(afterDraw2.topDiscardCard.id);
      assertValidAllWildGameState(afterDraw2);
    });
  });
});
