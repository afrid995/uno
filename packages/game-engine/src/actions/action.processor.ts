import { GameState, GameWinner, PendingActionState, InspectionHand } from '../game/game.types';
import { GameAction, GameEventRecord } from './action.types';
import { Card, CardColor } from '../cards/card.types';
import { isWildCard } from '../cards/card.validation';
import { DeckManager } from '../deck/deck.manager';
import { HandManager } from '../players/hand.manager';
import { Player } from '../players/player.types';
import { TurnManager } from '../turns/turn.manager';
import { MoveValidator } from '../validation/move.validator';
import { RandomNumberGenerator, defaultCryptoRng } from '../deck/deck.shuffle';
import { GameFactory } from '../game/game.factory';
import { VariantRegistry } from '../variants/variant.types';

export interface ActionProcessResult {
  readonly nextState: GameState;
  readonly events: readonly GameEventRecord[];
}

export class ActionProcessor {
  /**
   * Pure state transition function applying a validated GameAction to GameState.
   * Delegates to the registered variant adapter (Classic UNO or UNO Flip).
   */
  static process(
    state: GameState,
    action: GameAction,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): ActionProcessResult {
    const variant = state.variant ?? 'classic';
    if (variant === 'classic') {
      return this.processClassic(state, action, rng);
    }
    const adapter = VariantRegistry.get(variant);
    return adapter.processAction(state, action, rng);
  }

  /**
   * Classic Mattel 42001 state transition processor.
   */
  static processClassic(
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
        nextState = this.processPlayCard(
          state,
          action.playerId,
          action.cardId,
          action.chosenColor,
          action.declareUno,
          addEvent,
          currentSeq,
          rng
        );
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

      case 'START_NEXT_ROUND':
        nextState = this.processStartNextRound(state, action.triggeredByPlayerId, addEvent, currentSeq, rng);
        break;

      default:
        throw new Error('Unsupported action type');
    }

    // Invariant: nextState.sequenceNumber === events.at(-1)?.sequenceNumber ?? state.sequenceNumber
    const finalSequenceNumber = events.length > 0
      ? events[events.length - 1].sequenceNumber
      : state.sequenceNumber;

    const finalState: GameState = {
      ...nextState,
      sequenceNumber: finalSequenceNumber,
      updatedAt: timestamp,
    };

