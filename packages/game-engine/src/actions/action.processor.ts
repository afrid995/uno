import { GameState, GameWinner, PendingActionState } from '../game/game.types';
import { GameAction, GameEventRecord } from './action.types';
import { CardColor } from '../cards/card.types';
import { isWildCard } from '../cards/card.validation';
import { DeckManager } from '../deck/deck.manager';
import { HandManager } from '../players/hand.manager';
import { TurnManager } from '../turns/turn.manager';
import { MoveValidator } from '../validation/move.validator';
import { RandomNumberGenerator, defaultCryptoRng } from '../deck/deck.shuffle';

export interface ActionProcessResult {
  readonly nextState: GameState;
  readonly events: readonly GameEventRecord[];
}

export class ActionProcessor {
  /**
   * Pure state transition function applying a validated GameAction to GameState.
   */
  static process(
    state: GameState,
    action: GameAction,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): ActionProcessResult {
    // 1. Validate action legality
    const validation = MoveValidator.validate(state, action);
    if (!validation.valid) {
      throw new Error(`[${validation.code}] ${validation.message}`);
    }

    const events: GameEventRecord[] = [];
    const timestamp = new Date().toISOString();
    let currentSeq = state.sequenceNumber;

    const addEvent = (type: string, playerId: string | undefined, payload: Record<string, unknown>) => {
      currentSeq += 1;
      events.push({
        sequenceNumber: currentSeq,
        type,
        playerId,
        payload,
        timestamp,
      });
    };

    let nextState: GameState;

    switch (action.type) {
      case 'PLAY_CARD':
        nextState = this.processPlayCard(state, action.playerId, action.cardId, action.chosenColor, addEvent, currentSeq, rng);
        break;

      case 'DRAW_CARD':
        nextState = this.processDrawCard(state, action.playerId, addEvent, currentSeq, rng);
        break;

      case 'PASS_TURN':
        nextState = this.processPassTurn(state, action.playerId, addEvent, currentSeq);
        break;

      case 'CALL_UNO':
        nextState = this.processCallUno(state, action.playerId, addEvent, currentSeq);
        break;

      case 'CHALLENGE_UNO_FAILURE':
        nextState = this.processChallengeUno(state, action.challengerPlayerId, action.targetPlayerId, addEvent, currentSeq, rng);
        break;

      case 'CHALLENGE_WILD_DRAW_FOUR':
        nextState = this.processChallengeWildDrawFour(state, action.challengerPlayerId, addEvent, currentSeq, rng);
        break;

      case 'ACCEPT_WILD_DRAW_FOUR':
        nextState = this.processAcceptWildDrawFour(state, action.playerId, addEvent, currentSeq, rng);
        break;

      default:
        throw new Error('Unsupported action type');
    }

    return { nextState, events };
  }

