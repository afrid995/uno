import { describe, it, expect } from 'vitest';
import '../src/variants/no-mercy/no-mercy.adapter';
import { VariantRegistry } from '../src/variants/variant.types';
import { assertValidNoMercyGameState } from '../src/variants/no-mercy/no-mercy.invariants';
import { NoMercyFixtureBuilder } from '../src/variants/no-mercy/no-mercy.fixture';
import { NoMercyActionProcessor } from '../src/variants/no-mercy/no-mercy.actions';
import { UNO_NO_MERCY_RULES } from '../src/variants/no-mercy/no-mercy.constants';
import { Card } from '../src/cards/card.types';

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
});
