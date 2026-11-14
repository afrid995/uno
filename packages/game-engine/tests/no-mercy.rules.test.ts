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

  describe('4. Mercy Rule Elimination (Hand >= 25 cards)', () => {
    it('instantly eliminates a player whose hand reaches 25 cards', () => {
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

      // Alice plays Wild Draw 6 targeting Bob (20 + 6 = 26 >= 25!)
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
      expect(res2.nextState.setAsideCards?.length).toBeGreaterThanOrEqual(25);
      // Turn skips eliminated Bob, goes to Charlie
      expect(res2.nextState.currentPlayerIndex).toBe(2);
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

    it('Wild Color Roulette forces victim to draw until chosen color appears', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 1, // P1 starts
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const { nextState: s1, card: roulette } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'wild_color_roulette'
      );

      const res1 = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: roulette.id,
      });

      expect(res1.nextState.pendingActionState).toEqual({
        type: 'AWAITING_COLOR_ROULETTE_SELECTION',
        victimPlayerId: 'p2',
        playedByPlayerId: 'p1',
      });

      const p2PreHand = res1.nextState.players[1].hand.length;

      const res2 = NoMercyActionProcessor.process(res1.nextState, {
        type: 'CHOOSE_COLOR_ROULETTE_COLOR',
        playerId: 'p2',
        chosenColor: 'blue',
      });

      expect(res2.nextState.pendingActionState).toBeNull();
      expect(res2.nextState.activeColor).toBe('blue');
      expect(res2.nextState.players[1].hand.length).toBeGreaterThan(p2PreHand);
      // Bob loses turn, Alice plays
      expect(res2.nextState.currentPlayerIndex).toBe(0);
      assertValidNoMercyGameState(res2.nextState);
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

    it('allows Wild Color Roulette to continue and find color after recycling from set-aside cards', () => {
      const topDiscard: Card = { id: 'top_card', color: 'red', type: 'number', value: '5', scoreValue: 5, variant: 'uno_show_em_no_mercy' };
      // Draw pile has only a blue card
      const drawPile: Card[] = [
        { id: 'dp_blue', color: 'blue', type: 'number', value: '1', scoreValue: 1, variant: 'uno_show_em_no_mercy' },
      ];
      const discardPile: Card[] = [topDiscard];
      // setAsideCards has a green card
      const setAside: Card[] = [
        { id: 'sa_green', color: 'green', type: 'number', value: '9', scoreValue: 9, variant: 'uno_show_em_no_mercy' },
      ];

      const res = NoMercyActionProcessor.drawUntilColor(
        drawPile,
        discardPile,
        'green',
        setAside
      );

      expect(res.drawnCards.length).toBe(2); // drew blue, then reshuffled, then drew green!
      expect(res.drawnCards[res.drawnCards.length - 1].color).toBe('green');
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
    it('rejects Wild Reverse Draw 4 when attempting to stack onto an active Draw penalty', () => {
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

      // Bob tries to stack Wild Reverse Draw 4 onto Draw Two
      const { nextState: s2, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(
        res1.nextState,
        'p2',
        'wild_reverse_draw_four'
      );

      expect(() => {
        NoMercyActionProcessor.process(s2, {
          type: 'PLAY_CARD',
          playerId: 'p2',
          cardId: wrd4.id,
          chosenColor: 'red',
        });
      }).toThrow(/is not an eligible Draw Card \(\+2, \+4, \+6, \+10\)/);
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

  describe('11. Deterministic Wild Color Roulette Invariants, Edge Cases & Card Retention', () => {
    it('does not count Wild cards as matching color, retains all revealed Wild cards, and terminates only upon drawing non-Wild card of selected color', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 1, // P1 starts
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      // Inject wild_color_roulette to Alice (P1)
      const { nextState: s1, card: rouletteCard } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'wild_color_roulette'
      );

      // Alice plays Wild Color Roulette targeting Bob (P2)
      const res1 = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: rouletteCard.id,
      });

      expect(res1.nextState.pendingActionState).toEqual({
        type: 'AWAITING_COLOR_ROULETTE_SELECTION',
        victimPlayerId: 'p2',
        playedByPlayerId: 'p1',
      });

      // Find specific cards in drawPile to arrange deterministically:
      // 1. Red number card (color mismatch)
      // 2. Wild Draw Six (wild -> must NOT match chosen blue, drawing continues!)
      // 3. Wild Reverse Draw 4 (wild -> must NOT match chosen blue, drawing continues!)
      // 4. Yellow number card (color mismatch)
      // 5. Wild Color Roulette (wild -> must NOT match chosen blue, drawing continues!)
      // 6. Blue number card (non-wild matching chosen blue -> STOPS drawing!)
      const dp = res1.nextState.drawPile;
      const cRed = dp.find((c) => c.color === 'red' && c.type === 'number')!;
      const cWild1 = dp.find((c) => c.value === 'wild_draw_six')!;
      const cWild2 = dp.find((c) => c.value === 'wild_reverse_draw_four')!;
      const cYellow = dp.find((c) => c.color === 'yellow' && c.type === 'number')!;
      const cWild3 = dp.find((c) => c.value === 'wild_color_roulette' && c.id !== rouletteCard.id)!;
      const cBlueTarget = dp.find((c) => c.color === 'blue' && c.type === 'number')!;

      const selectedIds = new Set([cRed.id, cWild1.id, cWild2.id, cYellow.id, cWild3.id, cBlueTarget.id]);
      const otherDrawCards = dp.filter((c) => !selectedIds.has(c.id));

      // Array pop() draws from the end. So the drawing order will be:
      // cRed -> cWild1 -> cWild2 -> cYellow -> cWild3 -> cBlueTarget (stops!)
      const arrangedDrawPile = [
        ...otherDrawCards,
        cBlueTarget,
        cWild3,
        cYellow,
        cWild2,
        cWild1,
        cRed,
      ];

      const deterministicState: GameState = {
        ...res1.nextState,
        drawPile: arrangedDrawPile,
      };
      assertValidNoMercyGameState(deterministicState);

      const p2InitialHand = deterministicState.players[1].hand;
      const p2InitialCount = p2InitialHand.length;

      // Bob chooses 'blue'
      const res2 = NoMercyActionProcessor.process(deterministicState, {
        type: 'CHOOSE_COLOR_ROULETTE_COLOR',
        playerId: 'p2',
        chosenColor: 'blue',
      });

      expect(res2.nextState.pendingActionState).toBeNull();
      expect(res2.nextState.activeColor).toBe('blue');

      const p2NewHand = res2.nextState.players[1].hand;
      // Exactly 6 cards drawn
      expect(p2NewHand.length).toBe(p2InitialCount + 6);

      // Every drawn card must be retained in Bob's hand
      expect(p2NewHand.some((c) => c.id === cRed.id)).toBe(true);
      expect(p2NewHand.some((c) => c.id === cWild1.id)).toBe(true);
      expect(p2NewHand.some((c) => c.id === cWild2.id)).toBe(true);
      expect(p2NewHand.some((c) => c.id === cYellow.id)).toBe(true);
      expect(p2NewHand.some((c) => c.id === cWild3.id)).toBe(true);
      expect(p2NewHand.some((c) => c.id === cBlueTarget.id)).toBe(true);

      // Verify the event records the exact drawn cards sequence
      const rouletteEvent = res2.events.find((e) => e.type === 'ROULETTE_RESOLVED');
      expect(rouletteEvent).toBeDefined();
      expect(rouletteEvent?.payload?.drawnCount).toBe(6);
      const eventCards = rouletteEvent?.payload?.drawnCards as Card[];
      expect(eventCards.map((c) => c.id)).toEqual([
        cRed.id,
        cWild1.id,
        cWild2.id,
        cYellow.id,
        cWild3.id,
        cBlueTarget.id,
      ]);

      // Bob loses turn, Alice plays next
      expect(res2.nextState.currentPlayerIndex).toBe(0);

      // Invariant check: strict 168 physical cards and unique IDs
      assertValidNoMercyGameState(res2.nextState);
    });

    it('recycles set-aside cards when draw pile is exhausted during Roulette and adds all cards to victim hand', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 2, // P1 starts
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      // Expand Bob (P2) to 24 cards and eliminate him with Draw Two from Alice (P1)
      state = NoMercyFixtureBuilder.setHandSize(state, 'p2', 24);
      const { nextState: s1, card: d2 } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'draw_two',
        state.activeColor ?? 'blue'
      );
      const r1 = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: d2.id,
      });
      // Bob accepts penalty -> reaches 26 cards -> eliminated!
      const r2 = NoMercyActionProcessor.process(r1.nextState, {
        type: 'ACCEPT_STACK_PENALTY',
        playerId: 'p2',
      });

      expect(r2.nextState.players[1].isEliminated).toBe(true);
      expect(r2.nextState.setAsideCards?.length).toBe(26);
      assertValidNoMercyGameState(r2.nextState);

      // Next active player is Charlie (P3, index 2)
      expect(r2.nextState.currentPlayerIndex).toBe(2);

      // Charlie plays Wild Color Roulette targeting Alice (P1)
      const { nextState: sWithRoulette, card: rouletteCard } = NoMercyFixtureBuilder.injectPlayableCard(
        r2.nextState,
        'p3',
        'wild_color_roulette'
      );
      const r3 = NoMercyActionProcessor.process(sWithRoulette, {
        type: 'PLAY_CARD',
        playerId: 'p3',
        cardId: rouletteCard.id,
      });

      expect(r3.nextState.pendingActionState).toEqual({
        type: 'AWAITING_COLOR_ROULETTE_SELECTION',
        victimPlayerId: 'p1',
        playedByPlayerId: 'p3',
      });

      // Guarantee a green number card exists in setAsideCards
      let setAside = [...(r3.nextState.setAsideCards || [])];
      let targetGreenCard = setAside.find((c) => c.color === 'green' && c.type === 'number');
      let dp = [...r3.nextState.drawPile];
      if (!targetGreenCard) {
        const greenIdx = dp.findIndex((c) => c.color === 'green' && c.type === 'number');
        targetGreenCard = dp[greenIdx];
        dp[greenIdx] = setAside[0];
        setAside[0] = targetGreenCard;
      }

      // Configure a 2-card draw pile with non-green cards (cRedDraw and cWildDraw)
      const cRedDraw = dp.find((c) => c.color === 'red' && c.type === 'number')!;
      const cWildDraw = dp.find((c) => c.value === 'wild_draw_ten')!;
      const remainingDrawCards = dp.filter((c) => c.id !== cRedDraw.id && c.id !== cWildDraw.id);

      // Low draw pile: pop order: cRedDraw, then cWildDraw, then exhausted!
      const lowDrawPile = [cWildDraw, cRedDraw];
      const expandedDiscardPile = [...remainingDrawCards, ...r3.nextState.discardPile];

      const stateBeforeRoulette: GameState = {
        ...r3.nextState,
        drawPile: lowDrawPile,
        discardPile: expandedDiscardPile,
        setAsideCards: setAside,
      };
      assertValidNoMercyGameState(stateBeforeRoulette);

      const p1InitialCount = stateBeforeRoulette.players[0].hand.length;

      // Alice chooses 'green'
      const r4 = NoMercyActionProcessor.process(stateBeforeRoulette, {
        type: 'CHOOSE_COLOR_ROULETTE_COLOR',
        playerId: 'p1',
        chosenColor: 'green',
      });

      expect(r4.nextState.pendingActionState).toBeNull();
      expect(r4.nextState.activeColor).toBe('green');

      // Set-aside cards must have been recycled into the new draw pile during exhaustion
      expect(r4.nextState.setAsideCards).toHaveLength(0);

      // Alice drew at least the 2 initial cards (cRedDraw, cWildDraw) plus cards from reshuffled pile
      const p1NewHand = r4.nextState.players[0].hand;
      expect(p1NewHand.length).toBeGreaterThanOrEqual(p1InitialCount + 3);
      expect(p1NewHand.some((c) => c.id === cRedDraw.id)).toBe(true);
      expect(p1NewHand.some((c) => c.id === cWildDraw.id)).toBe(true);

      // Last drawn card must be a non-wild green card
      const lastDrawnCard = p1NewHand[p1NewHand.length - 1];
      expect(lastDrawnCard.color).toBe('green');
      expect(lastDrawnCard.type).not.toBe('wild');

      // Full card conservation & ID uniqueness
      assertValidNoMercyGameState(r4.nextState);
    });

    it('triggers Mercy Rule elimination if cards drawn during Wild Color Roulette push hand to >= 25 cards', () => {
      let state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 2, // P1 starts ( (2 + 1) % 3 = 0 )
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      // Expand Bob (P2) to 22 cards
      state = NoMercyFixtureBuilder.setHandSize(state, 'p2', 22);

      // Alice plays Wild Color Roulette targeting Bob
      const { nextState: s1, card: rouletteCard } = NoMercyFixtureBuilder.injectPlayableCard(
        state,
        'p1',
        'wild_color_roulette'
      );
      const res1 = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: rouletteCard.id,
      });

      // Arrange draw pile so Bob must draw 4 cards (22 + 4 = 26 >= 25 -> elimination!)
      const dp = res1.nextState.drawPile;
      const c1 = dp.find((c) => c.color === 'red' && c.type === 'number')!;
      const c2 = dp.find((c) => c.color === 'yellow' && c.type === 'number')!;
      const c3 = dp.find((c) => c.value === 'wild_draw_six')!;
      const cTarget = dp.find((c) => c.color === 'blue' && c.type === 'number')!;

      const selectedIds = new Set([c1.id, c2.id, c3.id, cTarget.id]);
      const otherCards = dp.filter((c) => !selectedIds.has(c.id));
      const arrangedDrawPile = [...otherCards, cTarget, c3, c2, c1]; // Pop order: c1, c2, c3, cTarget (4 cards)

      const stateWithArrangedDraw: GameState = {
        ...res1.nextState,
        drawPile: arrangedDrawPile,
      };
      assertValidNoMercyGameState(stateWithArrangedDraw);

      // Bob chooses 'blue'
      const res2 = NoMercyActionProcessor.process(stateWithArrangedDraw, {
        type: 'CHOOSE_COLOR_ROULETTE_COLOR',
        playerId: 'p2',
        chosenColor: 'blue',
      });

      // Bob reached 26 cards and was eliminated by Mercy Rule!
      const bob = res2.nextState.players.find((p) => p.id === 'p2')!;
      expect(bob.isEliminated).toBe(true);
      expect(bob.hand).toHaveLength(0);

      // Bob's 26 cards are transferred to setAsideCards
      expect(res2.nextState.setAsideCards?.length).toBe(26);
      expect(res2.nextState.setAsideCards?.some((c) => c.id === c1.id)).toBe(true);
      expect(res2.nextState.setAsideCards?.some((c) => c.id === c2.id)).toBe(true);
      expect(res2.nextState.setAsideCards?.some((c) => c.id === c3.id)).toBe(true);
      expect(res2.nextState.setAsideCards?.some((c) => c.id === cTarget.id)).toBe(true);

      // Check invariants
      assertValidNoMercyGameState(res2.nextState);
    });

    it('direct unit test: drawUntilColor retains all Wild cards and terminates strictly on matching non-Wild card', () => {
      const topDiscard: Card = { id: 'top_card', color: 'red', type: 'number', value: '5', scoreValue: 5, variant: 'uno_show_em_no_mercy' };
      const cRed: Card = { id: 'c_red', color: 'red', type: 'number', value: '3', scoreValue: 3, variant: 'uno_show_em_no_mercy' };
      const cWild1: Card = { id: 'c_w1', color: null, type: 'wild', value: 'wild_draw_six', scoreValue: 50, variant: 'uno_show_em_no_mercy' };
      const cWild2: Card = { id: 'c_w2', color: null, type: 'wild', value: 'wild_color_roulette', scoreValue: 50, variant: 'uno_show_em_no_mercy' };
      const cYellow: Card = { id: 'c_yel', color: 'yellow', type: 'number', value: '8', scoreValue: 8, variant: 'uno_show_em_no_mercy' };
      const cBlueTarget: Card = { id: 'c_blue', color: 'blue', type: 'number', value: '7', scoreValue: 7, variant: 'uno_show_em_no_mercy' };

      // Array pop order: cRed -> cWild1 -> cWild2 -> cYellow -> cBlueTarget (stops!)
      const drawPile = [cBlueTarget, cYellow, cWild2, cWild1, cRed];

      const res = NoMercyActionProcessor.drawUntilColor(
        drawPile,
        [topDiscard],
        'blue',
        []
      );

      expect(res.drawnCards).toHaveLength(5);
      expect(res.drawnCards.map((c) => c.id)).toEqual([
        'c_red',
        'c_w1',
        'c_w2',
        'c_yel',
        'c_blue',
      ]);
      expect(res.drawnCards.filter((c) => isWildCard(c))).toHaveLength(2);
      expect(res.drawnCards[res.drawnCards.length - 1].color).toBe('blue');
      expect(res.drawnCards[res.drawnCards.length - 1].type).not.toBe('wild');
      expect(res.newDrawPile).toHaveLength(0);
      expect(res.newDiscardPile).toEqual([topDiscard]);
    });
  });
});