  private static processPlayCard(
    state: GameState,
    playerId: string,
    cardId: string,
    chosenColor: CardColor | undefined,
    addEvent: (t: string, p: string | undefined, pl: Record<string, unknown>) => void,
    seq: number,
    rng: RandomNumberGenerator
  ): GameState {
    const playerIndex = state.players.findIndex((p) => p.id === playerId);
    const player = state.players[playerIndex];

    const { updatedHand, removedCard } = HandManager.removeCard(player.hand, cardId);

    // Track whether playing Wild Draw Four was officially legal (player held NO matching color)
    const wasWildDrawFourLegal = removedCard.value === 'wild_draw_four'
      ? !HandManager.hasMatchingColor(player.hand, state.activeColor)
      : true;

    // Determine active color for next play
    const newActiveColor: CardColor = isWildCard(removedCard)
      ? chosenColor!
      : (removedCard.color ?? state.activeColor);

    const newDiscardPile = DeckManager.discardCard(state.discardPile, removedCard);

    // Update player state
    const updatedPlayer = {
      ...player,
      hand: updatedHand,
      hasDrawnThisTurn: false,
      drawnCardId: null,
      // If player now has 1 card but had NOT called UNO before playing, they are now vulnerable!
      hasDeclaredUno: updatedHand.length === 1 ? player.hasDeclaredUno : false,
    };

    const newPlayers = [...state.players];
    newPlayers[playerIndex] = updatedPlayer;

    addEvent('CARD_PLAYED', playerId, {
      cardId,
      card: removedCard,
      activeColor: newActiveColor,
      remainingCards: updatedHand.length,
      wasWildDrawFourLegal: removedCard.value === 'wild_draw_four' ? wasWildDrawFourLegal : undefined,
    });

    // Check WIN condition (emptied hand)
    if (HandManager.isHandEmpty(updatedHand)) {
      const loserHands = newPlayers.filter((p) => p.id !== playerId).map((p) => p.hand);
      const roundScore = loserHands.reduce((acc, h) => acc + HandManager.calculateHandScore(h), 0);
      const winner: GameWinner = {
        id: playerId,
        username: player.username,
        score: roundScore,
      };

      addEvent('GAME_COMPLETED', playerId, { winner, roundScore });

      return {
        ...state,
        status: 'COMPLETED',
        players: newPlayers,
        discardPile: newDiscardPile,
        topDiscardCard: removedCard,
        activeColor: newActiveColor,
        winner,
        sequenceNumber: seq + 1,
        updatedAt: new Date().toISOString(),
      };
    }

    // Process card effect and turn progression
    let currentDrawPile = state.drawPile;
    let currentDiscardPile = newDiscardPile;
    let nextPlayerIndex = state.currentPlayerIndex;
    let nextDirection = state.turnDirection;
    const pendingActionState: PendingActionState | null = null;

    if (removedCard.value === 'skip') {
      const resolved = TurnManager.resolveNextTurn(
        state.currentPlayerIndex,
        state.players.length,
        state.turnDirection,
        'skip'
      );
      nextPlayerIndex = resolved.nextIndex;
      nextDirection = resolved.newDirection;
      addEvent('PLAYER_SKIPPED', undefined, { skippedIndex: (state.currentPlayerIndex + 1) % state.players.length });
    } else if (removedCard.value === 'reverse') {
      const resolved = TurnManager.resolveNextTurn(
        state.currentPlayerIndex,
        state.players.length,
        state.turnDirection,
        'reverse'
      );
      nextPlayerIndex = resolved.nextIndex;
      nextDirection = resolved.newDirection;
      addEvent('DIRECTION_REVERSED', playerId, { newDirection: nextDirection });
    } else if (removedCard.value === 'draw_two') {
      // In 2-player, opponent draws 2 and turn returns to current player.
      // In 3+ players, next player draws 2 and is skipped.
      const victimIndex = TurnManager.getNextPlayerIndex(state.currentPlayerIndex, state.players.length, state.turnDirection, 1);
      const victim = newPlayers[victimIndex];

      const drawResult = DeckManager.drawCards(currentDrawPile, currentDiscardPile, 2, rng);
      currentDrawPile = drawResult.newDrawPile;
      currentDiscardPile = drawResult.newDiscardPile;

      const updatedVictim = {
        ...victim,
        hand: [...victim.hand, ...drawResult.drawnCards],
      };
      newPlayers[victimIndex] = updatedVictim;

      const resolved = TurnManager.resolveNextTurn(
        state.currentPlayerIndex,
        state.players.length,
        state.turnDirection,
        'draw_two'
      );
      nextPlayerIndex = resolved.nextIndex;
      nextDirection = resolved.newDirection;

      addEvent('CARDS_DRAWN_PENALTY', victim.id, {
        count: 2,
        victimId: victim.id,
        reason: 'DRAW_TWO',
      });
    } else if (removedCard.value === 'wild_draw_four') {
      // Target player is next in sequence
      const victimIndex = TurnManager.getNextPlayerIndex(state.currentPlayerIndex, state.players.length, state.turnDirection, 1);
      const victim = newPlayers[victimIndex];

      // Draw 4 cards for victim immediately per standard resolution
      const drawResult = DeckManager.drawCards(currentDrawPile, currentDiscardPile, 4, rng);
      currentDrawPile = drawResult.newDrawPile;
      currentDiscardPile = drawResult.newDiscardPile;

      const updatedVictim = {
        ...victim,
        hand: [...victim.hand, ...drawResult.drawnCards],
      };
      newPlayers[victimIndex] = updatedVictim;

      const resolved = TurnManager.resolveNextTurn(
        state.currentPlayerIndex,
        state.players.length,
        state.turnDirection,
        'draw_four'
      );
      nextPlayerIndex = resolved.nextIndex;
      nextDirection = resolved.newDirection;

      addEvent('CARDS_DRAWN_PENALTY', victim.id, {
        count: 4,
        victimId: victim.id,
        reason: 'WILD_DRAW_FOUR',
      });
    } else {
      // Normal number or regular wild card
      const resolved = TurnManager.resolveNextTurn(
        state.currentPlayerIndex,
        state.players.length,
        state.turnDirection,
        'normal'
      );
      nextPlayerIndex = resolved.nextIndex;
      nextDirection = resolved.newDirection;
    }

    return {
      ...state,
      players: newPlayers,
      drawPile: currentDrawPile,
      discardPile: currentDiscardPile,
      topDiscardCard: removedCard,
      activeColor: newActiveColor,
      currentPlayerIndex: nextPlayerIndex,
      turnDirection: nextDirection,
      turnNumber: state.turnNumber + 1,
      sequenceNumber: seq + 1,
      pendingActionState,
      updatedAt: new Date().toISOString(),
    };
  }

