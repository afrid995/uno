import { GameState } from '../../game/game.types';
import { GameAction } from '../../actions/action.types';
import { Card, CardColor, FlipSide } from '../../cards/card.types';
import { isWildCard } from '../../cards/card.validation';
import { HandManager } from '../../players/hand.manager';
import { ValidationResult } from '../../validation/move.validator';
import { FLIP_LIGHT_COLORS, FLIP_DARK_COLORS } from './flip.constants';

export class FlipMoveValidator {
  /**
   * Asserts whether a card matches the active discard pile top and active color on the active side.
   */
  static isCardMatch(card: Card, activeColor: CardColor, topDiscard: Card): boolean {
    // Wild cards (Wild, Wild Draw Two, Wild Draw Color) match any card
    if (isWildCard(card)) {
      return true;
    }

    // Color match
    if (card.color === activeColor) {
      return true;
    }

    // Value / symbol match (e.g. 5 on 5, Reverse on Reverse, Flip on Flip)
    if (card.value === topDiscard.value) {
      return true;
    }

    return false;
  }

  /**
   * Checks if a chosen color is valid for the current active side.
   */
  static isValidChosenColor(color: CardColor | undefined, side: FlipSide): boolean {
    if (!color) return false;
    if (side === 'LIGHT') {
      return (FLIP_LIGHT_COLORS as readonly string[]).includes(color);
    } else {
      return (FLIP_DARK_COLORS as readonly string[]).includes(color);
    }
  }

