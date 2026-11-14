import { describe, it, expect } from 'vitest';
import { VariantRegistry } from '../src/variants/variant.types';
import { AllWildFixtureBuilder } from '../src/variants/all-wild/all-wild.fixture';
import { assertValidAllWildGameState } from '../src/variants/all-wild/all-wild.invariants';
import { ALL_WILD_CARD_POINTS } from '../src/variants/all-wild/all-wild.constants';
import '../src/index';

describe('UNO All Wild — Final-Card Action Resolution Audit & Regression Suite (Mattel HHL33)', () => {
  const adapter = VariantRegistry.get('uno_all_wild');

  describe('1. Final Standard Wild', () => {
    it('plays Standard Wild as final card, ending round immediately and scoring opponents hands', () => {
      const base = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1, // p1 starts
      });
      const s1 = AllWildFixtureBuilder.setHandSize(base, 'p1', 1);
      const { nextState: sWithWild, card } = AllWildFixtureBuilder.injectPlayableCard(
        s1,
        'p1',
        'wild'
      );

      const p2Cards = sWithWild.players[1].hand;
      const expectedScore = p2Cards.reduce((acc, c) => acc + (ALL_WILD_CARD_POINTS[c.value] || 20), 0);

      const { nextState: next, events } = adapter.processAction(sWithWild, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: card.id,
      });

      expect(['ROUND_OVER', 'COMPLETED']).toContain(next.status);
      expect(next.roundWinner?.id).toBe('p1');
      expect(next.roundWinner?.roundScore).toBe(expectedScore);
      expect(next.players[0].hand).toHaveLength(0);
      expect(events.some((e) => e.type === 'CARD_PLAYED')).toBe(true);
      expect(events.some((e) => e.type === 'ROUND_WON')).toBe(true);
      assertValidAllWildGameState(next);
    });
  });

  describe('2. Final Wild Reverse', () => {
    it('in 3-player game, reverses direction and ends round with winner set', () => {
      const base = AllWildFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'P1' },
          { id: 'p2', username: 'P2' },
          { id: 'p3', username: 'P3' },
        ],
        dealerIndex: 2, // p1 starts
      });
      const s1 = AllWildFixtureBuilder.setHandSize(base, 'p1', 1);
      const { nextState: sWithRev, card } = AllWildFixtureBuilder.injectPlayableCard(
        s1,
        'p1',
        'wild_reverse'
      );

      const { nextState: next, events } = adapter.processAction(sWithRev, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: card.id,
      });

      expect(['ROUND_OVER', 'COMPLETED']).toContain(next.status);
      expect(next.roundWinner?.id).toBe('p1');
      expect(next.turnDirection).toBe('counter_clockwise');
      expect(events.some((e) => e.type === 'DIRECTION_REVERSED')).toBe(true);
      expect(events.some((e) => e.type === 'ROUND_WON')).toBe(true);
      assertValidAllWildGameState(next);
    });

    it('in 2-player game, executes reverse effect and ends round with winner set', () => {
      const base = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1, // p1 starts
      });
      const s1 = AllWildFixtureBuilder.setHandSize(base, 'p1', 1);
      const { nextState: sWithRev, card } = AllWildFixtureBuilder.injectPlayableCard(
        s1,
        'p1',
        'wild_reverse'
      );

      const { nextState: next, events } = adapter.processAction(sWithRev, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: card.id,
      });

      expect(['ROUND_OVER', 'COMPLETED']).toContain(next.status);
      expect(next.roundWinner?.id).toBe('p1');
      expect(events.some((e) => e.type === 'DIRECTION_REVERSED')).toBe(true);
      assertValidAllWildGameState(next);
    });
  });

  describe('3. Final Wild Skip', () => {
    it('executes skip event and ends round with winner set', () => {
      const base = AllWildFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'P1' },
          { id: 'p2', username: 'P2' },
          { id: 'p3', username: 'P3' },
        ],
        dealerIndex: 2, // p1 starts
      });
      const s1 = AllWildFixtureBuilder.setHandSize(base, 'p1', 1);
      const { nextState: sWithSkip, card } = AllWildFixtureBuilder.injectPlayableCard(
        s1,
        'p1',
        'wild_skip'
      );

      const { nextState: next, events } = adapter.processAction(sWithSkip, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: card.id,
      });

      expect(['ROUND_OVER', 'COMPLETED']).toContain(next.status);
      expect(next.roundWinner?.id).toBe('p1');
      expect(events.some((e) => e.type === 'PLAYER_SKIPPED')).toBe(true);
      assertValidAllWildGameState(next);
    });
  });

  describe('4. Final Wild Skip Two', () => {
    it('in 4-player game, executes two-player skip event and ends round with winner set', () => {
      const base = AllWildFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'P1' },
          { id: 'p2', username: 'P2' },
          { id: 'p3', username: 'P3' },
          { id: 'p4', username: 'P4' },
        ],
        dealerIndex: 3, // p1 starts
      });
      const s1 = AllWildFixtureBuilder.setHandSize(base, 'p1', 1);
      const { nextState: sWithSkip2, card } = AllWildFixtureBuilder.injectPlayableCard(
        s1,
        'p1',
        'wild_skip_two'
      );

      const { nextState: next, events } = adapter.processAction(sWithSkip2, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: card.id,
      });

      expect(['ROUND_OVER', 'COMPLETED']).toContain(next.status);
      expect(next.roundWinner?.id).toBe('p1');
      expect(events.some((e) => e.type === 'TWO_PLAYERS_SKIPPED')).toBe(true);
      assertValidAllWildGameState(next);
    });
  });

  describe('5. Final Wild Draw Two', () => {
    it('forces next player to draw 2 cards and includes those cards in winner round score', () => {
      const base = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1, // p1 starts
      });
      const s1 = AllWildFixtureBuilder.setHandSize(base, 'p1', 1);
      const s2 = AllWildFixtureBuilder.setHandSize(s1, 'p2', 2);
      const { nextState: sWithD2, card } = AllWildFixtureBuilder.injectPlayableCard(
        s2,
        'p1',
        'wild_draw_two'
      );

      const p2InitialHand = sWithD2.players[1].hand;
      expect(p2InitialHand).toHaveLength(2);

      const { nextState: next, events } = adapter.processAction(sWithD2, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: card.id,
      });

      expect(['ROUND_OVER', 'COMPLETED']).toContain(next.status);
      expect(next.roundWinner?.id).toBe('p1');

      // Next player (p2) received 2 cards penalty
      const p2FinalHand = next.players[1].hand;
      expect(p2FinalHand).toHaveLength(4);

      // Verify penalty event
      const penaltyEvent = events.find((e) => e.type === 'CARDS_DRAWN_PENALTY');
      expect(penaltyEvent).toBeDefined();
      expect(penaltyEvent?.payload.cardsDrawn).toBe(2);

      // Verify score includes all 4 cards in p2's hand
      const expectedScore = p2FinalHand.reduce(
        (sum, c) => sum + (ALL_WILD_CARD_POINTS[c.value] || 20),
        0
      );
      expect(next.roundWinner?.roundScore).toBe(expectedScore);

      assertValidAllWildGameState(next);
    });
  });

  describe('6. Final Wild Draw Four', () => {
    it('forces next player to draw 4 cards and includes all 4 cards in winner round score', () => {
      const base = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1, // p1 starts
      });
      const s1 = AllWildFixtureBuilder.setHandSize(base, 'p1', 1);
      const s2 = AllWildFixtureBuilder.setHandSize(s1, 'p2', 1);
      const { nextState: sWithD4, card } = AllWildFixtureBuilder.injectPlayableCard(
        s2,
        'p1',
        'wild_draw_four'
      );

      const { nextState: next, events } = adapter.processAction(sWithD4, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: card.id,
      });

      expect(['ROUND_OVER', 'COMPLETED']).toContain(next.status);
      expect(next.roundWinner?.id).toBe('p1');

      // p2 had 1 card, now has 1 + 4 = 5 cards
      const p2FinalHand = next.players[1].hand;
      expect(p2FinalHand).toHaveLength(5);

      const penaltyEvent = events.find((e) => e.type === 'CARDS_DRAWN_PENALTY');
      expect(penaltyEvent).toBeDefined();
      expect(penaltyEvent?.payload.cardsDrawn).toBe(4);

      const expectedScore = p2FinalHand.reduce(
        (sum, c) => sum + (ALL_WILD_CARD_POINTS[c.value] || 20),
        0
      );
      expect(next.roundWinner?.roundScore).toBe(expectedScore);

      assertValidAllWildGameState(next);
    });
  });

  describe('7. Final Wild Targeted Draw Two', () => {
    it('enters pending action state when played as last card, then ends round after target selection', () => {
      const base = AllWildFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'P1' },
          { id: 'p2', username: 'P2' },
          { id: 'p3', username: 'P3' },
        ],
        dealerIndex: 2, // p1 starts
      });
      const s1 = AllWildFixtureBuilder.setHandSize(base, 'p1', 1);
      const s2 = AllWildFixtureBuilder.setHandSize(s1, 'p2', 2);
      const s3 = AllWildFixtureBuilder.setHandSize(s2, 'p3', 2);

      const { nextState: sWithTd2, card } = AllWildFixtureBuilder.injectPlayableCard(
        s3,
        'p1',
        'wild_targeted_draw_two'
      );

      // Step 1: P1 plays Wild Targeted Draw Two as last card
      const { nextState: intermediateState, events: playEvents } = adapter.processAction(sWithTd2, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: card.id,
      });

      // Must NOT be prematurely round over
      expect(intermediateState.status).toBe('IN_PROGRESS');
      expect(intermediateState.players[0].hand).toHaveLength(0);
      expect(intermediateState.pendingActionState).toEqual({
        type: 'AWAITING_TARGETED_DRAW_TWO_SELECTION',
        sourcePlayerId: 'p1',
      });
      expect(playEvents.some((e) => e.type === 'PENDING_TARGETED_DRAW_TWO')).toBe(true);
      assertValidAllWildGameState(intermediateState);

      // Step 2: P1 selects P3 as target
      const { nextState: finalState, events: resolveEvents } = adapter.processAction(intermediateState, {
        type: 'CHOOSE_TARGETED_DRAW_TWO_TARGET',
        playerId: 'p1',
        targetPlayerId: 'p3',
      });

      // Now round is over, P1 is winner
      expect(['ROUND_OVER', 'COMPLETED']).toContain(finalState.status);
      expect(finalState.roundWinner?.id).toBe('p1');
      expect(finalState.pendingActionState).toBeNull();

      // P3 received 2 penalty cards (2 initial + 2 drawn = 4 cards)
      expect(finalState.players[2].hand).toHaveLength(4);
      // P2 was untargeted (remained 2 cards)
      expect(finalState.players[1].hand).toHaveLength(2);

      // Total round score should include P2 (2 cards) and P3 (4 cards)
      const allOpponentCards = [...finalState.players[1].hand, ...finalState.players[2].hand];
      const expectedScore = allOpponentCards.reduce(
        (sum, c) => sum + (ALL_WILD_CARD_POINTS[c.value] || 20),
        0
      );
      expect(finalState.roundWinner?.roundScore).toBe(expectedScore);

      expect(resolveEvents.some((e) => e.type === 'TARGETED_DRAW_TWO_RESOLVED')).toBe(true);
      expect(resolveEvents.some((e) => e.type === 'ROUND_WON')).toBe(true);
      assertValidAllWildGameState(finalState);
    });
  });

  describe('8. Final Wild Forced Swap', () => {
    it('in 3-player game, enters pending state when played as last card and awards victory to the chosen target who receives 0 cards (Designer Nick Hayes ruling)', () => {
      const base = AllWildFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'P1' },
          { id: 'p2', username: 'P2' },
          { id: 'p3', username: 'P3' },
        ],
        dealerIndex: 2, // p1 starts
      });
      const s1 = AllWildFixtureBuilder.setHandSize(base, 'p1', 1);
      const s2 = AllWildFixtureBuilder.setHandSize(s1, 'p2', 3);
      const s3 = AllWildFixtureBuilder.setHandSize(s2, 'p3', 4);

      const { nextState: sWithSwap, card } = AllWildFixtureBuilder.injectPlayableCard(
        s3,
        'p1',
        'wild_forced_swap'
      );

      // Step 1: P1 plays Wild Forced Swap as their last card
      const { nextState: intermediateState, events: playEvents } = adapter.processAction(sWithSwap, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: card.id,
      });

      // Must enter pending swap selection state; game remains IN_PROGRESS
      expect(intermediateState.status).toBe('IN_PROGRESS');
      expect(intermediateState.players[0].hand).toHaveLength(0);
      expect(intermediateState.pendingActionState).toEqual({
        type: 'AWAITING_FORCED_SWAP_SELECTION',
        sourcePlayerId: 'p1',
      });
      expect(playEvents.some((e) => e.type === 'PENDING_FORCED_SWAP')).toBe(true);
      assertValidAllWildGameState(intermediateState);

      // Validation check: unauthorized chooser cannot select target
      const unauthorizedRes = adapter.validateMove(intermediateState, {
        type: 'CHOOSE_FORCED_SWAP_TARGET',
        playerId: 'p2',
        targetPlayerId: 'p3',
      });
      expect(unauthorizedRes.valid).toBe(false);
      expect(unauthorizedRes.code).toBe('UNAUTHORIZED_CHOOSER');

      // Validation check: cannot swap with self
      const selfSwapRes = adapter.validateMove(intermediateState, {
        type: 'CHOOSE_FORCED_SWAP_TARGET',
        playerId: 'p1',
        targetPlayerId: 'p1',
      });
      expect(selfSwapRes.valid).toBe(false);
      expect(selfSwapRes.code).toBe('INVALID_PLAYER');

      // Step 2: P1 selects P2 as the swap target
      const { nextState: finalState, events: swapEvents } = adapter.processAction(intermediateState, {
        type: 'CHOOSE_FORCED_SWAP_TARGET',
        playerId: 'p1',
        targetPlayerId: 'p2',
      });

      // Hand swap execution:
      // P1 receives P2's 3 cards
      // P2 receives P1's 0 cards -> P2 wins the round!
      expect(finalState.players[0].hand).toHaveLength(3);
      expect(finalState.players[1].hand).toHaveLength(0);
      expect(finalState.players[2].hand).toHaveLength(4); // P3 unchanged

      expect(['ROUND_OVER', 'COMPLETED']).toContain(finalState.status);
      expect(finalState.roundWinner?.id).toBe('p2');
      expect(finalState.roundWinner?.id).not.toBe('p1');
      expect(finalState.pendingActionState).toBeNull();

      // P2 receives score for all opponents' cards: P1 (3 cards) + P3 (4 cards)
      const opponentCards = [...finalState.players[0].hand, ...finalState.players[2].hand];
      const expectedScore = opponentCards.reduce(
        (sum, c) => sum + (ALL_WILD_CARD_POINTS[c.value] || 20),
        0
      );
      expect(finalState.roundWinner?.roundScore).toBe(expectedScore);

      expect(swapEvents.some((e) => e.type === 'HANDS_FORCED_SWAPPED')).toBe(true);
      expect(swapEvents.some((e) => e.type === 'ROUND_WON')).toBe(true);
      assertValidAllWildGameState(finalState);

      // Validation check: duplicate target selection rejected
      const duplicateRes = adapter.validateMove(finalState, {
        type: 'CHOOSE_FORCED_SWAP_TARGET',
        playerId: 'p1',
        targetPlayerId: 'p3',
      });
      expect(duplicateRes.valid).toBe(false);
      expect(duplicateRes.code).toBe('NO_PENDING_CHALLENGE');
    });

    it('in 2-player game, enters pending state when played as last card and awards victory to opponent', () => {
      const base = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1, // p1 starts
      });
      const s1 = AllWildFixtureBuilder.setHandSize(base, 'p1', 1);
      const s2 = AllWildFixtureBuilder.setHandSize(s1, 'p2', 5);

      const { nextState: sWithSwap, card } = AllWildFixtureBuilder.injectPlayableCard(
        s2,
        'p1',
        'wild_forced_swap'
      );

      const { nextState: intermediateState } = adapter.processAction(sWithSwap, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: card.id,
      });

      expect(intermediateState.status).toBe('IN_PROGRESS');
      expect(intermediateState.pendingActionState?.type).toBe('AWAITING_FORCED_SWAP_SELECTION');

      const { nextState: finalState } = adapter.processAction(intermediateState, {
        type: 'CHOOSE_FORCED_SWAP_TARGET',
        playerId: 'p1',
        targetPlayerId: 'p2',
      });

      expect(['ROUND_OVER', 'COMPLETED']).toContain(finalState.status);
      expect(finalState.roundWinner?.id).toBe('p2');
      expect(finalState.players[0].hand).toHaveLength(5);
      expect(finalState.players[1].hand).toHaveLength(0);
      expect(finalState.pendingActionState).toBeNull();
      assertValidAllWildGameState(finalState);
    });
  });

  describe('9. Discard Recycling During Final Penalty Draw', () => {
    it('correctly recycles discard pile when draw pile is exhausted during final Wild Draw Four', () => {
      const base = AllWildFixtureBuilder.createInitialGameFixture({
        players: [{ id: 'p1', username: 'P1' }, { id: 'p2', username: 'P2' }],
        dealerIndex: 1, // p1 starts
      });
      const s1 = AllWildFixtureBuilder.setHandSize(base, 'p1', 1);
      const s2 = AllWildFixtureBuilder.setHandSize(s1, 'p2', 2);
      const { nextState: sWithD4, card } = AllWildFixtureBuilder.injectPlayableCard(
        s2,
        'p1',
        'wild_draw_four'
      );

      // Artificially starve draw pile to 1 card, moving rest to discard pile
      const starvedState = {
        ...sWithD4,
        drawPile: sWithD4.drawPile.slice(0, 1),
        discardPile: [...sWithD4.discardPile, ...sWithD4.drawPile.slice(1)],
      };
      assertValidAllWildGameState(starvedState);

      const { nextState: next } = adapter.processAction(starvedState, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: card.id,
      });

      expect(['ROUND_OVER', 'COMPLETED']).toContain(next.status);
      expect(next.roundWinner?.id).toBe('p1');
      expect(next.players[1].hand).toHaveLength(6); // 2 initial + 4 drawn
      assertValidAllWildGameState(next);
    });
  });

  describe('10. Non-Final Play Regression Checks', () => {
    it('normal non-final Wild Targeted Draw Two advances turn without ending round', () => {
      const base = AllWildFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'P1' },
          { id: 'p2', username: 'P2' },
          { id: 'p3', username: 'P3' },
        ],
        dealerIndex: 2, // p1 starts
      });
      const { nextState: sWithTd2, card } = AllWildFixtureBuilder.injectPlayableCard(
        base,
        'p1',
        'wild_targeted_draw_two'
      );

      const { nextState: intermediate } = adapter.processAction(sWithTd2, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: card.id,
      });

      expect(intermediate.status).toBe('IN_PROGRESS');
      expect(intermediate.pendingActionState?.type).toBe('AWAITING_TARGETED_DRAW_TWO_SELECTION');

      const { nextState: resolved } = adapter.processAction(intermediate, {
        type: 'CHOOSE_TARGETED_DRAW_TWO_TARGET',
        playerId: 'p1',
        targetPlayerId: 'p3',
      });

      expect(resolved.status).toBe('IN_PROGRESS');
      expect(resolved.roundWinner).toBeNull();
      expect(resolved.currentPlayerIndex).toBe(1); // advances to p2
      assertValidAllWildGameState(resolved);
    });

    it('normal non-final Wild Forced Swap advances turn without ending round', () => {
      const base = AllWildFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'P1' },
          { id: 'p2', username: 'P2' },
          { id: 'p3', username: 'P3' },
        ],
        dealerIndex: 2, // p1 starts
      });
      const { nextState: sWithSwap, card } = AllWildFixtureBuilder.injectPlayableCard(
        base,
        'p1',
        'wild_forced_swap'
      );

      const { nextState: intermediate } = adapter.processAction(sWithSwap, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: card.id,
      });

      expect(intermediate.status).toBe('IN_PROGRESS');
      expect(intermediate.pendingActionState?.type).toBe('AWAITING_FORCED_SWAP_SELECTION');

      const { nextState: resolved } = adapter.processAction(intermediate, {
        type: 'CHOOSE_FORCED_SWAP_TARGET',
        playerId: 'p1',
        targetPlayerId: 'p2',
      });

      expect(resolved.status).toBe('IN_PROGRESS');
      expect(resolved.roundWinner).toBeNull();
      expect(resolved.currentPlayerIndex).toBe(1); // advances to p2
      assertValidAllWildGameState(resolved);
    });
  });
});
