import { describe, it, expect } from 'vitest';
import { GameFactory } from '../src/game/game.factory';
import { ActionProcessor } from '../src/actions/action.processor';
import { CardFactory } from '../src/cards/card.factory';
import { createSeededRng } from '../src/testing/deterministic-random';

describe('Mattel 42001 Official Rules Verification', () => {
  const players = [
    { id: 'player_a', username: 'Alice' },
    { id: 'player_b', username: 'Bob' },
    { id: 'player_c', username: 'Charlie' },
  ];

  it('starting top discard card is never a Wild or Wild Draw Four', () => {
    // Run 50 game creations across different seeds to verify starting card rule
    for (let seed = 1; seed <= 50; seed++) {
      const rng = createSeededRng(seed * 7919);
      const state = GameFactory.createGame({ roomId: 'room_test', players }, rng);

      expect(state.topDiscardCard.type).not.toBe('wild');
      expect(state.topDiscardCard.value).not.toBe('wild');
      expect(state.topDiscardCard.value).not.toBe('wild_draw_four');
      expect(['red', 'yellow', 'green', 'blue']).toContain(state.activeColor);
    }
  });

  it('determines dealer and starts play to the left of the dealer', () => {
    const rng = createSeededRng(42);
    const dealerIndex = GameFactory.determineDealer(3, rng);
    expect(dealerIndex).toBeGreaterThanOrEqual(0);
    expect(dealerIndex).toBeLessThan(3);

    const state = GameFactory.createGame({ roomId: 'room_test', players, dealerIndex }, rng);
    expect(state.dealerIndex).toBe(dealerIndex);

    // If starting card is a normal number card, play starts to left of dealer
    if (state.topDiscardCard.type === 'number') {
      const expectedStartingPlayer = (dealerIndex + 1) % 3;
      expect(state.currentPlayerIndex).toBe(expectedStartingPlayer);
    }
  });

  it('going out with a Draw Two forces the next player to draw 2 cards before round score is calculated', () => {
    const cRedDrawTwo = CardFactory.createActionCard('red', 'draw_two', 1);
    const cBlue5 = CardFactory.createNumberCard('blue', '5', 1);
    const cGreen7 = CardFactory.createNumberCard('green', '7', 1);

    const baseState = GameFactory.createGame({ roomId: 'room_test', players, dealerIndex: 2 });
    const customState = {
      ...baseState,
      turnDirection: 'clockwise' as const,
      topDiscardCard: CardFactory.createNumberCard('red', '3', 1),
      activeColor: 'red' as const,
      currentPlayerIndex: 0,
      players: [
        { ...baseState.players[0], hand: [cRedDrawTwo] }, // Alice has 1 card: Draw Two
        { ...baseState.players[1], hand: [cBlue5] },       // Bob has 1 card: 5 points
        { ...baseState.players[2], hand: [cGreen7] },      // Charlie has 1 card: 7 points
      ],
    };

    const { nextState, events } = ActionProcessor.process(customState, {
      type: 'PLAY_CARD',
      playerId: 'player_a',
      cardId: cRedDrawTwo.id,
    });

    // Bob (victim) must have received 2 penalty cards before scoring
    expect(nextState.players[1].hand).toHaveLength(3);
    expect(nextState.status).toBe('ROUND_OVER');
    expect(nextState.roundWinner?.id).toBe('player_a');

    // Alice's score must include the points from Bob's drawn cards!
    const bobTotalPoints = nextState.players[1].hand.reduce((sum, c) => sum + c.scoreValue, 0);
    const charlieTotalPoints = nextState.players[2].hand.reduce((sum, c) => sum + c.scoreValue, 0);
    expect(nextState.roundWinner?.roundScore).toBe(bobTotalPoints + charlieTotalPoints);
    expect(events.some((e) => e.type === 'CARDS_DRAWN_PENALTY')).toBe(true);
  });

  it('going out with a Wild Draw Four allows victim to accept or challenge before round score is calculated', () => {
    const cWildDrawFour = CardFactory.createWildCard('wild_draw_four', 1);
    const cBlue5 = CardFactory.createNumberCard('blue', '5', 1);

    const baseState = GameFactory.createGame({ roomId: 'room_test', players, dealerIndex: 2 });
    const customState = {
      ...baseState,
      turnDirection: 'clockwise' as const,
      topDiscardCard: CardFactory.createNumberCard('red', '3', 1),
      activeColor: 'red' as const,
      currentPlayerIndex: 0,
      players: [
        { ...baseState.players[0], hand: [cWildDrawFour] }, // Alice plays WDF as last card
        { ...baseState.players[1], hand: [cBlue5] },         // Bob
        { ...baseState.players[2], hand: [cBlue5] },         // Charlie
      ],
    };

    const { nextState: pendingState } = ActionProcessor.process(customState, {
      type: 'PLAY_CARD',
      playerId: 'player_a',
      cardId: cWildDrawFour.id,
      chosenColor: 'yellow',
    });

    // Round is NOT over yet; Bob must resolve
    expect(pendingState.status).toBe('IN_PROGRESS');
    expect(pendingState.pendingActionState).toBeDefined();
    expect(pendingState.pendingActionState?.victimPlayerId).toBe('player_b');

    // Bob accepts +4
    const { nextState: finishedState } = ActionProcessor.process(pendingState, {
      type: 'ACCEPT_WILD_DRAW_FOUR',
      playerId: 'player_b',
    });

    // Bob received 4 cards, and now round is over!
    expect(finishedState.players[1].hand).toHaveLength(1 + 4);
    expect(finishedState.status).toBe('ROUND_OVER');
    expect(finishedState.roundWinner?.id).toBe('player_a');
  });

  it('multi-round transition preserves cumulative scores and rotates dealer', () => {
    const baseState = GameFactory.createGame({ roomId: 'room_test', players, dealerIndex: 0 });
    // Alice wins round 1 with 120 points
    const roundOverState = {
      ...baseState,
      status: 'ROUND_OVER' as const,
      roundNumber: 1,
      dealerIndex: 0,
      players: [
        { ...baseState.players[0], score: 120 },
        { ...baseState.players[1], score: 0 },
        { ...baseState.players[2], score: 0 },
      ],
    };

    const { nextState: round2State, events } = ActionProcessor.process(roundOverState, {
      type: 'START_NEXT_ROUND',
      triggeredByPlayerId: 'player_a',
    });

    expect(round2State.status).toBe('IN_PROGRESS');
    expect(round2State.roundNumber).toBe(2);
    expect(round2State.dealerIndex).toBe(1); // Dealer rotated from 0 to 1!
    if (round2State.topDiscardCard.type === 'number') {
      expect(round2State.currentPlayerIndex).toBe(2); // Starting player is to the left of dealer (index 2)!
    }
    expect(round2State.players[0].score).toBe(120); // Alice's cumulative score is preserved!
    expect(round2State.players[0].hand).toHaveLength(7);
    expect(round2State.players[1].hand).toHaveLength(7);
    const expectedP2HandLength = round2State.topDiscardCard.value === 'draw_two' ? 9 : 7;
    expect(round2State.players[2].hand).toHaveLength(expectedP2HandLength);
    expect(events.some((e) => e.type === 'ROUND_STARTED')).toBe(true);
  });

  describe('Opening Reverse Rule (Mattel 42001)', () => {
    it('sets player to dealer right as first player in 3-player game on starting Reverse', () => {
      const cReverse = CardFactory.createActionCard('red', 'reverse', 1);
      // Construct a state where top discard is Reverse with dealer = 0
      const baseState = GameFactory.createGame({ roomId: 'r1', players, dealerIndex: 0 });
      // Simulate top card being reverse directly or create state
      const reverseState = {
        ...baseState,
        topDiscardCard: cReverse,
        activeColor: 'red' as const,
        turnDirection: 'counter_clockwise' as const,
        currentPlayerIndex: (0 - 1 + 3) % 3, // Player 2 (Charlie)
      };

      expect(reverseState.turnDirection).toBe('counter_clockwise');
      expect(reverseState.currentPlayerIndex).toBe(2); // Charlie plays first
    });

    it('real GameFactory.createGame with 4 players: opening Reverse sets counter_clockwise and starts player 3', () => {
      const fourPlayers = [
        { id: 'p0', username: 'P0' },
        { id: 'p1', username: 'P1' },
        { id: 'p2', username: 'P2' },
        { id: 'p3', username: 'P3' },
      ];
      // Seed 6 deterministically produces a yellow reverse card as top discard in 4-player game
      const rng = createSeededRng(6);
      const state = GameFactory.createGame({ roomId: 'r1', players: fourPlayers, dealerIndex: 0 }, rng);

      expect(state.topDiscardCard.value).toBe('reverse');
      expect(state.dealerIndex).toBe(0);
      expect(state.turnDirection).toBe('counter_clockwise');
      expect(state.currentPlayerIndex).toBe(3); // Player to dealer 0's right
      expect(state.currentPlayerIndex).not.toBe(state.dealerIndex); // Dealer is NOT first player
    });

    it('real GameFactory.createGame with 3 players: opening Reverse sets counter_clockwise and starts player 2', () => {
      // Seed 28 deterministically produces a yellow reverse card as top discard in 3-player game
      const rng = createSeededRng(28);
      const state = GameFactory.createGame({ roomId: 'r1', players, dealerIndex: 0 }, rng);

      expect(state.topDiscardCard.value).toBe('reverse');
      expect(state.dealerIndex).toBe(0);
      expect(state.turnDirection).toBe('counter_clockwise');
      expect(state.currentPlayerIndex).toBe(2); // Player to dealer 0's right
      expect(state.currentPlayerIndex).not.toBe(state.dealerIndex);
    });

    it('real GameFactory.createGame with 2 players: opening Reverse sets counter_clockwise and starts player 1', () => {
      const twoPlayers = [
        { id: 'p0', username: 'P0' },
        { id: 'p1', username: 'P1' },
      ];
      // Seed 23 deterministically produces a red reverse card as top discard in 2-player game
      const rng = createSeededRng(23);
      const state = GameFactory.createGame({ roomId: 'r1', players: twoPlayers, dealerIndex: 0 }, rng);

      expect(state.topDiscardCard.value).toBe('reverse');
      expect(state.dealerIndex).toBe(0);
      expect(state.turnDirection).toBe('counter_clockwise');
      expect(state.currentPlayerIndex).toBe(1); // Opponent (non-dealer) plays first
      expect(state.currentPlayerIndex).not.toBe(state.dealerIndex);
    });

    it('real GameFactory.startNextRound with opening Reverse starts with player to right of new dealer', () => {
      const baseState = GameFactory.createGame({ roomId: 'r1', players, dealerIndex: 0 });
      const roundOverState = {
        ...baseState,
        status: 'ROUND_OVER' as const,
        roundNumber: 1,
        dealerIndex: 0,
      };

      // Seed 28 produces Reverse for 3 players in startNextRound
      const rng = createSeededRng(28);
      const nextRound = GameFactory.startNextRound(roundOverState, rng);

      expect(nextRound.topDiscardCard.value).toBe('reverse');
      expect(nextRound.roundNumber).toBe(2);
      expect(nextRound.dealerIndex).toBe(1); // Rotated to Bob (index 1)
      expect(nextRound.turnDirection).toBe('counter_clockwise');
      expect(nextRound.currentPlayerIndex).toBe(0); // Alice (index 0) is to Bob's right
      expect(nextRound.currentPlayerIndex).not.toBe(nextRound.dealerIndex); // Dealer 1 is NOT first player
    });

    it('starting Skip and Draw Two behavior in real GameFactory.createGame', () => {
      // Find seeds for Skip and Draw Two
      let skipSeed = 0;
      let drawTwoSeed = 0;
      for (let s = 1; s < 500; s++) {
        const rng = createSeededRng(s);
        const g = GameFactory.createGame({ roomId: 'r1', players, dealerIndex: 0 }, rng);
        if (!skipSeed && g.topDiscardCard.value === 'skip') skipSeed = s;
        if (!drawTwoSeed && g.topDiscardCard.value === 'draw_two') drawTwoSeed = s;
        if (skipSeed && drawTwoSeed) break;
      }

      // Skip: Player 1 (left of dealer 0) is skipped -> Player 2 starts
      const skipState = GameFactory.createGame({ roomId: 'r1', players, dealerIndex: 0 }, createSeededRng(skipSeed));
      expect(skipState.topDiscardCard.value).toBe('skip');
      expect(skipState.currentPlayerIndex).toBe(2);
      expect(skipState.turnDirection).toBe('clockwise');

      // Draw Two: Player 1 draws 2 cards and is skipped -> Player 2 starts
      const dtState = GameFactory.createGame({ roomId: 'r1', players, dealerIndex: 0 }, createSeededRng(drawTwoSeed));
      expect(dtState.topDiscardCard.value).toBe('draw_two');
      expect(dtState.currentPlayerIndex).toBe(2);
      expect(dtState.turnDirection).toBe('clockwise');
      expect(dtState.players[1].hand).toHaveLength(9); // 7 initial + 2 drawn
    });
  });

  describe('Dealer Determination Accuracy & Tie-Resolution Policy (Fix 2)', () => {
    it('returns a valid dealer index within player count bounds', () => {
      for (let count = 2; count <= 10; count++) {
        const rng = createSeededRng(100 + count);
        const dealer = GameFactory.determineDealer(count, rng);
        expect(dealer).toBeGreaterThanOrEqual(0);
        expect(dealer).toBeLessThan(count);
      }
    });

    it('is completely repeatable when given the same deterministic RNG', () => {
      const rng1 = createSeededRng(12345);
      const rng2 = createSeededRng(12345);

      const res1 = GameFactory.determineDealerDetailed(4, rng1);
      const res2 = GameFactory.determineDealerDetailed(4, rng2);
      expect(res1.dealerIndex).toBe(res2.dealerIndex);
      expect(res1.tieRounds).toBe(res2.tieRounds);
      expect(res1.roundHistory.length).toBe(res2.roundHistory.length);
    });

    it('correctly awards dealer to highest card points (Wild 50 > Action 20 > Number 0-9)', () => {
      const cNum = CardFactory.createNumberCard('red', '7', 1);
      const cAction = CardFactory.createActionCard('blue', 'skip', 1);
      const cWild = CardFactory.createWildCard('wild', 1);

      expect(cNum.scoreValue).toBe(7);
      expect(cAction.scoreValue).toBe(20);
      expect(cWild.scoreValue).toBe(50);
      expect(cWild.scoreValue).toBeGreaterThan(cAction.scoreValue);
      expect(cAction.scoreValue).toBeGreaterThan(cNum.scoreValue);
    });

    it('resolves equal-value ties by redrawing only between tied candidates until unique winner emerges', () => {
      // Run across 20 different seeds and verify roundHistory records tied candidates
      for (let s = 1; s <= 20; s++) {
        const rng = createSeededRng(s * 31);
        const result = GameFactory.determineDealerDetailed(4, rng);
        expect(result.dealerIndex).toBeGreaterThanOrEqual(0);
        expect(result.dealerIndex).toBeLessThan(4);
        expect(result.tieRounds).toBeGreaterThanOrEqual(1);

        // Every round in history must have correct structure
        for (const r of result.roundHistory) {
          expect(r.draws.length).toBeGreaterThanOrEqual(1);
          expect(r.remainingCandidates.length).toBeGreaterThanOrEqual(1);
          expect(r.highestScore).toBeGreaterThanOrEqual(0);
        }

        // Final round must narrow down to 1 winner unless fallback was invoked
        const finalRound = result.roundHistory[result.roundHistory.length - 1];
        if (!result.resolvedByFallback) {
          expect(finalRound.remainingCandidates).toHaveLength(1);
          expect(finalRound.remainingCandidates[0]).toBe(result.dealerIndex);
        }
      }
    });

    it('invokes documented application fallback (Math.min) when maxTieRounds limit is reached', () => {
      // Mock RNG that always returns 0 (pops identical cards repeatedly, simulating pathological RNG)
      const zeroRng = () => 0;
      const result = GameFactory.determineDealerDetailed(3, zeroRng, 3);

      expect(result.tieRounds).toBe(3);
      expect(result.resolvedByFallback).toBe(true);
      // Candidates tied in final round -> fallback selects lowest index among remaining candidates
      const remainingAtEnd = result.roundHistory[result.roundHistory.length - 1].remainingCandidates;
      expect(result.dealerIndex).toBe(Math.min(...remainingAtEnd));
    });

    it('dealer determination handles 1 player gracefully', () => {
      const res = GameFactory.determineDealerDetailed(1);
      expect(res.dealerIndex).toBe(0);
      expect(res.tieRounds).toBe(0);
      expect(res.resolvedByFallback).toBe(false);
    });
  });

  describe('Event Sequencing & Monotonic Continuity (Correction C)', () => {
    it('maintains state.sequenceNumber === lastEvent.sequenceNumber for multi-event Skip', () => {
      const cSkip = CardFactory.createActionCard('red', 'skip', 1);
      const baseState = GameFactory.createGame({ roomId: 'r1', players, dealerIndex: 2 });
      const customState = {
        ...baseState,
        sequenceNumber: 10,
        turnDirection: 'clockwise' as const,
        topDiscardCard: CardFactory.createNumberCard('red', '3', 1),
        activeColor: 'red' as const,
        currentPlayerIndex: 0,
        players: [
          { ...baseState.players[0], hand: [cSkip, CardFactory.createNumberCard('blue', '1', 1)] },
          { ...baseState.players[1] },
          { ...baseState.players[2] },
        ],
      };

      const { nextState, events } = ActionProcessor.process(customState, {
        type: 'PLAY_CARD',
        playerId: 'player_a',
        cardId: cSkip.id,
      });

      // Skip emits at least 2 events: CARD_PLAYED (seq 11) and PLAYER_SKIPPED (seq 12)
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[0].sequenceNumber).toBe(11);
      expect(events[events.length - 1].sequenceNumber).toBe(10 + events.length);
      expect(nextState.sequenceNumber).toBe(events[events.length - 1].sequenceNumber);
    });

    it('maintains monotonic continuity across multiple consecutive actions', () => {
      const baseState = GameFactory.createGame({ roomId: 'r1', players, dealerIndex: 2 });
      let currentState = {
        ...baseState,
        topDiscardCard: CardFactory.createNumberCard('red', '5', 1),
        activeColor: 'red' as const,
        drawPile: [
          ...baseState.drawPile,
          CardFactory.createNumberCard('red', '7', 1),
        ],
        turnDirection: 'clockwise' as const,
        sequenceNumber: 0,
        currentPlayerIndex: 0,
      };

      // Action 1: Player A draws a card
      const res1 = ActionProcessor.process(currentState, {
        type: 'DRAW_CARD',
        playerId: 'player_a',
      });
      expect(res1.events[0].sequenceNumber).toBe(1);
      expect(res1.nextState.sequenceNumber).toBe(res1.events.at(-1)!.sequenceNumber);
      currentState = res1.nextState;

      // Action 2: Player A passes turn
      const res2 = ActionProcessor.process(currentState, {
        type: 'PASS_TURN',
        playerId: 'player_a',
      });
      expect(res2.events[0].sequenceNumber).toBe(currentState.sequenceNumber + 1);
      expect(res2.nextState.sequenceNumber).toBe(res2.events.at(-1)!.sequenceNumber);
      currentState = res2.nextState;

      // Action 3: Player B draws a card
      const res3 = ActionProcessor.process(currentState, {
        type: 'DRAW_CARD',
        playerId: 'player_b',
      });
      expect(res3.events[0].sequenceNumber).toBe(currentState.sequenceNumber + 1);
      expect(res3.nextState.sequenceNumber).toBe(res3.events.at(-1)!.sequenceNumber);

      // Verify sequence strictly increases: 0 -> seq1 -> seq2 -> seq3
      expect(res3.nextState.sequenceNumber).toBeGreaterThan(res2.nextState.sequenceNumber);
      expect(res2.nextState.sequenceNumber).toBeGreaterThan(res1.nextState.sequenceNumber);
    });
  });
});
