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
    expect(round2State.currentPlayerIndex).toBe(2); // Starting player is to the left of dealer (index 2)!
    expect(round2State.players[0].score).toBe(120); // Alice's cumulative score is preserved!
    expect(round2State.players[0].hand).toHaveLength(7);
    expect(round2State.players[1].hand).toHaveLength(7);
    expect(round2State.players[2].hand).toHaveLength(7);
    expect(events.some((e) => e.type === 'ROUND_STARTED')).toBe(true);
  });
});