  /**
   * Pure validation function asserting whether an action is legal for UNO Flip.
   */
  static validate(state: GameState, action: GameAction): ValidationResult {
    // START_NEXT_ROUND requires ROUND_OVER status
    if (action.type === 'START_NEXT_ROUND') {
      if (state.status !== 'ROUND_OVER') {
        return {
          valid: false,
          code: 'ROUND_NOT_OVER',
          message: 'Cannot start the next round until the current round is over.',
        };
      }
      return { valid: true };
    }

    if (state.status !== 'IN_PROGRESS') {
      return {
        valid: false,
        code: 'MATCH_NOT_ACTIVE',
        message: 'Actions can only be executed while the match is in progress.',
      };
    }

    let playerId = '';
    if ('playerId' in action) {
      playerId = action.playerId;
    } else if ('challengerPlayerId' in action) {
      playerId = action.challengerPlayerId;
    }

    const player = state.players.find((p) => p.id === playerId);
    if (!player) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'Player is not registered in this match.',
      };
    }

    // Check pending action states (Wild Draw Two or Wild Draw Color)
    if (state.pendingActionState) {
      const pending = state.pendingActionState;
      if (pending.type === 'AWAITING_WILD_DRAW_TWO_RESOLUTION') {
        if (action.type !== 'ACCEPT_WILD_DRAW_TWO' && action.type !== 'CHALLENGE_WILD_DRAW_TWO') {
          return {
            valid: false,
            code: 'PENDING_ACTION_REQUIRED',
            message: 'Must resolve pending Wild Draw Two challenge or accept before continuing gameplay.',
          };
        }
      } else if (pending.type === 'AWAITING_WILD_DRAW_COLOR_RESOLUTION') {
        if (action.type !== 'ACCEPT_WILD_DRAW_COLOR' && action.type !== 'CHALLENGE_WILD_DRAW_COLOR') {
          return {
            valid: false,
            code: 'PENDING_ACTION_REQUIRED',
            message: 'Must resolve pending Wild Draw Color challenge or accept before continuing gameplay.',
          };
        }
      }
    }

    switch (action.type) {
      case 'PLAY_CARD':
        return this.validatePlayCard(state, player.id, action.cardId, action.chosenColor);

      case 'DRAW_CARD':
        return this.validateDrawCard(state, player.id);

      case 'PASS_TURN':
        return this.validatePassTurn(state, player.id);

      case 'CALL_UNO':
        return this.validateCallUno(state, player.id);

      case 'CHALLENGE_UNO_FAILURE':
        return this.validateChallengeUno(state, action.challengerPlayerId, action.targetPlayerId);

      case 'CHALLENGE_WILD_DRAW_TWO':
      case 'ACCEPT_WILD_DRAW_TWO':
        return this.validateWildDrawTwoResolution(state, player.id);

      case 'CHALLENGE_WILD_DRAW_COLOR':
      case 'ACCEPT_WILD_DRAW_COLOR':
        return this.validateWildDrawColorResolution(state, player.id);

      default:
        return { valid: false, code: 'MATCH_NOT_ACTIVE', message: 'Unknown action type.' };
    }
  }

  private static validatePlayCard(
    state: GameState,
    playerId: string,
    cardId: string,
    chosenColor?: CardColor
  ): ValidationResult {
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer.id !== playerId) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: `It is not player ${playerId}'s turn. Current turn: ${currentPlayer.id}`,
      };
    }

    const card = HandManager.findCard(currentPlayer.hand, cardId);
    if (!card) {
      return {
        valid: false,
        code: 'CARD_NOT_IN_HAND',
        message: `Card ${cardId} is not in player's hand.`,
      };
    }

    // If player already drew this turn, official rule: can only play drawn card
    if (currentPlayer.hasDrawnThisTurn) {
      if (currentPlayer.drawnCardId !== cardId) {
        return {
          valid: false,
          code: 'INVALID_CARD_MATCH',
          message: 'After drawing, you may only play the card that was just drawn.',
        };
      }
    }

    const activeSide: FlipSide = state.activeSide ?? 'LIGHT';

    // Wild cards require valid chosen color for current side
    if (isWildCard(card)) {
      if (!chosenColor) {
        return {
          valid: false,
          code: 'MUST_CHOOSE_COLOR',
          message: `Must specify chosenColor when playing a ${card.value} card.`,
        };
      }
      if (!this.isValidChosenColor(chosenColor, activeSide)) {
        return {
          valid: false,
          code: 'MUST_CHOOSE_COLOR',
          message: `Color "${chosenColor}" is not valid for ${activeSide} side.`,
        };
      }
    }

    // Match check against active color and top discard
    if (!this.isCardMatch(card, state.activeColor, state.topDiscardCard)) {
      return {
        valid: false,
        code: 'INVALID_CARD_MATCH',
        message: `Card ${card.color ?? 'wild'} ${card.value} does not match active color ${state.activeColor} or top card ${state.topDiscardCard.value}.`,
      };
    }

    return { valid: true };
  }

  private static validateDrawCard(state: GameState, playerId: string): ValidationResult {
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer.id !== playerId) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: 'You can only draw a card on your turn.',
      };
    }

    if (currentPlayer.hasDrawnThisTurn) {
      return {
        valid: false,
        code: 'ALREADY_DRAWN',
        message: 'You have already drawn a card this turn. You must either play it or pass.',
      };
    }

    return { valid: true };
  }

  private static validatePassTurn(state: GameState, playerId: string): ValidationResult {
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer.id !== playerId) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: 'You can only pass on your turn.',
      };
    }

    if (!currentPlayer.hasDrawnThisTurn) {
      return {
        valid: false,
        code: 'INVALID_PASS',
        message: 'You must draw a card before passing your turn.',
      };
    }

    return { valid: true };
  }

  private static validateCallUno(state: GameState, playerId: string): ValidationResult {
    const player = state.players.find((p) => p.id === playerId);
    if (!player) {
      return { valid: false, code: 'INVALID_PLAYER', message: 'Player not found.' };
    }

    if (player.hand.length > 2) {
      return {
        valid: false,
        code: 'INVALID_UNO_CALL',
        message: 'You can only call UNO when you hold 2 cards or 1 card.',
      };
    }

    return { valid: true };
  }

  private static validateChallengeUno(
    state: GameState,
    challengerPlayerId: string,
    targetPlayerId: string
  ): ValidationResult {
    if (challengerPlayerId === targetPlayerId) {
      return {
        valid: false,
        code: 'CANNOT_CHALLENGE_SELF',
        message: 'You cannot catch yourself for a missed UNO declaration.',
      };
    }

    if (state.unoVulnerablePlayerId !== targetPlayerId) {
      return {
        valid: false,
        code: 'TARGET_NOT_VULNERABLE',
        message: `Player ${targetPlayerId} is not vulnerable to a missed-UNO challenge.`,
      };
    }

    return { valid: true };
  }

  private static validateWildDrawTwoResolution(state: GameState, playerId: string): ValidationResult {
    if (
      !state.pendingActionState ||
      state.pendingActionState.type !== 'AWAITING_WILD_DRAW_TWO_RESOLUTION'
    ) {
      return {
        valid: false,
        code: 'NO_PENDING_CHALLENGE',
        message: 'No pending Wild Draw Two challenge to resolve.',
      };
    }

    if (state.pendingActionState.victimPlayerId !== playerId) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: 'Only the targeted victim may challenge or accept Wild Draw Two.',
      };
    }

    return { valid: true };
  }

  private static validateWildDrawColorResolution(state: GameState, playerId: string): ValidationResult {
    if (
      !state.pendingActionState ||
      state.pendingActionState.type !== 'AWAITING_WILD_DRAW_COLOR_RESOLUTION'
    ) {
      return {
        valid: false,
        code: 'NO_PENDING_CHALLENGE',
        message: 'No pending Wild Draw Color challenge to resolve.',
      };
    }

    if (state.pendingActionState.victimPlayerId !== playerId) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: 'Only the targeted victim may challenge or accept Wild Draw Color.',
      };
    }

    return { valid: true };
  }
}
