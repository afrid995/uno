import { describe, it, expect } from 'vitest';
import { ActionProcessor } from '../src/actions/action.processor';
import { CardFactory } from '../src/cards/card.factory';
import { GameState } from '../src/game/game.types';

describe('Card Action Effects and State Transitions', () => {
  const cRed5 = CardFactory.createNumberCard('red', '5', 1);
  const cRedSkip = CardFactory.createActionCard('red', 'skip', 1);
  const cRedReverse = CardFactory.createActionCard('red', 'reverse', 1);
  const cRedDrawTwo = CardFactory.createActionCard('red', 'draw_two', 1);
  const cWild = CardFactory.createWildCard('wild', 1);
  const cWildDrawFour = CardFactory.createWildCard('wild_draw_four', 1);
  const cBlue5 = CardFactory.createNumberCard('blue', '5', 1);
  const cGreen9 = CardFactory.createNumberCard('green', '9', 1);
  const cYellow2 = CardFactory.createNumberCard('yellow', '2', 1);

  const createInitialState = (p1Cards = [cRed5, cRedSkip, cRedReverse, cRedDrawTwo, cWild, cWildDrawFour]): GameState => ({
    id: 'm1',
    roomId: 'r1',
    variant: 'classic',
    status: 'IN_PROGRESS',
    players: [
      {
        id: 'p1',
        username: 'P1',
        hand: p1Cards,
        hasDeclaredUno: false,
        hasDrawnThisTurn: false,
        drawnCardId: null,
        score: 0,
      },
      {
        id: 'p2',
        username: 'P2',
        hand: [cBlue5, cGreen9],
        hasDeclaredUno: false,
        hasDrawnThisTurn: false,
        drawnCardId: null,
        score: 0,
      },
      {
        id: 'p3',
        username: 'P3',
        hand: [cYellow2],
        hasDeclaredUno: false,
        hasDrawnThisTurn: false,
        drawnCardId: null,
        score: 0,
      },
    ],
    playerOrder: ['p1', 'p2', 'p3'],
    currentPlayerIndex: 0, // p1
    turnDirection: 'clockwise',
    drawPile: [
      CardFactory.createNumberCard('red', '1', 1),
      CardFactory.createNumberCard('red', '2', 1),
      CardFactory.createNumberCard('red', '3', 1),
      CardFactory.createNumberCard('red', '4', 1),
      CardFactory.createNumberCard('red', '6', 1),
      CardFactory.createNumberCard('red', '8', 1),
    ],
    discardPile: [CardFactory.createNumberCard('red', '9', 1)],
    topDiscardCard: CardFactory.createNumberCard('red', '9', 1),
    activeColor: 'red',
    turnNumber: 1,
    sequenceNumber: 0,
    pendingActionState: null,
    winner: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  it('playing a Number card advances to next player normally (0 -> 1)', () => {
    const state = createInitialState();
    const { nextState, events } = ActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: cRed5.id,
    });

    expect(nextState.currentPlayerIndex).toBe(1); // p2
    expect(nextState.activeColor).toBe('red');
    expect(nextState.topDiscardCard.id).toBe(cRed5.id);
    expect(nextState.players[0].hand).toHaveLength(5);
    expect(events.some((e) => e.type === 'CARD_PLAYED')).toBe(true);
  });

  it('playing a Skip card skips the next player (0 -> 2, skipping 1)', () => {
    const state = createInitialState();
    const { nextState, events } = ActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: cRedSkip.id,
    });

    expect(nextState.currentPlayerIndex).toBe(2); // p3 (p2 skipped)
    expect(events.some((e) => e.type === 'PLAYER_SKIPPED')).toBe(true);
  });

  it('playing a Reverse card in 3-player game reverses direction to counter-clockwise (0 -> 2)', () => {
    const state = createInitialState();
    const { nextState, events } = ActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: cRedReverse.id,
    });

    expect(nextState.turnDirection).toBe('counter_clockwise');
    expect(nextState.currentPlayerIndex).toBe(2); // in ccw from 0, steps to 2
    expect(events.some((e) => e.type === 'DIRECTION_REVERSED')).toBe(true);
  });

  it('playing a Draw Two forces next player (p2) to draw 2 cards and skip their turn (0 -> 2)', () => {
    const state = createInitialState();
    const p2InitialHandCount = state.players[1].hand.length; // 2
    const { nextState, events } = ActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: cRedDrawTwo.id,
    });

    // P2 received 2 penalty cards
    expect(nextState.players[1].hand).toHaveLength(p2InitialHandCount + 2);
    // P2 was skipped, so turn advances to P3 (index 2)
    expect(nextState.currentPlayerIndex).toBe(2);
    expect(events.some((e) => e.type === 'CARDS_DRAWN_PENALTY')).toBe(true);
  });

  it('playing a Wild card updates the activeColor and advances turn', () => {
    const state = createInitialState();
    const { nextState } = ActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: cWild.id,
      chosenColor: 'blue',
    });

    expect(nextState.activeColor).toBe('blue');
    expect(nextState.currentPlayerIndex).toBe(1);
  });

  it('playing a Wild Draw Four updates activeColor, gives 4 cards to p2, and skips p2', () => {
    const state = createInitialState();
    const p2InitialHandCount = state.players[1].hand.length; // 2
    const { nextState, events } = ActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: cWildDrawFour.id,
      chosenColor: 'yellow',
    });

    expect(nextState.activeColor).toBe('yellow');
    expect(nextState.players[1].hand).toHaveLength(p2InitialHandCount + 4);
    expect(nextState.currentPlayerIndex).toBe(2); // p2 skipped
    expect(events.some((e) => e.type === 'CARDS_DRAWN_PENALTY')).toBe(true);
  });

  it('drawing 1 card keeps turn with current player, sets hasDrawnThisTurn', () => {
    const state = createInitialState();
    const { nextState } = ActionProcessor.process(state, {
      type: 'DRAW_CARD',
      playerId: 'p1',
    });

    expect(nextState.currentPlayerIndex).toBe(0); // still p1
    expect(nextState.players[0].hand).toHaveLength(state.players[0].hand.length + 1);
    expect(nextState.players[0].hasDrawnThisTurn).toBe(true);
    expect(nextState.players[0].drawnCardId).toBeDefined();
  });

  it('allows passing after drawing, advancing to next player', () => {
    const state = createInitialState();
    const { nextState: drawnState } = ActionProcessor.process(state, {
      type: 'DRAW_CARD',
      playerId: 'p1',
    });

    const { nextState: passedState } = ActionProcessor.process(drawnState, {
      type: 'PASS_TURN',
      playerId: 'p1',
    });

    expect(passedState.currentPlayerIndex).toBe(1); // p2
    expect(passedState.players[0].hasDrawnThisTurn).toBe(false);
    expect(passedState.players[0].drawnCardId).toBeNull();
  });

  it('calling UNO flags hasDeclaredUno on player', () => {
    // P1 with 2 cards
    const state = createInitialState([cRed5, cBlue5]);
    const { nextState } = ActionProcessor.process(state, {
      type: 'CALL_UNO',
      playerId: 'p1',
    });

    expect(nextState.players[0].hasDeclaredUno).toBe(true);
  });

  it('catching a player who failed to call UNO applies a 2-card draw penalty', () => {
    // P3 has 1 card and has NOT declared UNO
    const state = createInitialState();
    const p3InitialHand = state.players[2].hand.length; // 1

    const { nextState, events } = ActionProcessor.process(state, {
      type: 'CHALLENGE_UNO_FAILURE',
      challengerPlayerId: 'p1',
      targetPlayerId: 'p3',
    });

    expect(nextState.players[2].hand).toHaveLength(p3InitialHand + 2);
    expect(events.some((e) => e.type === 'UNO_CHALLENGE_SUCCESS')).toBe(true);
  });

  it('emptying hand transitions match to COMPLETED and calculates winner score', () => {
    // P1 has only 1 card left (cRed5)
    const state = createInitialState([cRed5]);
    const { nextState, events } = ActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: cRed5.id,
    });

    expect(nextState.status).toBe('COMPLETED');
    expect(nextState.winner).toBeDefined();
    expect(nextState.winner?.id).toBe('p1');
    expect(nextState.winner?.score).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'GAME_COMPLETED')).toBe(true);
  });
});
