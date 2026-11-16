import { describe, it, expect } from 'vitest';
import { ActionProcessor } from '../src/actions/action.processor';
import { MoveValidator } from '../src/validation/move.validator';
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
    roundNumber: 1,
    dealerIndex: 2,
    targetScore: 500,
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
      CardFactory.createNumberCard('yellow', '5', 1),
      CardFactory.createNumberCard('green', '5', 1),
      CardFactory.createNumberCard('red', '8', 1),
      CardFactory.createNumberCard('red', '6', 1),
      CardFactory.createNumberCard('red', '4', 1),
      CardFactory.createNumberCard('red', '3', 1),
      CardFactory.createNumberCard('red', '2', 1),
      CardFactory.createNumberCard('red', '1', 1),
    ],
    discardPile: [CardFactory.createNumberCard('red', '9', 1)],
    topDiscardCard: CardFactory.createNumberCard('red', '9', 1),
    activeColor: 'red',
    turnNumber: 1,
    sequenceNumber: 0,
    unoVulnerablePlayerId: null,
    pendingActionState: null,
    inspectionHand: null,
    roundWinner: null,
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

  it('playing a Wild Draw Four enters pending resolution state for victim (Mattel 42001)', () => {
    const state = createInitialState();
    const { nextState, events } = ActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: cWildDrawFour.id,
      chosenColor: 'yellow',
    });

    expect(nextState.activeColor).toBe('yellow');
    expect(nextState.pendingActionState).toBeDefined();
    expect(nextState.pendingActionState?.type).toBe('AWAITING_WILD_DRAW_FOUR_RESOLUTION');
    expect(nextState.pendingActionState?.victimPlayerId).toBe('p2');
    expect(nextState.currentPlayerIndex).toBe(1); // victim is active to choose accept or challenge
    expect(events.some((e) => e.type === 'WILD_DRAW_FOUR_PENDING_RESOLUTION')).toBe(true);
  });

  it('accepting a Wild Draw Four gives 4 cards to victim and skips victim', () => {
    const state = createInitialState();
    const { nextState: pendingState } = ActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: cWildDrawFour.id,
      chosenColor: 'yellow',
    });

    const p2InitialCount = pendingState.players[1].hand.length;
    const { nextState: acceptedState, events } = ActionProcessor.process(pendingState, {
      type: 'ACCEPT_WILD_DRAW_FOUR',
      playerId: 'p2',
    });

    expect(acceptedState.players[1].hand).toHaveLength(p2InitialCount + 4);
    expect(acceptedState.currentPlayerIndex).toBe(2); // p2 skipped, turn is p3
    expect(acceptedState.pendingActionState).toBeNull();
    expect(events.some((e) => e.type === 'WILD_DRAW_FOUR_ACCEPTED')).toBe(true);
  });

  it('challenging a Wild Draw Four when offender was guilty penalizes offender with 4 cards', () => {
    // P1 holds cRed5, active color is red, so playing Wild Draw 4 is BLUFFING (illegal)
    const state = createInitialState([cRed5, cWildDrawFour]);
    const { nextState: pendingState } = ActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: cWildDrawFour.id,
      chosenColor: 'blue',
    });

    expect(pendingState.pendingActionState?.wasOfficiallyLegal).toBe(false);

    const { nextState: challengedState, events } = ActionProcessor.process(pendingState, {
      type: 'CHALLENGE_WILD_DRAW_FOUR',
      challengerPlayerId: 'p2',
    });

    // P1 (offender) draws 4 cards!
    expect(challengedState.players[0].hand).toHaveLength(1 + 4); // held 1 card + 4 drawn
    // P2 (challenger) draws 0 cards!
    expect(challengedState.players[1].hand).toHaveLength(2);
    // Challenger continues their turn!
    expect(challengedState.currentPlayerIndex).toBe(1);
    expect(events.some((e) => e.type === 'WILD_DRAW_FOUR_CHALLENGE_WON')).toBe(true);
  });

  it('challenging a Wild Draw Four when offender was innocent penalizes challenger with 6 cards', () => {
    // P1 holds only cBlue5 and cWildDrawFour (active color is red), so playing WDF is LEGAL (innocent)
    const state = createInitialState([cBlue5, cWildDrawFour]);
    const { nextState: pendingState } = ActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: cWildDrawFour.id,
      chosenColor: 'blue',
    });

    expect(pendingState.pendingActionState?.wasOfficiallyLegal).toBe(true);

    const { nextState: challengedState, events } = ActionProcessor.process(pendingState, {
      type: 'CHALLENGE_WILD_DRAW_FOUR',
      challengerPlayerId: 'p2',
    });

    // P2 (challenger) draws 6 cards (4 + 2 penalty) and loses turn!
    expect(challengedState.players[1].hand).toHaveLength(2 + 6);
    expect(challengedState.currentPlayerIndex).toBe(2); // P2 loses turn, turn passes to P3
    expect(events.some((e) => e.type === 'WILD_DRAW_FOUR_CHALLENGE_LOST')).toBe(true);
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

  it('calling UNO flags hasDeclaredUno on player with 2 cards', () => {
    // P1 with 2 cards
    const state = createInitialState([cRed5, cBlue5]);
    const { nextState } = ActionProcessor.process(state, {
      type: 'CALL_UNO',
      playerId: 'p1',
    });

    expect(nextState.players[0].hasDeclaredUno).toBe(true);
  });

  it('playing down to 1 card without calling UNO makes player vulnerable to catch', () => {
    // P1 has 2 cards and plays 1 without calling UNO first
    const state = createInitialState([cRed5, cBlue5]);
    const { nextState } = ActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: cRed5.id,
    });

    expect(nextState.players[0].hand).toHaveLength(1);
    expect(nextState.players[0].hasDeclaredUno).toBe(false);
    expect(nextState.unoVulnerablePlayerId).toBe('p1');

    // P2 catches P1's failure -> P1 draws 2 penalty cards (Mattel standard)
    const { nextState: caughtState, events } = ActionProcessor.process(nextState, {
      type: 'CHALLENGE_UNO_FAILURE',
      challengerPlayerId: 'p2',
      targetPlayerId: 'p1',
    });

    expect(caughtState.players[0].hand).toHaveLength(1 + 2);
    expect(caughtState.unoVulnerablePlayerId).toBeNull();
    expect(events.some((e) => e.type === 'UNO_CHALLENGE_SUCCESS')).toBe(true);
  });

  it('emptying hand transitions match to ROUND_OVER and calculates winner score', () => {
    // P1 has only 1 card left (cRed5)
    const state = createInitialState([cRed5]);
    const { nextState, events } = ActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: cRed5.id,
    });

    expect(nextState.status).toBe('ROUND_OVER');
    expect(nextState.roundWinner).toBeDefined();
    expect(nextState.roundWinner?.id).toBe('p1');
    expect(nextState.roundWinner?.roundScore).toBeGreaterThan(0);
    expect(nextState.players[0].score).toBe(nextState.roundWinner?.roundScore);
    expect(events.some((e) => e.type === 'ROUND_COMPLETED')).toBe(true);
  });

  it('playing Reverse in a 2-player game acts as a Skip (current player takes another turn)', () => {
    const twoPlayerState: GameState = {
      ...createInitialState(),
      players: [
        {
          id: 'p1',
          username: 'P1',
          hand: [cRedReverse, cRed5],
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
      ],
      playerOrder: ['p1', 'p2'],
      currentPlayerIndex: 0,
    };

    const { nextState, events } = ActionProcessor.process(twoPlayerState, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: cRedReverse.id,
    });

    // In 2 players, Reverse grants P1 another turn (currentPlayerIndex remains 0)
    expect(nextState.currentPlayerIndex).toBe(0);
    expect(events.some((e) => e.type === 'PLAYER_SKIPPED' || e.type === 'DIRECTION_REVERSED')).toBe(true);
  });

  it('retroactive declaration: player vulnerable to UNO with 1 card is rejected from calling UNO', () => {
    // P1 down to 1 card without UNO call
    const state = createInitialState([cRed5, cBlue5]);
    const { nextState: vulnerableState } = ActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: cRed5.id,
    });
    expect(vulnerableState.unoVulnerablePlayerId).toBe('p1');

    // P1 cannot retroactively call UNO with 1 card!
    const validation = MoveValidator.validate(vulnerableState, {
      type: 'CALL_UNO',
      playerId: 'p1',
    });
    expect(validation.valid).toBe(false);
  });

  it('UNO immunity window: once next player acts, missed UNO can no longer be challenged', () => {
    // P1 down to 1 card without UNO call
    const state = createInitialState([cRed5, cBlue5]);
    const { nextState: vulnerableState } = ActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: cRed5.id,
    });
    expect(vulnerableState.unoVulnerablePlayerId).toBe('p1');
    expect(vulnerableState.currentPlayerIndex).toBe(1); // P2's turn

    // P2 draws a card instead of catching P1
    const { nextState: p2DrawnState } = ActionProcessor.process(vulnerableState, {
      type: 'DRAW_CARD',
      playerId: 'p2',
    });

    // P1's vulnerability is now expired per Mattel 42001
    expect(p2DrawnState.unoVulnerablePlayerId).toBeNull();

    // Now P3 tries to challenge P1 -> rejected!
    expect(() => {
      ActionProcessor.process(p2DrawnState, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p3',
        targetPlayerId: 'p1',
      });
    }).toThrow(/TARGET_NOT_VULNERABLE/i);
  });

  it('after drawing, player cannot play an older hand card (only the drawn card or pass)', () => {
    const cOldRed = CardFactory.createNumberCard('red', '7', 1);
    const cOldBlue = CardFactory.createNumberCard('blue', '3', 1);
    const state = createInitialState([cOldRed, cOldBlue]);

    // Active color is red. P1 draws a card (drawn card is yellow 5, not red)
    const { nextState: drawnState } = ActionProcessor.process(state, {
      type: 'DRAW_CARD',
      playerId: 'p1',
    });

    expect(drawnState.players[0].hasDrawnThisTurn).toBe(true);
    const drawnCardId = drawnState.players[0].drawnCardId;

    // Trying to play the older card cOldRed (even though matching color!) must be rejected
    expect(() => {
      ActionProcessor.process(drawnState, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: cOldRed.id,
      });
    }).toThrow(/INVALID_CARD_MATCH/i);
  });

  it('reaches COMPLETED status when cumulative score hits target score 500', () => {
    const baseState = createInitialState([cRed5]);
    // Set P1 already at 490 points, so winning round pushes them over 500
    const state: GameState = {
      ...baseState,
      players: [
        { ...baseState.players[0], score: 490 },
        baseState.players[1],
        baseState.players[2],
      ],
    };

    const { nextState, events } = ActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: cRed5.id,
    });

    expect(nextState.status).toBe('COMPLETED');
    expect(nextState.winner).toBeDefined();
    expect(nextState.winner?.id).toBe('p1');
    expect(nextState.winner?.score).toBeGreaterThanOrEqual(500);
    expect(events.some((e) => e.type === 'GAME_COMPLETED')).toBe(true);
  });
});