    return { nextState: finalState, events };
  }

  private static processPlayCard(
    state: GameState,
    playerId: string,
    cardId: string,
    chosenColor: CardColor | undefined,
    declareUno: boolean | undefined,
    addEvent: (t: string, p: string | undefined, pl: Record<string, unknown>) => void,
    seq: number,
    rng: RandomNumberGenerator
  ): GameState {
    const playerIndex = state.players.findIndex((p) => p.id === playerId);
    const player = state.players[playerIndex];

    const { updatedHand, removedCard } = HandManager.removeCard(player.hand, cardId);

    // Track whether playing Wild Draw Four was officially legal:
    // A player may only play Wild Draw 4 if they do NOT hold any card of the active color!
    const wasWildDrawFourLegal = removedCard.value === 'wild_draw_four'
      ? !HandManager.hasMatchingColor(player.hand, state.activeColor ?? 'red')
      : true;

    // Determine active color for next play
    const newActiveColor: CardColor = isWildCard(removedCard)
      ? chosenColor!
      : (removedCard.color ?? state.activeColor ?? 'red');

    const newDiscardPile = DeckManager.discardCard(state.discardPile, removedCard);

    // Mattel 42001 UNO shout declaration rule:
    // When playing down to 1 card, player must declare UNO (either beforehand or atomically with the play).
    // If they have not declared UNO, they become vulnerable to a missed-UNO challenge
    // until the next player starts their turn.
    let isVulnerableToUnoChallenge = false;
    let declaredUno = false;

    if (updatedHand.length === 1) {
      if (player.hasDeclaredUno || declareUno) {
        declaredUno = true;
        if (!player.hasDeclaredUno && declareUno) {
          addEvent('UNO_CALLED', playerId, { playerId, declaredWithPlay: true });
        }
      } else {
        isVulnerableToUnoChallenge = true;
      }
    }

    // Update acting player
    const updatedPlayer = {
      ...player,
      hand: updatedHand,
      hasDrawnThisTurn: false,
      drawnCardId: null,
      hasDeclaredUno: declaredUno,
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

    let currentDrawPile = state.drawPile;
    let currentDiscardPile = newDiscardPile;

    // Check if player emptied their hand (round winning move)
    if (HandManager.isHandEmpty(updatedHand)) {
      // Per Mattel rules:
      // If the final card is Draw Two, next player draws 2 cards before score calculation.
      if (removedCard.value === 'draw_two') {
        const victimIndex = TurnManager.getNextPlayerIndex(state.currentPlayerIndex, state.players.length, state.turnDirection, 1);
        const victim = newPlayers[victimIndex];
        const drawResult = DeckManager.drawCards(currentDrawPile, currentDiscardPile, 2, rng);
        currentDrawPile = drawResult.newDrawPile;
        currentDiscardPile = drawResult.newDiscardPile;
        newPlayers[victimIndex] = {
          ...victim,
          hand: [...victim.hand, ...drawResult.drawnCards],
        };
        addEvent('CARDS_DRAWN_PENALTY', victim.id, {
          count: 2,
          victimId: victim.id,
          reason: 'FINAL_CARD_DRAW_TWO',
        });
        return this.finalizeRoundScore(
          state,
          playerId,
          newPlayers,
          currentDrawPile,
          currentDiscardPile,
          removedCard,
          newActiveColor,
          addEvent,
          seq
        );
      }

      // If the final card is Wild Draw Four, the victim must still have the opportunity to challenge or accept!
      if (removedCard.value === 'wild_draw_four') {
        const victimIndex = TurnManager.getNextPlayerIndex(state.currentPlayerIndex, state.players.length, state.turnDirection, 1);
        const victim = newPlayers[victimIndex];
        const pendingActionState: PendingActionState = {
          type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
          playedByPlayerId: playerId,
          victimPlayerId: victim.id,
          wasOfficiallyLegal: wasWildDrawFourLegal,
          chosenColor: newActiveColor,
          offenderHandSnapshot: [], // offender has 0 cards left
        };

        addEvent('WILD_DRAW_FOUR_PENDING_RESOLUTION', victim.id, {
          playedByPlayerId: playerId,
          victimPlayerId: victim.id,
          chosenColor: newActiveColor,
        });

        return {
          ...state,
          players: newPlayers,
          drawPile: currentDrawPile,
          discardPile: currentDiscardPile,
          topDiscardCard: removedCard,
          activeColor: newActiveColor,
          currentPlayerIndex: victimIndex,
          pendingActionState,
          inspectionHand: null,
          unoVulnerablePlayerId: null,
          sequenceNumber: seq + 1,
          updatedAt: new Date().toISOString(),
        };
      }

      // Normal card final play: finalize round immediately
      return this.finalizeRoundScore(
        state,
        playerId,
        newPlayers,
        currentDrawPile,
        currentDiscardPile,
        removedCard,
        newActiveColor,
        addEvent,
        seq
      );
    }

    // Hand not empty: process card effects and turn progression
    let nextPlayerIndex = state.currentPlayerIndex;
    let nextDirection = state.turnDirection;
    let pendingActionState: PendingActionState | null = null;

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
      const victimIndex = TurnManager.getNextPlayerIndex(state.currentPlayerIndex, state.players.length, state.turnDirection, 1);
      const victim = newPlayers[victimIndex];

      const drawResult = DeckManager.drawCards(currentDrawPile, currentDiscardPile, 2, rng);
      currentDrawPile = drawResult.newDrawPile;
      currentDiscardPile = drawResult.newDiscardPile;

      newPlayers[victimIndex] = {
        ...victim,
        hand: [...victim.hand, ...drawResult.drawnCards],
      };

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
      // Under Mattel 42001: Enter pending challenge/accept state!
      // Cards are NOT drawn until the victim accepts or challenges!
      const victimIndex = TurnManager.getNextPlayerIndex(state.currentPlayerIndex, state.players.length, state.turnDirection, 1);
      const victim = newPlayers[victimIndex];

      pendingActionState = {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        playedByPlayerId: playerId,
        victimPlayerId: victim.id,
        wasOfficiallyLegal: wasWildDrawFourLegal,
        chosenColor: newActiveColor,
        offenderHandSnapshot: [...updatedHand],
      };

      // Victim takes active resolution turn
      nextPlayerIndex = victimIndex;

      addEvent('WILD_DRAW_FOUR_PENDING_RESOLUTION', victim.id, {
        playedByPlayerId: playerId,
        victimPlayerId: victim.id,
        chosenColor: newActiveColor,
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
      unoVulnerablePlayerId: isVulnerableToUnoChallenge ? playerId : null,
      pendingActionState,
      inspectionHand: null,
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

    const isPlayable = drawnCard
      ? MoveValidator.isCardMatch(drawnCard, state.activeColor, state.topDiscardCard)
      : false;

    if (isPlayable) {
      // Case A: Drawn card is playable
      // Add drawn card to hand, keep turn with player so they can choose to play it or keep it
      const updatedPlayer = {
        ...player,
        hand: drawnCard ? [...player.hand, drawnCard] : player.hand,
        hasDrawnThisTurn: true,
        drawnCardId: drawnCard ? drawnCard.id : null,
        hasDeclaredUno: false, // drawing resets declared UNO status
      };

      const newPlayers = [...state.players];
      newPlayers[playerIndex] = updatedPlayer;

      addEvent('CARD_DRAWN', playerId, { cardId: drawnCard?.id, isPlayable: true });

      // When the next player draws a card, any previous player's missed-UNO challenge window closes!
      return {
        ...state,
        players: newPlayers,
        drawPile: drawResult.newDrawPile,
        discardPile: drawResult.newDiscardPile,
        unoVulnerablePlayerId: null,
        inspectionHand: null,
        sequenceNumber: seq + 1,
        updatedAt: new Date().toISOString(),
      };
    } else {
      // Case B: Drawn card is not playable
      // Add card to hand, end player's turn according to rules, pass to next eligible player
      const updatedPlayer = {
        ...player,
        hand: drawnCard ? [...player.hand, drawnCard] : player.hand,
        hasDrawnThisTurn: false,
        drawnCardId: null,
        hasDeclaredUno: false,
      };

      const newPlayers = [...state.players];
      newPlayers[playerIndex] = updatedPlayer;

      const nextPlayerIndex = TurnManager.getNextPlayerIndex(
        state.currentPlayerIndex,
        state.players.length,
        state.turnDirection,
        1
      );

      addEvent('CARD_DRAWN', playerId, { cardId: drawnCard?.id, isPlayable: false });

      return {
        ...state,
        players: newPlayers,
        currentPlayerIndex: nextPlayerIndex,
        turnNumber: state.turnNumber + 1,
        drawPile: drawResult.newDrawPile,
        discardPile: drawResult.newDiscardPile,
        unoVulnerablePlayerId: null,
        inspectionHand: null,
        sequenceNumber: seq + 1,
        updatedAt: new Date().toISOString(),
      };
    }
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
      unoVulnerablePlayerId: null,
      inspectionHand: null,
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
      unoVulnerablePlayerId: state.unoVulnerablePlayerId,
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

    // Under Mattel 42001 instructions: Failure to shout UNO incurs a 2-CARD PENALTY!
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
      unoVulnerablePlayerId: null,
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
    const pending = state.pendingActionState;
    if (!pending || pending.type !== 'AWAITING_WILD_DRAW_FOUR_RESOLUTION') {
      throw new Error('No pending Wild Draw Four resolution to accept.');
    }
    const playerIndex = state.players.findIndex((p) => p.id === playerId);
    const player = state.players[playerIndex];

    // Victim accepts +4: draws 4 cards and loses their turn
    const drawResult = DeckManager.drawCards(state.drawPile, state.discardPile, 4, rng);
    const newPlayers = [...state.players];
    newPlayers[playerIndex] = {
      ...player,
      hand: [...player.hand, ...drawResult.drawnCards],
      hasDeclaredUno: false,
      hasDrawnThisTurn: false,
      drawnCardId: null,
    };

    addEvent('WILD_DRAW_FOUR_ACCEPTED', playerId, { playerId, cardsDrawn: drawResult.drawnCards.length });

    // Check if the player who played the Wild Draw Four has 0 cards (went out)
    const offender = newPlayers.find((p) => p.id === pending.playedByPlayerId)!;
    if (HandManager.isHandEmpty(offender.hand)) {
      return this.finalizeRoundScore(
        state,
        offender.id,
        newPlayers,
        drawResult.newDrawPile,
        drawResult.newDiscardPile,
        state.topDiscardCard,
        state.activeColor ?? 'red',
        addEvent,
        seq
      );
    }

    // Otherwise, victim loses turn, turn advances
    let nextPlayerIndex: number;
    if (state.players.length === 2) {
      // In 2-player, victim loses turn, turn returns to original player
      nextPlayerIndex = state.players.findIndex((p) => p.id === pending.playedByPlayerId);
    } else {
      // In 3+, turn passes to the player following the victim
      nextPlayerIndex = TurnManager.getNextPlayerIndex(playerIndex, state.players.length, state.turnDirection, 1);
    }

    return {
      ...state,
      players: newPlayers,
      drawPile: drawResult.newDrawPile,
      discardPile: drawResult.newDiscardPile,
      currentPlayerIndex: nextPlayerIndex,
      turnNumber: state.turnNumber + 1,
      pendingActionState: null,
      inspectionHand: null,
      unoVulnerablePlayerId: null,
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
    const pending = state.pendingActionState;
    if (!pending || pending.type !== 'AWAITING_WILD_DRAW_FOUR_RESOLUTION') {
      throw new Error('No pending Wild Draw Four resolution to challenge.');
    }
    const offenderIndex = state.players.findIndex((p) => p.id === pending.playedByPlayerId);
    const challengerIndex = state.players.findIndex((p) => p.id === challengerId);

    const newPlayers = [...state.players];
    let currentDrawPile = state.drawPile;
    let currentDiscardPile = state.discardPile;

    // Grant temporary private hand disclosure to the authorized challenger only
    const inspectionHand: InspectionHand = {
      challengerPlayerId: challengerId,
      offenderPlayerId: pending.playedByPlayerId,
      hand: pending.offenderHandSnapshot,
    };

    if (!pending.wasOfficiallyLegal) {
      // Challenge SUCCEEDED: Offender was GUILTY (they held matching active color)
      // Offender draws 4 penalty cards; challenger draws 0!
      const drawResult = DeckManager.drawCards(currentDrawPile, currentDiscardPile, 4, rng);
      currentDrawPile = drawResult.newDrawPile;
      currentDiscardPile = drawResult.newDiscardPile;

      newPlayers[offenderIndex] = {
        ...newPlayers[offenderIndex],
        hand: [...newPlayers[offenderIndex].hand, ...drawResult.drawnCards],
        hasDeclaredUno: false,
        hasDrawnThisTurn: false,
        drawnCardId: null,
      };

      addEvent('WILD_DRAW_FOUR_CHALLENGE_WON', challengerId, {
        challengerId,
        offenderId: pending.playedByPlayerId,
        penaltyCards: drawResult.drawnCards.length,
        offenderHadMatchingColor: true,
      });

      // Challenger continues their turn!
      return {
        ...state,
        players: newPlayers,
        drawPile: currentDrawPile,
        discardPile: currentDiscardPile,
        currentPlayerIndex: challengerIndex,
        turnNumber: state.turnNumber + 1,
        pendingActionState: null,
        inspectionHand,
        unoVulnerablePlayerId: null,
        sequenceNumber: seq + 1,
        updatedAt: new Date().toISOString(),
      };
    } else {
      // Challenge FAILED: Offender was INNOCENT (held no matching active color)
      // Challenger draws 6 cards (4 + 2 penalty) and loses their turn!
      const drawResult = DeckManager.drawCards(currentDrawPile, currentDiscardPile, 6, rng);
      currentDrawPile = drawResult.newDrawPile;
      currentDiscardPile = drawResult.newDiscardPile;

      newPlayers[challengerIndex] = {
        ...newPlayers[challengerIndex],
        hand: [...newPlayers[challengerIndex].hand, ...drawResult.drawnCards],
        hasDeclaredUno: false,
        hasDrawnThisTurn: false,
        drawnCardId: null,
      };

      addEvent('WILD_DRAW_FOUR_CHALLENGE_LOST', challengerId, {
        challengerId,
        offenderId: pending.playedByPlayerId,
        penaltyCards: drawResult.drawnCards.length,
        offenderWasInnocent: true,
      });

      // Check if offender had 0 cards (went out)
      const offender = newPlayers[offenderIndex];
      if (HandManager.isHandEmpty(offender.hand)) {
        return this.finalizeRoundScore(
          state,
          offender.id,
          newPlayers,
          currentDrawPile,
          currentDiscardPile,
          state.topDiscardCard,
          state.activeColor ?? 'red',
          addEvent,
          seq
        );
      }

      // Turn advances: challenger loses turn
      let nextPlayerIndex: number;
      if (state.players.length === 2) {
        nextPlayerIndex = offenderIndex;
      } else {
        nextPlayerIndex = TurnManager.getNextPlayerIndex(challengerIndex, state.players.length, state.turnDirection, 1);
      }

      return {
        ...state,
        players: newPlayers,
        drawPile: currentDrawPile,
        discardPile: currentDiscardPile,
        currentPlayerIndex: nextPlayerIndex,
        turnNumber: state.turnNumber + 1,
        pendingActionState: null,
        inspectionHand,
        unoVulnerablePlayerId: null,
        sequenceNumber: seq + 1,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  private static processStartNextRound(
    state: GameState,
    _playerId: string,
    addEvent: (t: string, p: string | undefined, pl: Record<string, unknown>) => void,
    seq: number,
    rng: RandomNumberGenerator
  ): GameState {
    const nextRoundState = GameFactory.startNextRound(state, rng);

    addEvent('ROUND_STARTED', undefined, {
      roundNumber: nextRoundState.roundNumber,
      dealerIndex: nextRoundState.dealerIndex,
      startingPlayerIndex: nextRoundState.currentPlayerIndex,
    });

    return {
      ...nextRoundState,
      sequenceNumber: seq + 1,
    };
  }

  private static finalizeRoundScore(
    state: GameState,
    winnerPlayerId: string,
    players: Player[],
    drawPile: readonly Card[],
    discardPile: readonly Card[],
    topDiscardCard: Card,
    activeColor: CardColor,
    addEvent: (t: string, p: string | undefined, pl: Record<string, unknown>) => void,
    seq: number
  ): GameState {
    const winnerIndex = players.findIndex((p) => p.id === winnerPlayerId);
    const winner = players[winnerIndex];

    const loserHands = players.filter((p) => p.id !== winnerPlayerId).map((p) => p.hand);
    const roundScore = loserHands.reduce((acc, h) => acc + HandManager.calculateHandScore(h), 0);
    const newCumulativeScore = winner.score + roundScore;
    const newTotalSessionScore = (winner.cumulativeScore ?? winner.score) + roundScore;

    const updatedWinner = {
      ...winner,
      score: newCumulativeScore,
      roundScore,
      cumulativeScore: newTotalSessionScore,
    };
    const finalPlayers = players.map((p) =>
      p.id === winnerPlayerId
        ? updatedWinner
        : { ...p, roundScore: 0, cumulativeScore: p.cumulativeScore ?? p.score }
    );

    const roundWinnerRecord: GameWinner = {
      id: winnerPlayerId,
      username: winner.username,
      score: newCumulativeScore,
      roundScore,
    };

    const isMatchOver = newCumulativeScore >= state.targetScore;

    if (isMatchOver) {
      addEvent('GAME_COMPLETED', winnerPlayerId, {
        winner: roundWinnerRecord,
        roundScore,
        finalScore: newCumulativeScore,
        targetScore: state.targetScore,
      });

      return {
        ...state,
        status: 'COMPLETED',
        players: finalPlayers,
        drawPile,
        discardPile,
        topDiscardCard,
        activeColor,
        roundWinner: roundWinnerRecord,
        winner: roundWinnerRecord,
        pendingActionState: null,
        inspectionHand: null,
        unoVulnerablePlayerId: null,
        sequenceNumber: seq + 1,
        updatedAt: new Date().toISOString(),
      };
    } else {
      addEvent('ROUND_COMPLETED', winnerPlayerId, {
        roundWinner: roundWinnerRecord,
        roundNumber: state.roundNumber,
        roundScore,
        cumulativeScore: newCumulativeScore,
        targetScore: state.targetScore,
      });

      return {
        ...state,
        status: 'ROUND_OVER',
        players: finalPlayers,
        drawPile,
        discardPile,
        topDiscardCard,
        activeColor,
        roundWinner: roundWinnerRecord,
        winner: null,
        pendingActionState: null,
        inspectionHand: null,
        unoVulnerablePlayerId: null,
        sequenceNumber: seq + 1,
        updatedAt: new Date().toISOString(),
      };
    }
  }
}
