import { describe, it, expect } from 'vitest';
import { MoveValidator } from '../src/validation/move.validator';
import { CardFactory } from '../src/cards/card.factory';
import { GameState } from '../src/game/game.types';

describe('Move Validation Verification', () => {
  const topDiscard = CardFactory.createNumberCard('red', '5', 1);
  const red7 = CardFactory.createNumberCard('red', '7', 1);
  const blue5 = CardFactory.createNumberCard('blue', '5', 1);
  const greenSkip = CardFactory.createActionCard('green', 'skip', 1);
  const redSkip = CardFactory.createActionCard('red', 'skip', 1);
  const wildCard = CardFactory.createWildCard('wild', 1);

  const baseState: GameState = {
    id: 'm1',
    roomId: 'r1',
    variant: 'classic',
    status: 'IN_PROGRESS',
    players: [
      {
        id: 'p1',
        username: 'Player1',
        hand: [red7, blue5, greenSkip, wildCard],
        hasDeclaredUno: false,
        hasDrawnThisTurn: false,
        drawnCardId: null,
        score: 0,
      },
      {
        id: 'p2',
        username: 'Player2',
        hand: [redSkip],
        hasDeclaredUno: false,
        hasDrawnThisTurn: false,
        drawnCardId: null,
        score: 0,
      },
    ],
    playerOrder: ['p1', 'p2'],
    currentPlayerIndex: 0, // p1's turn
    turnDirection: 'clockwise',
    drawPile: [],
    discardPile: [topDiscard],
    topDiscardCard: topDiscard, // red 5
    activeColor: 'red',
    turnNumber: 1,
    sequenceNumber: 1,
    pendingActionState: null,
    winner: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('permits playing a card that matches the active color', () => {
    const res = MoveValidator.validate(baseState, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: red7.id,
    });
    expect(res.valid).toBe(true);
  });

  it('permits playing a card that matches the face value/number across colors', () => {
    const res = MoveValidator.validate(baseState, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: blue5.id, // matches 5 on red 5
    });
    expect(res.valid).toBe(true);
  });

  it('permits playing a Wild card when a chosen color is supplied', () => {
    const res = MoveValidator.validate(baseState, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: wildCard.id,
      chosenColor: 'yellow',
    });
    expect(res.valid).toBe(true);
  });

  it('rejects a Wild card when chosen color is omitted', () => {
    const res = MoveValidator.validate(baseState, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: wildCard.id,
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.code).toBe('MUST_CHOOSE_COLOR');
    }
  });

  it('rejects playing a card that does not match color or number/action', () => {
    const res = MoveValidator.validate(baseState, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: greenSkip.id, // green skip on red 5
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.code).toBe('INVALID_CARD_MATCH');
    }
  });

  it('rejects play when it is not the player turn', () => {
    const res = MoveValidator.validate(baseState, {
      type: 'PLAY_CARD',
      playerId: 'p2', // p2 trying to play during p1's turn
      cardId: redSkip.id,
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.code).toBe('NOT_YOUR_TURN');
    }
  });

  it('rejects play when card is not in player hand', () => {
    const res = MoveValidator.validate(baseState, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: 'non_existent_card_id',
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.code).toBe('CARD_NOT_IN_HAND');
    }
  });

  it('rejects passing before drawing a card', () => {
    const res = MoveValidator.validate(baseState, {
      type: 'PASS_TURN',
      playerId: 'p1',
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.code).toBe('INVALID_PASS');
    }
  });

  it('rejects drawing twice on the same turn', () => {
    const stateWithDrawn: GameState = {
      ...baseState,
      players: [
        { ...baseState.players[0], hasDrawnThisTurn: true, drawnCardId: 'some_card' },
        baseState.players[1],
      ],
    };

    const res = MoveValidator.validate(stateWithDrawn, {
      type: 'DRAW_CARD',
      playerId: 'p1',
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.code).toBe('ALREADY_DRAWN');
    }
  });

  it('rejects actions when match is not in progress', () => {
    const completedState: GameState = {
      ...baseState,
      status: 'COMPLETED',
    };
    const res = MoveValidator.validate(completedState, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: red7.id,
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.code).toBe('MATCH_NOT_ACTIVE');
    }
  });
});