  private static processDrawCard(
    state: GameState,
    playerId: string,
    addEvent: (t: string, p: string | undefined, pl: Record<string, unknown>) => void,
    seq: number,
    rng: RandomNumberGenerator
  ): GameState {
    const playerIndex = state.players.findIndex((p) => p.id === playerId);
    const player = state.players[playerIndex];

    const drawResult = DeckManager.drawCards(state.drawPile, state.discardPile, 1, rng);
    const drawnCard = drawResult.drawnCards[0];

    const updatedPlayer = {
      ...player,
      hand: drawnCard ? [...player.hand, drawnCard] : player.hand,
      hasDrawnThisTurn: true,
      drawnCardId: drawnCard ? drawnCard.id : null,
      hasDeclaredUno: false, // drawing resets declared UNO status
    };

    const newPlayers = [...state.players];
    newPlayers[playerIndex] = updatedPlayer;

    addEvent('CARD_DRAWN', playerId, { cardId: drawnCard?.id });

    return {
      ...state,
      players: newPlayers,
      drawPile: drawResult.newDrawPile,
      discardPile: drawResult.newDiscardPile,
      sequenceNumber: seq + 1,
      updatedAt: new Date().toISOString(),
    };
  }

  private static processPassTurn(
    state: GameState,
    playerId: string,
    addEvent: (t: string, p: string | undefined, pl: Record<string, unknown>) => void,
    seq: number
  ): GameState {
    const playerIndex = state.players.findIndex((p) => p.id === playerId);
    const player = state.players[playerIndex];

    const updatedPlayer = {
      ...player,
      hasDrawnThisTurn: false,
      drawnCardId: null,
    };

    const newPlayers = [...state.players];
    newPlayers[playerIndex] = updatedPlayer;

    const nextIndex = TurnManager.getNextPlayerIndex(
      state.currentPlayerIndex,
      state.players.length,
      state.turnDirection,
      1
    );

    addEvent('TURN_PASSED', playerId, { nextPlayerIndex: nextIndex });

    return {
      ...state,
      players: newPlayers,
      currentPlayerIndex: nextIndex,
      turnNumber: state.turnNumber + 1,
      sequenceNumber: seq + 1,
      updatedAt: new Date().toISOString(),
    };
  }

  private static processCallUno(
    state: GameState,
    playerId: string,
    addEvent: (t: string, p: string | undefined, pl: Record<string, unknown>) => void,
    seq: number
  ): GameState {
    const playerIndex = state.players.findIndex((p) => p.id === playerId);
    const player = state.players[playerIndex];

    const updatedPlayer = {
      ...player,
      hasDeclaredUno: true,
    };

    const newPlayers = [...state.players];
    newPlayers[playerIndex] = updatedPlayer;

    addEvent('UNO_CALLED', playerId, { playerId });

    return {
      ...state,
      players: newPlayers,
      sequenceNumber: seq + 1,
      updatedAt: new Date().toISOString(),
    };
  }

