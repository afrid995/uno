import { describe, it, expect } from 'vitest';
import '../src/variants/no-mercy/no-mercy.adapter';
import { VariantRegistry } from '../src/variants/variant.types';
import { assertValidNoMercyGameState } from '../src/variants/no-mercy/no-mercy.invariants';
import { NoMercyFixtureBuilder } from '../src/variants/no-mercy/no-mercy.fixture';
import { NoMercyActionProcessor } from '../src/variants/no-mercy/no-mercy.actions';
import { UNO_NO_MERCY_RULES } from '../src/variants/no-mercy/no-mercy.constants';
import { NoMercyDealerSelector } from '../src/variants/no-mercy/no-mercy.dealer';
import { createSeededRng } from '../src/testing/deterministic-random';
import { Card } from '../src/cards/card.types';
import { GameState } from '../src/game/game.types';
import { isWildCard } from '../src/cards/card.validation';
import { getPlayerGameState } from '../src/projections/player-state';

describe('UNO Show \'em No Mercy — Official Rules & Mechanics (Mattel HWV18)', () => {
  const adapter = VariantRegistry.get('uno_show_em_no_mercy');

  describe('1. Setup, Player Counts & Opening Card', () => {
    it('enforces 2 to 6 players limits', () => {
      expect(() => {
        adapter.createGame({
          roomId: 'r1',
          players: [{ id: 'p1', username: 'P1' }],
          variant: 'uno_show_em_no_mercy',
        });
      }).toThrow(/Invalid player count 1/);

      expect(() => {
        adapter.createGame({
          roomId: 'r1',
          players: Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, username: `P${i}` })),
          variant: 'uno_show_em_no_mercy',
        });
      }).toThrow(/Invalid player count 7/);

      const state = adapter.createGame({
        roomId: 'r1',
        players: [
          { id: 'p1', username: 'P1' },
          { id: 'p2', username: 'P2' },
          { id: 'p3', username: 'P3' },
        ],
        variant: 'uno_show_em_no_mercy',
      });
      expect(state.players).toHaveLength(3);
      assertValidNoMercyGameState(state);
    });

    it('always starts with a number card, ignoring opening action cards', () => {
      for (let seed = 1; seed <= 20; seed++) {
        const state = NoMercyFixtureBuilder.createInitialGameFixture();
        expect(state.topDiscardCard.type).toBe('number');
        expect(Number.isInteger(Number(state.topDiscardCard.value))).toBe(true);
        assertValidNoMercyGameState(state);
      }
    });

    it('preserves exact 168 physical cards during setup', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      const totalCards =
        state.drawPile.length +
        state.discardPile.length +
        state.players.reduce((sum, p) => sum + p.hand.length, 0);

      expect(totalCards).toBe(168);
      assertValidNoMercyGameState(state);
    });
  });

  describe('2. Draw-until-playable Rule', () => {
    it('draws cards until a playable card is found and plays it immediately', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 1, // P1 starts
      });
      const activePlayerId = state.players[state.currentPlayerIndex].id;
      expect(activePlayerId).toBe('p1');

      const result = NoMercyActionProcessor.process(state, {
        type: 'DRAW_CARD',
        playerId: activePlayerId,
      });

      // Player must have drawn cards and played the matching card
      expect(result.nextState.topDiscardCard).not.toBeNull();
      // Sequence advanced
      expect(result.nextState.sequenceNumber).toBeGreaterThan(state.sequenceNumber);
      assertValidNoMercyGameState(result.nextState);
    });
  });

  describe('3. Stacking Rules (+2, +4, +6, +10, Wild Reverse Draw 4)', () => {
    it('initiates a stack penalty when Draw Two is played', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 2, // P1 starts
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      const p1 = state.players[0];
      const { nextState: s1, card: drawTwo } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        p1.id,
        'draw_two',
        state.activeColor ?? 'blue'
      );

      const res = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: p1.id,
        cardId: drawTwo.id,
      });

      expect(res.nextState.pendingActionState).toEqual({
        type: 'AWAITING_STACK_RESOLUTION',
        targetPlayerId: 'p2',
        playedByPlayerId: 'p1',
        accumulatedPenalty: 2,
        lastStackedValue: 2,
        lastCardValue: 'draw_two',
      });
      expect(res.nextState.currentPlayerIndex).toBe(1); // p2's turn to respond
    });

    it('allows stacking equal or higher draw cards (+2 -> +4 -> +6 -> +10)', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 2, // P1 starts
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      // P1 plays Draw 2 (+2)
      const { nextState: s1, card: d2 } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'draw_two',
        state.activeColor ?? 'blue'
      );
      let res = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: d2.id,
      });

      // P2 stacks Draw 4 (+4 >= +2)
      const { nextState: s2, card: d4 } = NoMercyFixtureBuilder.injectPlayableCard(
        res.nextState,
        'p2',
        'draw_four'
      );
      res = NoMercyActionProcessor.process(s2, {
        type: 'PLAY_CARD',
        playerId: 'p2',
        cardId: d4.id,
      });

      expect(res.nextState.pendingActionState?.accumulatedPenalty).toBe(6);
      expect(res.nextState.pendingActionState?.lastStackedValue).toBe(4);
      expect(res.nextState.currentPlayerIndex).toBe(2); // Charlie targeted

      // P3 stacks Wild Draw 6 (+6 >= +4)
      const { nextState: s3, card: d6 } = NoMercyFixtureBuilder.injectPlayableCard(
        res.nextState,
        'p3',
        'wild_draw_six'
      );
      res = NoMercyActionProcessor.process(s3, {
        type: 'PLAY_CARD',
        playerId: 'p3',
        cardId: d6.id,
        chosenColor: 'red',
      });

      expect(res.nextState.pendingActionState?.accumulatedPenalty).toBe(12);
      expect(res.nextState.pendingActionState?.lastStackedValue).toBe(6);
      expect(res.nextState.currentPlayerIndex).toBe(0); // Alice targeted

      // Alice accepts penalty: draws 12 cards and loses turn
      const preHandSize = res.nextState.players[0].hand.length;
      res = NoMercyActionProcessor.process(res.nextState, {
        type: 'ACCEPT_STACK_PENALTY',
        playerId: 'p1',
      });

      expect(res.nextState.pendingActionState).toBeNull();
      expect(res.nextState.players[0].hand.length).toBe(preHandSize + 12);
      expect(res.nextState.currentPlayerIndex).toBe(1); // Turn advanced to Bob
      assertValidNoMercyGameState(res.nextState);
    });

    it('rejects stacking a card with lower penalty than the last draw card (+2 onto +4)', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 1, // P1 starts
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const { nextState: s1, card: d4 } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'draw_four',
        state.activeColor ?? 'blue'
      );
      const res = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: d4.id,
      });

      // Bob tries to stack Draw Two on Draw Four
      const { nextState: s2, card: d2 } = NoMercyFixtureBuilder.injectPlayableCard(
        res.nextState,
        'p2',
        'draw_two'
      );

      expect(() => {
        NoMercyActionProcessor.process(s2, {
          type: 'PLAY_CARD',
          playerId: 'p2',
          cardId: d2.id,
        });
      }).toThrow(/Cannot stack a \+2 onto a \+4/);
    });
  });

  describe('4. Mercy Rule Elimination (Hand > 25 cards)', () => {
    it('instantly eliminates a player whose hand exceeds 25 cards (26+ cards)', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 2, // P1 starts
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      // Expand Bob's hand to 20 cards
      state = NoMercyFixtureBuilder.setHandSize(state, 'p2', 20);

      // Alice plays Wild Draw 6 targeting Bob (20 + 6 = 26 > 25!)
      const { nextState: s1, card: d6 } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'wild_draw_six'
      );
      const res1 = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: d6.id,
        chosenColor: 'yellow',
      });

      // Bob accepts penalty
      const res2 = NoMercyActionProcessor.process(res1.nextState, {
        type: 'ACCEPT_STACK_PENALTY',
        playerId: 'p2',
      });

      const bob = res2.nextState.players.find((p) => p.id === 'p2')!;
      expect(bob.isEliminated).toBe(true);
      expect(bob.hand).toHaveLength(0); // Hand set aside
      expect(res2.nextState.eliminatedPlayerIds).toContain('p2');
      expect(res2.nextState.setAsideCards?.length).toBeGreaterThanOrEqual(26);
      // Turn skips eliminated Bob, goes to Charlie
      expect(res2.nextState.currentPlayerIndex).toBe(2);
      assertValidNoMercyGameState(res2.nextState);
    });

    it('keeps a player active when their hand reaches exactly 25 cards', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 2, // P1 starts
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      // Expand Bob's hand to 19 cards
      state = NoMercyFixtureBuilder.setHandSize(state, 'p2', 19);

      // Alice plays Wild Draw 6 targeting Bob (19 + 6 = exactly 25 cards)
      const { nextState: s1, card: d6 } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'wild_draw_six'
      );
      const res1 = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: d6.id,
        chosenColor: 'yellow',
      });

      // Bob accepts penalty
      const res2 = NoMercyActionProcessor.process(res1.nextState, {
        type: 'ACCEPT_STACK_PENALTY',
        playerId: 'p2',
      });

      const bob = res2.nextState.players.find((p) => p.id === 'p2')!;
      expect(bob.isEliminated).toBe(false);
      expect(bob.hand).toHaveLength(25); // Exactly 25 cards -> Active!
      expect(res2.nextState.eliminatedPlayerIds || []).not.toContain('p2');
      assertValidNoMercyGameState(res2.nextState);
    });

    it('awards match win to last standing player when all others are eliminated', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 1, // P1 starts
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      state = NoMercyFixtureBuilder.setHandSize(state, 'p2', 22);

      const { nextState: s1, card: d4 } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'draw_four',
        state.activeColor ?? 'blue'
      );
      const res1 = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: d4.id,
      });

      // Bob accepts (+4 -> 26 cards -> eliminated)
      const res2 = NoMercyActionProcessor.process(res1.nextState, {
        type: 'ACCEPT_STACK_PENALTY',
        playerId: 'p2',
      });

      expect(res2.nextState.status).toBe('COMPLETED');
      expect(res2.nextState.winner?.id).toBe('p1');
      expect(res2.nextState.winner?.score).toBeGreaterThanOrEqual(UNO_NO_MERCY_RULES.ELIMINATION_BONUS_POINTS);
    });
  });

  describe('5. 7\'s Swap & 0\'s Pass Rules', () => {
    it('enforces mandatory 7\'s swap with chosen active opponent', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 2, // P1 starts
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      const p1 = state.players[0];
      const { nextState: s1, card: seven } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        '7',
        state.activeColor ?? 'blue'
      );

      const res1 = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: seven.id,
      });

      expect(res1.nextState.pendingActionState).toEqual({
        type: 'AWAITING_7S_SWAP_SELECTION',
        sourcePlayerId: 'p1',
      });

      const p1HandBefore = [...res1.nextState.players[0].hand];
      const p3HandBefore = [...res1.nextState.players[2].hand];

      const res2 = NoMercyActionProcessor.process(res1.nextState, {
        type: 'CHOOSE_7S_SWAP_TARGET',
        playerId: 'p1',
        targetPlayerId: 'p3',
      });

      expect(res2.nextState.pendingActionState).toBeNull();
      expect(res2.nextState.players[0].hand).toEqual(p3HandBefore);
      expect(res2.nextState.players[2].hand).toEqual(p1HandBefore);
      assertValidNoMercyGameState(res2.nextState);
    });

    it('executes atomic 0\'s pass in current direction', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 2, // P1 starts
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      const { nextState: s1, card: zero } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        '0',
        state.activeColor ?? 'blue'
      );

      // Snapshot hands prior to 0 played
      const p1Hand = s1.players[0].hand.filter((c) => c.id !== zero.id);
      const p2Hand = [...s1.players[1].hand];
      const p3Hand = [...s1.players[2].hand];

      const res = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: zero.id,
      });

      // Clockwise rotation: P2 receives P1's hand, P3 receives P2's hand, P1 receives P3's hand
      expect(res.nextState.players[1].hand).toEqual(p1Hand);
      expect(res.nextState.players[2].hand).toEqual(p2Hand);
      expect(res.nextState.players[0].hand).toEqual(p3Hand);
      assertValidNoMercyGameState(res.nextState);
    });
  });

  describe('6. Discard All & Special Actions', () => {
    it('discards all matching cards beneath top Discard All card', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 1, // P1 starts
      });
      const p1 = state.players[0];

      const targetColor = (state.activeColor as Card['color']) ?? 'red';
      const { nextState: s1, card: discardAll } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'discard_all',
        targetColor
      );

      // Ensure p1 has matching color cards
      const preCards = s1.players[0].hand.filter((c) => c.color === targetColor);
      expect(preCards.length).toBeGreaterThanOrEqual(1);

      const res = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: discardAll.id,
      });

      // Top discard must be the Discard All card
      expect(res.nextState.topDiscardCard.id).toBe(discardAll.id);
      expect(res.nextState.activeColor).toBe(targetColor);

      // Hand must not have any matching color cards remaining
      const postCards = res.nextState.players[0].hand.filter((c) => c.color === targetColor);
      expect(postCards).toHaveLength(0);
      assertValidNoMercyGameState(res.nextState);
    });

    it('Skip Everyone allows the player to take another turn immediately', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 2, // P1 starts
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      const { nextState: s1, card: skipAll } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'skip_everyone',
        state.activeColor ?? 'blue'
      );

      const res = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: skipAll.id,
      });

      expect(res.nextState.currentPlayerIndex).toBe(0); // Alice plays again!
    });

    it('In 2-player mode, Reverse gives current player another turn', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 1, // P1 starts
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const { nextState: s1, card: rev } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'reverse',
        state.activeColor ?? 'blue'
      );

      const res = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: rev.id,
      });

      expect(res.nextState.currentPlayerIndex).toBe(0); // Alice takes another turn
    });

    it('In 2-player mode, Wild Reverse Draw 4 targets the player who played it', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 1, // P1 starts
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const { nextState: s1, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'wild_reverse_draw_four'
      );

      const res = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: wrd4.id,
        chosenColor: 'green',
      });

      // Target must be Alice ('p1') per Mattel HWV18 2-player rule!
      expect(res.nextState.pendingActionState).toEqual({
        type: 'AWAITING_STACK_RESOLUTION',
        targetPlayerId: 'p1',
        playedByPlayerId: 'p1',
        accumulatedPenalty: 4,
        lastStackedValue: 4,
        lastCardValue: 'wild_reverse_draw_four',
      });
      expect(res.nextState.currentPlayerIndex).toBe(0);
    });

    it('standard Wild card allows player to change active color, advances turn, and generates zero draw penalty', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 1, // P1 starts
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const { nextState: s1, card: wildCard } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'wild'
      );

      const res1 = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: wildCard.id,
        chosenColor: 'yellow',
      });

      expect(res1.nextState.pendingActionState).toBeNull();
      expect(res1.nextState.activeColor).toBe('yellow');
      expect(res1.nextState.topDiscardCard.id).toBe(wildCard.id);
      expect(res1.nextState.currentPlayerIndex).toBe(1); // Advances to Bob
      expect(res1.nextState.players[1].hand).toHaveLength(7); // Bob receives zero penalty
      assertValidNoMercyGameState(res1.nextState);
    });
  });

  describe('7. Official Scoring Table & 1,000 Points Target', () => {
    it('correctly scores numbers, colored actions (20), wild actions (50), and +250 per eliminated player', () => {
      const players = [
        {
          id: 'p1',
          username: 'Alice',
          hand: [],
          hasDeclaredUno: false,
          hasDrawnThisTurn: false,
          drawnCardId: null,
          score: 0,
        },
        {
          id: 'p2',
          username: 'Bob',
          hand: [
            { id: 'c1', color: 'red', type: 'number', value: '7', scoreValue: 7 }, // 7
            { id: 'c2', color: 'blue', type: 'action', value: 'draw_two', scoreValue: 20 }, // 20
            { id: 'c3', color: null, type: 'wild', value: 'wild_draw_ten', scoreValue: 50 }, // 50
          ] as Card[],
          hasDeclaredUno: false,
          hasDrawnThisTurn: false,
          drawnCardId: null,
          score: 0,
        },
      ];

      // Round score with 1 eliminated player bonus = 7 + 20 + 50 + 250 = 327
      const score = NoMercyActionProcessor.calculateRoundScore(players, 'p1', 1);
      expect(score).toBe(77 + 250);
      expect(score).toBe(327);
    });
  });

  describe('8. Mercy Rule Set-Aside Card Recycling Lifecycle', () => {
    it('keeps eliminated cards set aside while the draw pile still has cards', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 2,
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      // Eliminate Bob with 25 cards
      state = NoMercyFixtureBuilder.setHandSize(state, 'p2', 20);
      const { nextState: s1, card: d6 } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'wild_draw_six'
      );
      const res1 = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: d6.id,
        chosenColor: 'red',
      });
      const res2 = NoMercyActionProcessor.process(res1.nextState, {
        type: 'ACCEPT_STACK_PENALTY',
        playerId: 'p2',
      });
      expect(res2.nextState.setAsideCards?.length).toBeGreaterThanOrEqual(25);
      const initialSetAsideCount = res2.nextState.setAsideCards!.length;

      // Charlie's turn. Charlie draws a card. Draw pile still has plenty of cards.
      const charlieId = res2.nextState.players[res2.nextState.currentPlayerIndex].id;
      const res3 = NoMercyActionProcessor.process(res2.nextState, {
        type: 'DRAW_CARD',
        playerId: charlieId,
      });

      // setAsideCards must remain intact and out of circulation!
      expect(res3.nextState.setAsideCards?.length).toBe(initialSetAsideCount);
      assertValidNoMercyGameState(res3.nextState);
    });

    it('returns set-aside cards to circulation only when draw pile runs out and reshuffle is required', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 1,
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      // Simulate Bob being eliminated with 25 cards
      const eliminatedCards = state.drawPile.slice(0, 25);
      const remainingDraw = state.drawPile.slice(25, 27); // Only 2 cards left in draw pile!
      const topDiscard = state.topDiscardCard;
      const discardedBeneath = state.drawPile.slice(27, 30); // 3 cards in discard beneath top
      const fullDiscard = [...discardedBeneath, topDiscard];

      const customState = {
        ...state,
        drawPile: remainingDraw,
        discardPile: fullDiscard,
        setAsideCards: eliminatedCards,
        eliminatedPlayerIds: ['p2'],
        players: [
          state.players[0],
          { ...state.players[1], hand: [], isEliminated: true, eliminationOrder: 1 },
        ],
      };

      // Draw 4 cards: first 2 come from draw pile, then draw pile is empty -> triggers reshuffle!
      const result = NoMercyActionProcessor.drawCards(
        customState.drawPile,
        customState.discardPile,
        4,
        customState.setAsideCards
      );

      // 4 cards drawn
      expect(result.drawnCards).toHaveLength(4);
      // Top discard card preserved
      expect(result.newDiscardPile).toHaveLength(1);
      expect(result.newDiscardPile[0].id).toBe(topDiscard.id);
      // setAsideCards was emptied
      expect(result.newSetAsideCards).toHaveLength(0);
      // New draw pile contains the rest: (2 initial - 2 drawn) + (3 discard + 25 setAside - 2 drawn) = 26 cards!
      expect(result.newDrawPile).toHaveLength(26);

      // Total physical cards in this test: 4 drawn + 1 topDiscard + 26 newDraw = 31 cards
      expect(result.drawnCards.length + result.newDiscardPile.length + result.newDrawPile.length).toBe(31);
    });

    it('preserves top discard card and places all recyclable cards into draw pile without duplicates', () => {
      const topDiscard: Card = { id: 'top_card', color: 'red', type: 'number', value: '5', scoreValue: 5, variant: 'uno_show_em_no_mercy' };
      const discardBeneath: Card[] = [
        { id: 'disc_1', color: 'blue', type: 'number', value: '3', scoreValue: 3, variant: 'uno_show_em_no_mercy' },
        { id: 'disc_2', color: 'green', type: 'number', value: '4', scoreValue: 4, variant: 'uno_show_em_no_mercy' },
      ];
      const setAside: Card[] = [
        { id: 'set_1', color: 'yellow', type: 'number', value: '1', scoreValue: 1, variant: 'uno_show_em_no_mercy' },
        { id: 'set_2', color: 'yellow', type: 'number', value: '2', scoreValue: 2, variant: 'uno_show_em_no_mercy' },
      ];

      const res = NoMercyActionProcessor.reshuffleRecyclableCards(
        [], // empty draw pile
        [...discardBeneath, topDiscard],
        setAside
      );

      expect(res.reshuffled).toBe(true);
      expect(res.newDiscardPile).toEqual([topDiscard]);
      expect(res.newSetAsideCards).toEqual([]);
      expect(res.newDrawPile).toHaveLength(4); // 2 discard + 2 set-aside

      const drawIds = res.newDrawPile.map((c) => c.id).sort();
      expect(drawIds).toEqual(['disc_1', 'disc_2', 'set_1', 'set_2']);
    });

    it('allows draw-until-playable to successfully find and play a card recycled from set-aside cards', () => {
      const topDiscard: Card = { id: 'top_card', color: 'red', type: 'number', value: '5', scoreValue: 5, variant: 'uno_show_em_no_mercy' };
      // Empty draw pile
      const drawPile: Card[] = [];
      const discardPile: Card[] = [topDiscard];
      // setAsideCards contains a matching Red 8
      const setAside: Card[] = [
        { id: 'sa_yellow', color: 'yellow', type: 'number', value: '1', scoreValue: 1, variant: 'uno_show_em_no_mercy' },
        { id: 'sa_red', color: 'red', type: 'number', value: '8', scoreValue: 8, variant: 'uno_show_em_no_mercy' },
      ];

      const res = NoMercyActionProcessor.drawUntilPlayable(
        drawPile,
        discardPile,
        topDiscard,
        'red',
        setAside
      );

      expect(res.playableCard).not.toBeNull();
      expect(res.playableCard?.color).toBe('red');
      expect(res.newSetAsideCards).toHaveLength(0);
      expect(res.newDiscardPile).toEqual([topDiscard]);
    });

    it('safely terminates without an infinite loop when draw pile and all recyclable cards are empty', () => {
      const topDiscard: Card = { id: 'top_card', color: 'red', type: 'number', value: '5', scoreValue: 5, variant: 'uno_show_em_no_mercy' };
      const res = NoMercyActionProcessor.drawCards(
        [],
        [topDiscard],
        10,
        []
      );

      expect(res.drawnCards).toHaveLength(0);
      expect(res.newDrawPile).toHaveLength(0);
      expect(res.newDiscardPile).toEqual([topDiscard]);
      expect(res.newSetAsideCards).toHaveLength(0);
    });

    it('strictly preserves 168-card conservation before and after set-aside card recycling', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 2,
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      // Expand Bob to 24 cards
      state = NoMercyFixtureBuilder.setHandSize(state, 'p2', 24);
      // Alice plays draw_two targeting Bob (24 + 2 = 26 >= 25 -> elimination)
      const { nextState: s1, card: d2 } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'draw_two',
        state.activeColor ?? 'blue'
      );
      const res1 = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: d2.id,
      });
      const res2 = NoMercyActionProcessor.process(res1.nextState, {
        type: 'ACCEPT_STACK_PENALTY',
        playerId: 'p2',
      });

      expect(res2.nextState.players.find((p) => p.id === 'p2')?.isEliminated).toBe(true);
      expect(res2.nextState.setAsideCards?.length).toBe(26);
      assertValidNoMercyGameState(res2.nextState);

      // Exhaust draw pile by transferring all cards to discard pile so any draw requires reshuffling setAsideCards
      const lowDrawState = {
        ...res2.nextState,
        drawPile: [],
        discardPile: [...res2.nextState.drawPile, ...res2.nextState.discardPile],
      };
      assertValidNoMercyGameState(lowDrawState);

      // Next player draws cards crossing the 1-card draw pile boundary
      const activeP = lowDrawState.players[lowDrawState.currentPlayerIndex];
      const res3 = NoMercyActionProcessor.process(lowDrawState, {
        type: 'DRAW_CARD',
        playerId: activeP.id,
      });

      // setAsideCards must have been recycled into circulation
      expect(res3.nextState.setAsideCards).toHaveLength(0);
      assertValidNoMercyGameState(res3.nextState);
    });
  });

  describe('9. Stacking Eligibility & Wild Reverse Draw 4 Precision', () => {
    it('allows Wild Reverse Draw 4 to be stacked onto an active Draw penalty (+2 or +4) and reverses play direction', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 1,
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const { nextState: s1, card: d2 } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'draw_two',
        state.activeColor ?? 'blue'
      );
      const res1 = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: d2.id,
      });

      // Bob stacks Wild Reverse Draw 4 onto Draw Two
      const { nextState: s2, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(
        res1.nextState,
        'p2',
        'wild_reverse_draw_four'
      );

      // Verify Bob's player state projection shows canStack: true and wrd4 in playableCardIds
      const bobView = getPlayerGameState(s2, 'p2');
      expect(bobView.self.isTargetedByStack).toBe(true);
      expect(bobView.self.canStack).toBe(true);
      expect(bobView.self.playableCardIds).toContain(wrd4.id);

      const res2 = NoMercyActionProcessor.process(s2, {
        type: 'PLAY_CARD',
        playerId: 'p2',
        cardId: wrd4.id,
        chosenColor: 'red',
      });

      // Direction reversed to counter-clockwise
      expect(res2.nextState.turnDirection).toBe('counter_clockwise');
      // In 2-player match, target passes back to Alice with accumulated +6 penalty!
      expect(res2.nextState.pendingActionState).toEqual({
        type: 'AWAITING_STACK_RESOLUTION',
        targetPlayerId: 'p1',
        playedByPlayerId: 'p2',
        accumulatedPenalty: 6,
        lastStackedValue: 4,
        lastCardValue: 'wild_reverse_draw_four',
      });
      expect(res2.nextState.currentPlayerIndex).toBe(0);
      assertValidNoMercyGameState(res2.nextState);
    });

    it('stacks Wild Reverse Draw 4 on Draw 4: accumulates +8, reverses direction, and selects correct next player', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 2, // P1 starts (index 0)
        players: [
          { id: 'p1', username: 'Alice' },   // 0
          { id: 'p2', username: 'Bob' },     // 1
          { id: 'p3', username: 'Charlie' }, // 2
        ],
      });
      expect(state.turnDirection).toBe('clockwise');

      // Alice plays colored Draw Four on Bob
      const { nextState: s1, card: d4 } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'draw_four',
        state.activeColor ?? 'blue'
      );
      const res1 = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: d4.id,
      });

      expect(res1.nextState.pendingActionState?.accumulatedPenalty).toBe(4);
      expect(res1.nextState.pendingActionState?.targetPlayerId).toBe('p2');
      expect(res1.nextState.currentPlayerIndex).toBe(1);

      // Bob stacks Wild Reverse Draw 4
      const { nextState: s2, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(
        res1.nextState,
        'p2',
        'wild_reverse_draw_four'
      );

      const bobView = getPlayerGameState(s2, 'p2');
      expect(bobView.self.isTargetedByStack).toBe(true);
      expect(bobView.self.canStack).toBe(true);
      expect(bobView.self.playableCardIds).toContain(wrd4.id);

      const res2 = NoMercyActionProcessor.process(s2, {
        type: 'PLAY_CARD',
        playerId: 'p2',
        cardId: wrd4.id,
        chosenColor: 'red',
      });

      // Direction reverses: clockwise -> counter_clockwise
      expect(res2.nextState.turnDirection).toBe('counter_clockwise');
      // Accumulated penalty becomes 4 + 4 = 8
      expect(res2.nextState.pendingActionState?.accumulatedPenalty).toBe(8);
      expect(res2.nextState.pendingActionState?.lastStackedValue).toBe(4);
      expect(res2.nextState.pendingActionState?.lastCardValue).toBe('wild_reverse_draw_four');
      // In 3+ active players: direction reversed to counter-clockwise from Bob (idx 1),
      // passing the +8 penalty back to Alice (idx 0). Bob does NOT receive the penalty!
      expect(res2.nextState.pendingActionState?.targetPlayerId).toBe('p1');
      expect(res2.nextState.currentPlayerIndex).toBe(0);

      // Verify DIRECTION_REVERSED and STACK_PENALTY_PENDING events
      const dirEvent = res2.events.find((e) => e.type === 'DIRECTION_REVERSED');
      expect(dirEvent).toBeDefined();
      expect(dirEvent?.payload).toEqual({ turnDirection: 'counter_clockwise' });

      const stackEvent = res2.events.find((e) => e.type === 'STACK_PENALTY_PENDING');
      expect(stackEvent).toBeDefined();
      expect(stackEvent?.payload).toEqual({
        targetPlayerId: 'p1',
        accumulatedPenalty: 8,
        lastStackedValue: 4,
      });

      // Alice accepts the penalty: draws 8 cards, and turn advances counter-clockwise to Charlie (idx 2)
      const res3 = NoMercyActionProcessor.process(res2.nextState, {
        type: 'ACCEPT_STACK_PENALTY',
        playerId: 'p1',
      });
      expect(res3.nextState.pendingActionState).toBeNull();
      expect(res3.nextState.currentPlayerIndex).toBe(2);
      assertValidNoMercyGameState(res3.nextState);
    });

    it('supports further stacking after Wild Reverse Draw 4 and rejects invalid cards', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 2, // P1 starts (index 0)
        players: [
          { id: 'p1', username: 'Alice' },   // 0
          { id: 'p2', username: 'Bob' },     // 1
          { id: 'p3', username: 'Charlie' }, // 2
        ],
      });

      // Alice plays Draw Four -> targets Bob with +4
      const { nextState: s1, card: d4 } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'draw_four',
        state.activeColor ?? 'blue'
      );
      const res1 = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: d4.id,
      });

      // Bob stacks Wild Reverse Draw 4 -> reverses to counter_clockwise, targets Alice (idx 0) with +8
      const { nextState: s2, card: wrd4Bob } = NoMercyFixtureBuilder.injectPlayableCard(
        res1.nextState,
        'p2',
        'wild_reverse_draw_four'
      );
      const res2 = NoMercyActionProcessor.process(s2, {
        type: 'PLAY_CARD',
        playerId: 'p2',
        cardId: wrd4Bob.id,
        chosenColor: 'yellow',
      });
      expect(res2.nextState.turnDirection).toBe('counter_clockwise');
      expect(res2.nextState.pendingActionState?.accumulatedPenalty).toBe(8);
      expect(res2.nextState.currentPlayerIndex).toBe(0);
      expect(res2.nextState.pendingActionState?.targetPlayerId).toBe('p1');

      // Alice now stacks another Wild Reverse Draw 4!
      const { nextState: s3, card: wrd4Alice } = NoMercyFixtureBuilder.injectPlayableCard(
        res2.nextState,
        'p1',
        'wild_reverse_draw_four'
      );
      const res3 = NoMercyActionProcessor.process(s3, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: wrd4Alice.id,
        chosenColor: 'green',
      });

      // Direction reverses back: counter_clockwise -> clockwise
      expect(res3.nextState.turnDirection).toBe('clockwise');
      // Accumulated penalty becomes 8 + 4 = 12
      expect(res3.nextState.pendingActionState?.accumulatedPenalty).toBe(12);
      expect(res3.nextState.pendingActionState?.lastStackedValue).toBe(4);
      // Next in clockwise from Alice (idx 0) is Bob (idx 1)!
      expect(res3.nextState.pendingActionState?.targetPlayerId).toBe('p2');
      expect(res3.nextState.currentPlayerIndex).toBe(1);

      // Bob now stacks Wild Draw Six (+6 >= 4)
      const { nextState: s4, card: wd6Bob } = NoMercyFixtureBuilder.injectPlayableCard(
        res3.nextState,
        'p2',
        'wild_draw_six'
      );
      const res4 = NoMercyActionProcessor.process(s4, {
        type: 'PLAY_CARD',
        playerId: 'p2',
        cardId: wd6Bob.id,
        chosenColor: 'blue',
      });

      // Direction remains clockwise
      expect(res4.nextState.turnDirection).toBe('clockwise');
      // Accumulated penalty becomes 12 + 6 = 18
      expect(res4.nextState.pendingActionState?.accumulatedPenalty).toBe(18);
      expect(res4.nextState.pendingActionState?.lastStackedValue).toBe(6);
      // Next in clockwise from Bob (idx 1) is Charlie (idx 2)!
      expect(res4.nextState.pendingActionState?.targetPlayerId).toBe('p3');
      expect(res4.nextState.currentPlayerIndex).toBe(2);

      // Charlie attempts to stack a Draw Four or Wild Reverse Draw 4 (+4 < 6) -> REJECTED!
      const { nextState: s5, card: wrd4Charlie } = NoMercyFixtureBuilder.injectPlayableCard(
        res4.nextState,
        'p3',
        'wild_reverse_draw_four'
      );

      // Verify Charlie's player state projection does NOT include wrd4Charlie (since 4 < 6)
      const charlieView = getPlayerGameState(s5, 'p3');
      expect(charlieView.self.isTargetedByStack).toBe(true);
      expect(charlieView.self.playableCardIds).not.toContain(wrd4Charlie.id);

      expect(() => {
        NoMercyActionProcessor.process(s5, {
          type: 'PLAY_CARD',
          playerId: 'p3',
          cardId: wrd4Charlie.id,
          chosenColor: 'red',
        });
      }).toThrow(/Cannot stack a \+4 onto a \+6/);

      // Charlie attempts to play an invalid non-draw card (e.g. Reverse or Number card) -> REJECTED!
      const { nextState: s6, card: revCard } = NoMercyFixtureBuilder.injectPlayableCard(
        s5,
        'p3',
        'reverse',
        'blue'
      );
      expect(() => {
        NoMercyActionProcessor.process(s6, {
          type: 'PLAY_CARD',
          playerId: 'p3',
          cardId: revCard.id,
        });
      }).toThrow(/is not an eligible Draw Card/);

      // Charlie accepts the penalty and draws 18 cards; hand had 7 cards, now 7 + 18 = 25 -> Active with exactly 25 cards!
      const acceptRes = NoMercyActionProcessor.process(s5, {
        type: 'ACCEPT_STACK_PENALTY',
        playerId: 'p3',
      });
      const charlie = acceptRes.nextState.players.find((p) => p.id === 'p3')!;
      expect(charlie.isEliminated).toBe(false);
      expect(charlie.hand).toHaveLength(25);
      // Turn advances in clockwise from Charlie (idx 2) to Alice (idx 0)
      expect(acceptRes.nextState.currentPlayerIndex).toBe(0);
      assertValidNoMercyGameState(acceptRes.nextState);
    });

    it('in 2-player match, Wild Reverse Draw 4 rebounds to original player and can be passed via Draw Four', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 1,
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      // P1 plays Wild Reverse Draw 4
      const { nextState: s1, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'wild_reverse_draw_four'
      );
      const res1 = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: wrd4.id,
        chosenColor: 'blue',
      });

      // Penalty rebounds to P1
      expect(res1.nextState.pendingActionState).toEqual({
        type: 'AWAITING_STACK_RESOLUTION',
        targetPlayerId: 'p1',
        playedByPlayerId: 'p1',
        accumulatedPenalty: 4,
        lastStackedValue: 4,
        lastCardValue: 'wild_reverse_draw_four',
      });
      expect(res1.nextState.currentPlayerIndex).toBe(0); // P1 must resolve

      // P1 stacks Draw Four (+4 >= 4)
      const { nextState: s2, card: d4 } = NoMercyFixtureBuilder.injectPlayableCard(
        res1.nextState,
        'p1',
        'draw_four'
      );
      const res2 = NoMercyActionProcessor.process(s2, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: d4.id,
      });

      // Penalty passes to P2 with 8 cards!
      expect(res2.nextState.pendingActionState?.accumulatedPenalty).toBe(8);
      expect(res2.nextState.pendingActionState?.targetPlayerId).toBe('p2');
      expect(res2.nextState.currentPlayerIndex).toBe(1); // P2 must respond
      assertValidNoMercyGameState(res2.nextState);
    });

    it('in 3-or-more-player match, Wild Reverse Draw 4 reverses direction and targets next player in new direction', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 2, // P1 starts (index 0)
        players: [
          { id: 'p1', username: 'Alice' }, // 0
          { id: 'p2', username: 'Bob' },   // 1
          { id: 'p3', username: 'Charlie' }, // 2
        ],
      });
      expect(state.turnDirection).toBe('clockwise');

      const { nextState: s1, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'wild_reverse_draw_four'
      );
      const res = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: wrd4.id,
        chosenColor: 'yellow',
      });

      // Direction reversed to counter-clockwise
      expect(res.nextState.turnDirection).toBe('counter_clockwise');
      // Next in counter-clockwise from index 0 is index 2 (Charlie)!
      expect(res.nextState.pendingActionState?.targetPlayerId).toBe('p3');
      expect(res.nextState.pendingActionState?.accumulatedPenalty).toBe(4);
      expect(res.nextState.currentPlayerIndex).toBe(2);
      assertValidNoMercyGameState(res.nextState);
    });

    it('in 2-player match, accepting rebound penalty causes turn forfeiture to opponent', () => {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 1,
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const { nextState: s1, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'wild_reverse_draw_four'
      );
      const res1 = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: wrd4.id,
        chosenColor: 'green',
      });

      const p1PreCount = res1.nextState.players[0].hand.length;
      // P1 accepts the rebound penalty
      const res2 = NoMercyActionProcessor.process(res1.nextState, {
        type: 'ACCEPT_STACK_PENALTY',
        playerId: 'p1',
      });

      expect(res2.nextState.pendingActionState).toBeNull();
      expect(res2.nextState.players[0].hand.length).toBe(p1PreCount + 4);
      // Turn passes to Bob (P2)
      expect(res2.nextState.currentPlayerIndex).toBe(1);
      assertValidNoMercyGameState(res2.nextState);
    });
  });

  describe('10. Application Dealer Selection Policy & Tie-Break Verification', () => {
    it('deterministically selects dealer and records rounds under application policy', () => {
      const rng = createSeededRng(12345);
      const result = NoMercyDealerSelector.determineDealerDetailed(4, rng);
      expect(result.dealerIndex).toBeGreaterThanOrEqual(0);
      expect(result.dealerIndex).toBeLessThan(4);
      expect(result.roundHistory.length).toBeGreaterThanOrEqual(1);
    });

    it('falls back to lowest candidate index when max tie rounds are exceeded', () => {
      // When maxTieRounds is 0, no rounds can break the tie, triggering fallback immediately
      const result = NoMercyDealerSelector.determineDealerDetailed(3, () => 0.5, 0);
      expect(result.tieRounds).toBe(0);
      expect(result.resolvedByFallback).toBe(true);
      expect(result.dealerIndex).toBe(0); // lowest candidate
    });
  });

  describe('11. No Mercy Rules Update: Elimination Boundary (> 25), Standard Wild, and Stacking Fix', () => {
    describe('A. Elimination Threshold Boundary Matrix (> 25 cards)', () => {
      it('evaluates hand sizes at 24 (active), 25 (active), 26 (eliminated), and 27 (eliminated) via stack accept', () => {
        // Test 24 cards -> Active
        let s24 = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: 2,
          players: [
            { id: 'p1', username: 'Alice' },
            { id: 'p2', username: 'Bob' },
            { id: 'p3', username: 'Charlie' },
          ],
        });
        s24 = NoMercyFixtureBuilder.setHandSize(s24, 'p2', 20);
        const { nextState: s24_1, card: d4_24 } = NoMercyFixtureBuilder.injectPlayableCard(s24, 'p1', 'draw_four', s24.activeColor ?? 'blue');
        const res24_1 = NoMercyActionProcessor.process(s24_1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d4_24.id });
        const res24_2 = NoMercyActionProcessor.process(res24_1.nextState, { type: 'ACCEPT_STACK_PENALTY', playerId: 'p2' });
        const bob24 = res24_2.nextState.players.find((p) => p.id === 'p2')!;
        expect(bob24.isEliminated).toBe(false);
        expect(bob24.hand).toHaveLength(24);
        assertValidNoMercyGameState(res24_2.nextState);

        // Test 25 cards -> Active
        let s25 = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: 2,
          players: [
            { id: 'p1', username: 'Alice' },
            { id: 'p2', username: 'Bob' },
            { id: 'p3', username: 'Charlie' },
          ],
        });
        s25 = NoMercyFixtureBuilder.setHandSize(s25, 'p2', 21);
        const { nextState: s25_1, card: d4_25 } = NoMercyFixtureBuilder.injectPlayableCard(s25, 'p1', 'draw_four', s25.activeColor ?? 'blue');
        const res25_1 = NoMercyActionProcessor.process(s25_1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d4_25.id });
        const res25_2 = NoMercyActionProcessor.process(res25_1.nextState, { type: 'ACCEPT_STACK_PENALTY', playerId: 'p2' });
        const bob25 = res25_2.nextState.players.find((p) => p.id === 'p2')!;
        expect(bob25.isEliminated).toBe(false);
        expect(bob25.hand).toHaveLength(25);
        assertValidNoMercyGameState(res25_2.nextState);

        // Test 26 cards -> Eliminated
        let s26 = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: 2,
          players: [
            { id: 'p1', username: 'Alice' },
            { id: 'p2', username: 'Bob' },
            { id: 'p3', username: 'Charlie' },
          ],
        });
        s26 = NoMercyFixtureBuilder.setHandSize(s26, 'p2', 22);
        const { nextState: s26_1, card: d4_26 } = NoMercyFixtureBuilder.injectPlayableCard(s26, 'p1', 'draw_four', s26.activeColor ?? 'blue');
        const res26_1 = NoMercyActionProcessor.process(s26_1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d4_26.id });
        const res26_2 = NoMercyActionProcessor.process(res26_1.nextState, { type: 'ACCEPT_STACK_PENALTY', playerId: 'p2' });
        const bob26 = res26_2.nextState.players.find((p) => p.id === 'p2')!;
        expect(bob26.isEliminated).toBe(true);
        expect(bob26.hand).toHaveLength(0);
        expect(res26_2.nextState.setAsideCards?.length).toBeGreaterThanOrEqual(26);
        assertValidNoMercyGameState(res26_2.nextState);

        // Test 27 cards -> Eliminated
        let s27 = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: 2,
          players: [
            { id: 'p1', username: 'Alice' },
            { id: 'p2', username: 'Bob' },
            { id: 'p3', username: 'Charlie' },
          ],
        });
        s27 = NoMercyFixtureBuilder.setHandSize(s27, 'p2', 21);
        const { nextState: s27_1, card: d6_27 } = NoMercyFixtureBuilder.injectPlayableCard(s27, 'p1', 'wild_draw_six');
        const res27_1 = NoMercyActionProcessor.process(s27_1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d6_27.id, chosenColor: 'yellow' });
        const res27_2 = NoMercyActionProcessor.process(res27_1.nextState, { type: 'ACCEPT_STACK_PENALTY', playerId: 'p2' });
        const bob27 = res27_2.nextState.players.find((p) => p.id === 'p2')!;
        expect(bob27.isEliminated).toBe(true);
        expect(bob27.hand).toHaveLength(0);
        expect(res27_2.nextState.setAsideCards?.length).toBeGreaterThanOrEqual(27);
        assertValidNoMercyGameState(res27_2.nextState);
      });

      it('evaluates hand sizes at 25 (active) and 26 (eliminated) via normal 1-card draw', () => {
        // Player with 24 cards draws 1 card -> 25 cards -> Active!
        let state24 = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: 1, // P1 starts
          players: [
            { id: 'p1', username: 'Alice' },
            { id: 'p2', username: 'Bob' },
          ],
        });
        state24 = NoMercyFixtureBuilder.setHandSize(state24, 'p1', 24);
        const res1 = NoMercyActionProcessor.process(state24, { type: 'DRAW_CARD', playerId: 'p1' });
        const p1After25 = res1.nextState.players.find((p) => p.id === 'p1')!;
        expect(p1After25.isEliminated).toBe(false);
        expect(p1After25.hand).toHaveLength(25);
        assertValidNoMercyGameState(res1.nextState);

        // Player with 25 cards draws 1 card -> 26 cards -> Eliminated!
        let state25 = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: 1, // P1 starts
          players: [
            { id: 'p1', username: 'Alice' },
            { id: 'p2', username: 'Bob' },
          ],
        });
        state25 = NoMercyFixtureBuilder.setHandSize(state25, 'p1', 25);
        const res2 = NoMercyActionProcessor.process(state25, { type: 'DRAW_CARD', playerId: 'p1' });
        const p1After26 = res2.nextState.players.find((p) => p.id === 'p1')!;
        expect(p1After26.isEliminated).toBe(true);
        expect(p1After26.hand).toHaveLength(0);
        assertValidNoMercyGameState(res2.nextState);
      });
    });

    describe('B. Standard Wild Color Change Mechanics', () => {
      it('supports choosing red, yellow, green, and blue with normal turn progression and zero penalties', () => {
        const colors = ['red', 'yellow', 'green', 'blue'] as const;
        for (const chosenColor of colors) {
          const state = NoMercyFixtureBuilder.createInitialGameFixture({
            dealerIndex: 1, // P1 starts
            players: [
              { id: 'p1', username: 'Alice' },
              { id: 'p2', username: 'Bob' },
            ],
          });

          const { nextState: s1, card: wildCard } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'wild');
          const res = NoMercyActionProcessor.process(s1, {
            type: 'PLAY_CARD',
            playerId: 'p1',
            cardId: wildCard.id,
            chosenColor,
          });

          expect(res.nextState.pendingActionState).toBeNull();
          expect(res.nextState.activeColor).toBe(chosenColor);
          expect(res.nextState.topDiscardCard.id).toBe(wildCard.id);
          expect(res.nextState.topDiscardCard.value).toBe('wild');
          expect(res.nextState.currentPlayerIndex).toBe(1); // Bob
          expect(res.nextState.players[1].hand).toHaveLength(7); // Zero penalty
          assertValidNoMercyGameState(res.nextState);
        }
      });
    });

    describe('C. Wild Draw 4 + Wild Reverse Draw 4 Stacking Bug Fix & Edge Cases', () => {
      it('Edge case 1: Wild Draw 4 followed by Wild Reverse Draw 4 in 3-player match targets Player A (Alice) with 8 cards, and turn advances in reversed direction', () => {
        const state = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: 2,
          players: [
            { id: 'p1', username: 'Alice' },
            { id: 'p2', username: 'Bob' },
            { id: 'p3', username: 'Charlie' },
          ],
        });

        // Alice plays Draw Four on Bob
        const { nextState: s1, card: d4 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'draw_four', state.activeColor ?? 'blue');
        const res1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d4.id });

        // Bob stacks Wild Reverse Draw 4
        const { nextState: s2, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(res1.nextState, 'p2', 'wild_reverse_draw_four');
        const res2 = NoMercyActionProcessor.process(s2, {
          type: 'PLAY_CARD',
          playerId: 'p2',
          cardId: wrd4.id,
          chosenColor: 'red',
        });

        expect(res2.nextState.turnDirection).toBe('counter_clockwise');
        expect(res2.nextState.pendingActionState?.accumulatedPenalty).toBe(8);
        // Case 2 (3+ players): Alice receives the 8 cards. Bob does NOT receive the penalty!
        expect(res2.nextState.pendingActionState?.targetPlayerId).toBe('p1');
        expect(res2.nextState.currentPlayerIndex).toBe(0);

        // Alice accepts the penalty: draws 8 cards, hand was 6 cards -> 14 cards (active)
        const res3 = NoMercyActionProcessor.process(res2.nextState, { type: 'ACCEPT_STACK_PENALTY', playerId: 'p1' });
        const alice = res3.nextState.players.find((p) => p.id === 'p1')!;
        expect(alice.isEliminated).toBe(false);
        expect(alice.hand).toHaveLength(14);
        expect(res3.nextState.pendingActionState).toBeNull();
        // Turn advances in counter_clockwise direction from Alice (idx 0) to Charlie (idx 2)
        expect(res3.nextState.currentPlayerIndex).toBe(2);
        assertValidNoMercyGameState(res3.nextState);
      });

      it('Edge case 1b: Wild Draw 4 followed by Wild Reverse Draw 4 in 2-player match targets Player B (Bob) with 8 cards, and turn advances in reversed direction', () => {
        const state = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: 1,
          players: [
            { id: 'p1', username: 'Alice' },
            { id: 'p2', username: 'Bob' },
          ],
        });

        // Alice plays Draw Four on Bob
        const { nextState: s1, card: d4 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'draw_four', state.activeColor ?? 'blue');
        const res1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d4.id });

        // Bob stacks Wild Reverse Draw 4
        const { nextState: s2, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(res1.nextState, 'p2', 'wild_reverse_draw_four');
        const res2 = NoMercyActionProcessor.process(s2, {
          type: 'PLAY_CARD',
          playerId: 'p2',
          cardId: wrd4.id,
          chosenColor: 'red',
        });

        expect(res2.nextState.turnDirection).toBe('counter_clockwise');
        expect(res2.nextState.pendingActionState?.accumulatedPenalty).toBe(8);
        // Case 1 (2 players): Bob receives the 8 cards
        expect(res2.nextState.pendingActionState?.targetPlayerId).toBe('p2');
        expect(res2.nextState.currentPlayerIndex).toBe(1);

        // Bob accepts the penalty: draws 8 cards, hand was 6 cards -> 14 cards (active)
        const res3 = NoMercyActionProcessor.process(res2.nextState, { type: 'ACCEPT_STACK_PENALTY', playerId: 'p2' });
        const bob = res3.nextState.players.find((p) => p.id === 'p2')!;
        expect(bob.isEliminated).toBe(false);
        expect(bob.hand).toHaveLength(14);
        expect(res3.nextState.pendingActionState).toBeNull();
        // Turn advances in counter_clockwise direction from Bob (idx 1) to Alice (idx 0)
        expect(res3.nextState.currentPlayerIndex).toBe(0);
        assertValidNoMercyGameState(res3.nextState);
      });

      it('Edge case 2: Wild Reverse Draw 4 used without an existing penalty functions normally', () => {
        // 2-player: Reverse rebounds to self
        const state2 = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: 1,
          players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }],
        });
        const { nextState: s2_1, card: wrd4_2 } = NoMercyFixtureBuilder.injectPlayableCard(state2, 'p1', 'wild_reverse_draw_four');
        const res2_1 = NoMercyActionProcessor.process(s2_1, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4_2.id, chosenColor: 'blue' });
        expect(res2_1.nextState.pendingActionState?.targetPlayerId).toBe('p1');
        expect(res2_1.nextState.pendingActionState?.accumulatedPenalty).toBe(4);

        // 3-player: Reverse changes direction and targets next player in new direction
        const state3 = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: 2,
          players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }, { id: 'p3', username: 'Charlie' }],
        });
        const { nextState: s3_1, card: wrd4_3 } = NoMercyFixtureBuilder.injectPlayableCard(state3, 'p1', 'wild_reverse_draw_four');
        const res3_1 = NoMercyActionProcessor.process(s3_1, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4_3.id, chosenColor: 'yellow' });
        expect(res3_1.nextState.turnDirection).toBe('counter_clockwise');
        expect(res3_1.nextState.pendingActionState?.targetPlayerId).toBe('p3');
        expect(res3_1.nextState.pendingActionState?.accumulatedPenalty).toBe(4);
      });

      it('Edge cases 3 & 4: Multiple stacked draw cards and Wild Reverse Draw 4 followed by another stack', () => {
        const state = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: 2,
          players: [
            { id: 'p1', username: 'Alice' },
            { id: 'p2', username: 'Bob' },
            { id: 'p3', username: 'Charlie' },
          ],
        });

        // 1. Alice plays Draw Four on Bob (+4)
        const { nextState: s1, card: d4 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'draw_four', state.activeColor ?? 'blue');
        const r1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d4.id });

        // 2. Bob stacks Wild Reverse Draw 4 -> In 3 players, reverses to counter_clockwise and targets Alice with +8
        const { nextState: s2, card: wrd4_1 } = NoMercyFixtureBuilder.injectPlayableCard(r1.nextState, 'p2', 'wild_reverse_draw_four');
        const r2 = NoMercyActionProcessor.process(s2, { type: 'PLAY_CARD', playerId: 'p2', cardId: wrd4_1.id, chosenColor: 'red' });
        expect(r2.nextState.pendingActionState?.targetPlayerId).toBe('p1');
        expect(r2.nextState.pendingActionState?.accumulatedPenalty).toBe(8);

        // 3. Alice stacks Wild Draw Six (+6 >= 4) -> Passes 8 + 6 = 14 to Charlie (counter_clockwise from Alice)
        const { nextState: s3, card: wd6 } = NoMercyFixtureBuilder.injectPlayableCard(r2.nextState, 'p1', 'wild_draw_six');
        const r3 = NoMercyActionProcessor.process(s3, { type: 'PLAY_CARD', playerId: 'p1', cardId: wd6.id, chosenColor: 'green' });
        expect(r3.nextState.pendingActionState?.targetPlayerId).toBe('p3');
        expect(r3.nextState.pendingActionState?.accumulatedPenalty).toBe(14);

        // 4. Charlie stacks Wild Draw Ten (+10 >= 6) -> Passes 14 + 10 = 24 to Bob (counter_clockwise from Charlie)
        const { nextState: s4, card: wd10 } = NoMercyFixtureBuilder.injectPlayableCard(r3.nextState, 'p3', 'wild_draw_ten');
        const r4 = NoMercyActionProcessor.process(s4, { type: 'PLAY_CARD', playerId: 'p3', cardId: wd10.id, chosenColor: 'blue' });
        expect(r4.nextState.pendingActionState?.targetPlayerId).toBe('p2');
        expect(r4.nextState.pendingActionState?.accumulatedPenalty).toBe(24);

        // 5. Bob accepts the 24 cards: had 7 cards, now 7 + 24 = 31 > 25 -> Eliminated!
        const r5 = NoMercyActionProcessor.process(r4.nextState, { type: 'ACCEPT_STACK_PENALTY', playerId: 'p2' });
        const bob = r5.nextState.players.find((p) => p.id === 'p2')!;
        expect(bob.isEliminated).toBe(true);
        expect(r5.nextState.eliminatedPlayerIds).toContain('p2');
        assertValidNoMercyGameState(r5.nextState);
      });

      it('Edge cases 5, 6, 7: Wild Draw 4 + Wild Reverse Draw 4 in 2, 3, and 4 player matches', () => {
        // 2-Player Match: Player B receives the penalty (Case 1)
        const st2 = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: 1,
          players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }],
        });
        const { nextState: st2_1, card: d4_2 } = NoMercyFixtureBuilder.injectPlayableCard(st2, 'p1', 'draw_four', st2.activeColor ?? 'blue');
        const r2_1 = NoMercyActionProcessor.process(st2_1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d4_2.id });
        const { nextState: st2_2, card: wrd4_p2 } = NoMercyFixtureBuilder.injectPlayableCard(r2_1.nextState, 'p2', 'wild_reverse_draw_four');
        const r2_2 = NoMercyActionProcessor.process(st2_2, { type: 'PLAY_CARD', playerId: 'p2', cardId: wrd4_p2.id, chosenColor: 'red' });
        expect(r2_2.nextState.pendingActionState?.targetPlayerId).toBe('p2');
        expect(r2_2.nextState.pendingActionState?.accumulatedPenalty).toBe(8);

        // 3-Player Match: Player A receives the penalty (Case 2)
        const st3 = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: 2,
          players: [
            { id: 'p1', username: 'Alice' },
            { id: 'p2', username: 'Bob' },
            { id: 'p3', username: 'Charlie' },
          ],
        });
        const { nextState: st3_1, card: d4_3 } = NoMercyFixtureBuilder.injectPlayableCard(st3, 'p1', 'draw_four', st3.activeColor ?? 'blue');
        const r3_1 = NoMercyActionProcessor.process(st3_1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d4_3.id });
        const { nextState: st3_2, card: wrd4_3 } = NoMercyFixtureBuilder.injectPlayableCard(r3_1.nextState, 'p2', 'wild_reverse_draw_four');
        const r3_2 = NoMercyActionProcessor.process(st3_2, { type: 'PLAY_CARD', playerId: 'p2', cardId: wrd4_3.id, chosenColor: 'yellow' });
        expect(r3_2.nextState.pendingActionState?.targetPlayerId).toBe('p1');
        expect(r3_2.nextState.pendingActionState?.accumulatedPenalty).toBe(8);
        expect(r3_2.nextState.turnDirection).toBe('counter_clockwise');

        // 4-Player Match: Player A receives the penalty (Case 2)
        const st4 = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: 3, // P1 starts
          players: [
            { id: 'p1', username: 'Alice' },
            { id: 'p2', username: 'Bob' },
            { id: 'p3', username: 'Charlie' },
            { id: 'p4', username: 'Diana' },
          ],
        });
        const { nextState: st4_1, card: d4_4 } = NoMercyFixtureBuilder.injectPlayableCard(st4, 'p1', 'draw_four', st4.activeColor ?? 'blue');
        const r4_1 = NoMercyActionProcessor.process(st4_1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d4_4.id });
        const { nextState: st4_2, card: wrd4_4 } = NoMercyFixtureBuilder.injectPlayableCard(r4_1.nextState, 'p2', 'wild_reverse_draw_four');
        const r4_2 = NoMercyActionProcessor.process(st4_2, { type: 'PLAY_CARD', playerId: 'p2', cardId: wrd4_4.id, chosenColor: 'green' });
        expect(r4_2.nextState.pendingActionState?.targetPlayerId).toBe('p1');
        expect(r4_2.nextState.pendingActionState?.accumulatedPenalty).toBe(8);
        expect(r4_2.nextState.turnDirection).toBe('counter_clockwise');
      });

      it('Edge cases 8 & 9: Penalty recipient reaches exactly 25 cards (active) vs exceeds 25 cards (eliminated)', () => {
        // Recipient reaches exactly 25 cards (tested in 2-player mode where Bob receives 8)
        let sExact = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: 1,
          players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }],
        });
        // Bob hand size 18: plays 1 card (17), receives 8 cards penalty -> 17 + 8 = 25 cards!
        sExact = NoMercyFixtureBuilder.setHandSize(sExact, 'p2', 18);
        const { nextState: se1, card: d4_e } = NoMercyFixtureBuilder.injectPlayableCard(sExact, 'p1', 'draw_four', sExact.activeColor ?? 'blue');
        const re1 = NoMercyActionProcessor.process(se1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d4_e.id });
        const { nextState: se2, card: wrd4_e } = NoMercyFixtureBuilder.injectPlayableCard(re1.nextState, 'p2', 'wild_reverse_draw_four');
        const re2 = NoMercyActionProcessor.process(se2, { type: 'PLAY_CARD', playerId: 'p2', cardId: wrd4_e.id, chosenColor: 'red' });
        const re3 = NoMercyActionProcessor.process(re2.nextState, { type: 'ACCEPT_STACK_PENALTY', playerId: 'p2' });
        const bobExact = re3.nextState.players.find((p) => p.id === 'p2')!;
        expect(bobExact.isEliminated).toBe(false);
        expect(bobExact.hand).toHaveLength(25); // Exactly 25 -> ACTIVE!

        // Recipient exceeds 25 cards (e.g. 26 cards in 3-player mode where Alice receives 8)
        let sExceed = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: 2,
          players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }, { id: 'p3', username: 'Charlie' }],
        });
        // Alice hand size 19: plays 1 card (18), receives 8 cards penalty -> 18 + 8 = 26 cards!
        sExceed = NoMercyFixtureBuilder.setHandSize(sExceed, 'p1', 19);
        const { nextState: sx1, card: d4_x } = NoMercyFixtureBuilder.injectPlayableCard(sExceed, 'p1', 'draw_four', sExceed.activeColor ?? 'blue');
        const rx1 = NoMercyActionProcessor.process(sx1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d4_x.id });
        const { nextState: sx2, card: wrd4_x } = NoMercyFixtureBuilder.injectPlayableCard(rx1.nextState, 'p2', 'wild_reverse_draw_four');
        const rx2 = NoMercyActionProcessor.process(sx2, { type: 'PLAY_CARD', playerId: 'p2', cardId: wrd4_x.id, chosenColor: 'yellow' });
        // In 3-player match, Alice is the penalty recipient!
        expect(rx2.nextState.pendingActionState?.targetPlayerId).toBe('p1');
        const rx3 = NoMercyActionProcessor.process(rx2.nextState, { type: 'ACCEPT_STACK_PENALTY', playerId: 'p1' });
        const aliceExceed = rx3.nextState.players.find((p) => p.id === 'p1')!;
        expect(aliceExceed.isEliminated).toBe(true);
        expect(aliceExceed.hand).toHaveLength(0); // Eliminated and hand set aside
        expect(rx3.nextState.eliminatedPlayerIds).toContain('p1');
      });

      it('Edge case 10: Rejects invalid or duplicate Accept Cards requests idempotently', () => {
        const state = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: 2,
          players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }, { id: 'p3', username: 'Charlie' }],
        });
        const { nextState: s1, card: d4 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'draw_four', state.activeColor ?? 'blue');
        const r1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d4.id });

        // Non-targeted player Charlie tries to accept penalty -> REJECTED!
        expect(() => {
          NoMercyActionProcessor.process(r1.nextState, { type: 'ACCEPT_STACK_PENALTY', playerId: 'p3' });
        }).toThrow(/Only the targeted player may accept/);

        // Targeted player Bob accepts penalty -> Resolves successfully
        const r2 = NoMercyActionProcessor.process(r1.nextState, { type: 'ACCEPT_STACK_PENALTY', playerId: 'p2' });
        expect(r2.nextState.pendingActionState).toBeNull();

        // Duplicate accept when no penalty is pending -> REJECTED!
        expect(() => {
          NoMercyActionProcessor.process(r2.nextState, { type: 'ACCEPT_STACK_PENALTY', playerId: 'p2' });
        }).toThrow(/ACCEPT_STACK_PENALTY/);
      });
    });
  });
});