  private static processChallengeUno(
    state: GameState,
    challengerId: string,
    targetPlayerId: string,
    addEvent: (t: string, p: string | undefined, pl: Record<string, unknown>) => void,
    seq: number,
    rng: RandomNumberGenerator
  ): GameState {
    const targetIndex = state.players.findIndex((p) => p.id === targetPlayerId);
    const target = state.players[targetIndex];

    // Penalty for failure to call UNO: draw 2 cards
    const drawResult = DeckManager.drawCards(state.drawPile, state.discardPile, 2, rng);

    const updatedTarget = {
      ...target,
      hand: [...target.hand, ...drawResult.drawnCards],
      hasDeclaredUno: false,
    };

    const newPlayers = [...state.players];
    newPlayers[targetIndex] = updatedTarget;

    addEvent('UNO_CHALLENGE_SUCCESS', challengerId, {
      challengerId,
      targetPlayerId,
      penaltyCards: 2,
    });

    return {
      ...state,
      players: newPlayers,
      drawPile: drawResult.newDrawPile,
      discardPile: drawResult.newDiscardPile,
      sequenceNumber: seq + 1,
      updatedAt: new Date().toISOString(),
    };
  }

  private static processChallengeWildDrawFour(
    state: GameState,
    challengerId: string,
    addEvent: (t: string, p: string | undefined, pl: Record<string, unknown>) => void,
    seq: number,
    rng: RandomNumberGenerator
  ): GameState {
    const pending = state.pendingActionState!;
    const blufferIndex = state.players.findIndex((p) => p.id === pending.playedByPlayerId);
    const challengerIndex = state.players.findIndex((p) => p.id === challengerId);

    const newPlayers = [...state.players];
    let drawResult;

    if (!pending.wasOfficiallyLegal) {
      // Bluffer was GUILTY (they held matching color) -> bluffer draws 4 cards!
      drawResult = DeckManager.drawCards(state.drawPile, state.discardPile, 4, rng);
      newPlayers[blufferIndex] = {
        ...newPlayers[blufferIndex],
        hand: [...newPlayers[blufferIndex].hand, ...drawResult.drawnCards],
      };
      addEvent('WILD_DRAW_FOUR_CHALLENGE_WON', challengerId, {
        challengerId,
        blufferId: pending.playedByPlayerId,
        penaltyTo: pending.playedByPlayerId,
        penaltyCards: 4,
      });
    } else {
      // Bluffer was INNOCENT (clean play) -> challenger draws 6 cards (4 + 2 penalty)!
      drawResult = DeckManager.drawCards(state.drawPile, state.discardPile, 6, rng);
      newPlayers[challengerIndex] = {
        ...newPlayers[challengerIndex],
        hand: [...newPlayers[challengerIndex].hand, ...drawResult.drawnCards],
      };
      addEvent('WILD_DRAW_FOUR_CHALLENGE_LOST', challengerId, {
        challengerId,
        penaltyTo: challengerId,
        penaltyCards: 6,
      });
    }

    return {
      ...state,
      players: newPlayers,
      drawPile: drawResult.newDrawPile,
      discardPile: drawResult.newDiscardPile,
      pendingActionState: null,
      sequenceNumber: seq + 1,
      updatedAt: new Date().toISOString(),
    };
  }

  private static processAcceptWildDrawFour(
    state: GameState,
    playerId: string,
    addEvent: (t: string, p: string | undefined, pl: Record<string, unknown>) => void,
    seq: number,
    rng: RandomNumberGenerator
  ): GameState {
    const playerIndex = state.players.findIndex((p) => p.id === playerId);
    const player = state.players[playerIndex];

    const drawResult = DeckManager.drawCards(state.drawPile, state.discardPile, 4, rng);
    const newPlayers = [...state.players];
    newPlayers[playerIndex] = {
      ...player,
      hand: [...player.hand, ...drawResult.drawnCards],
    };

    addEvent('WILD_DRAW_FOUR_ACCEPTED', playerId, { playerId, cardsDrawn: 4 });

    return {
      ...state,
      players: newPlayers,
      drawPile: drawResult.newDrawPile,
      discardPile: drawResult.newDiscardPile,
      pendingActionState: null,
      sequenceNumber: seq + 1,
      updatedAt: new Date().toISOString(),
    };
  }
}
