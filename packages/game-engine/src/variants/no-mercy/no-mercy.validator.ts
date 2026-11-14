import { GameState } from '../../game/game.types';
import { GameAction } from '../../actions/action.types';
import { Card, CardColor, ClassicCardColor } from '../../cards/card.types';
import { isWildCard } from '../../cards/card.validation';
import { ValidationResult } from '../../validation/move.validator';
import { getNoMercyStackCardValue, NO_MERCY_COLORS } from './no-mercy.constants';

export class NoMercyMoveValidator {
  /**
   * Asserts whether a card matches the active discard pile top and active color for No Mercy.
   */
  static isCardMatch(card: Card, activeColor: CardColor | null, topDiscard: Card): boolean {
    // All Wild cards can be played on any card
    if (card.type === 'wild' || isWildCard(card)) {
      return true;
    }

    // Color match
    if (activeColor !== null && card.color === activeColor) {
      return true;
    }

    // Value / symbol match (e.g. Red 5 on Yellow 5, or Green Draw Two on Blue Draw Two)
    if (card.value === topDiscard.value) {
      return true;
    }

    return false;
  }

  static validate(state: GameState, action: GameAction): ValidationResult {
    // 1. Next round validation
    if (action.type === 'START_NEXT_ROUND') {
      if (state.status !== 'ROUND_OVER') {
        return {
          valid: false,
          code: 'ROUND_NOT_OVER',
          message: 'Cannot start next round while match is still in progress.',
        };
      }
      return { valid: true };
    }

    // All gameplay actions require an active match
    if (state.status !== 'IN_PROGRESS') {
      return {
        valid: false,
        code: 'MATCH_NOT_ACTIVE',
        message: 'Cannot perform gameplay actions when match is not in progress.',
      };
    }

    // 2. Pending multi-step resolution validation
    if (state.pendingActionState) {
      return this.validatePendingAction(state, action);
    }

    // 3. Normal turn actions validation
    switch (action.type) {
      case 'PLAY_CARD':
        return this.validatePlayCard(state, action.playerId, action.cardId, action.chosenColor);
      case 'DRAW_CARD':
        return this.validateDrawCard(state, action.playerId);
      case 'PASS_TURN':
        return {
          valid: false,
          code: 'INVALID_PASS',
          message: "Under UNO Show 'em No Mercy rules, drawn cards must be played immediately if playable.",
        };
      case 'CALL_UNO':
        return this.validateCallUno(state, action.playerId);
      case 'CHALLENGE_UNO_FAILURE':
        return this.validateChallengeUno(state, action.challengerPlayerId, action.targetPlayerId);
      default:
        return {
          valid: false,
          code: 'PENDING_ACTION_REQUIRED',
          message: `Action ${action.type} is not recognized for UNO Show 'em No Mercy.`,
        };
    }
  }

  private static validatePendingAction(state: GameState, action: GameAction): ValidationResult {
    const pending = state.pendingActionState!;

    if (pending.type === 'AWAITING_STACK_RESOLUTION') {
      if (action.type === 'PLAY_CARD') {
        if (action.playerId !== pending.targetPlayerId) {
          return {
            valid: false,
            code: 'NOT_YOUR_TURN',
            message: 'Only the player currently targeted by the Draw penalty may stack or accept it.',
          };
        }

        const player = state.players.find((p) => p.id === action.playerId);
        if (!player) {
          return { valid: false, code: 'INVALID_PLAYER', message: 'Player not found.' };
        }

        const card = player.hand.find((c) => c.id === action.cardId);
        if (!card) {
          return { valid: false, code: 'CARD_NOT_IN_HAND', message: 'Card not in hand.' };
        }

        const stackValue = getNoMercyStackCardValue(card.value);
        if (stackValue === null) {
          return {
            valid: false,
            code: 'INVALID_CARD_MATCH',
            message: `Card ${card.value} is not an eligible Draw Card (+2, +4, +6, +10) and cannot be stacked onto an active Draw penalty.`,
          };
        }

        // Must be equal or higher value than the last played draw card
        if (stackValue < pending.lastStackedValue) {
          return {
            valid: false,
            code: 'INVALID_CARD_MATCH',
            message: `Cannot stack a +${stackValue} onto a +${pending.lastStackedValue}. Stacking card must be equal or higher in value.`,
          };
        }

        // If card is a wild draw card, verify chosenColor is provided
        if (card.type === 'wild' && !action.chosenColor) {
          return {
            valid: false,
            code: 'MUST_CHOOSE_COLOR',
            message: 'Must choose a color when playing a Wild Draw card.',
          };
        }

        return { valid: true };
      }

      if (action.type === 'ACCEPT_STACK_PENALTY' || action.type === 'DRAW_CARD') {
        if (action.playerId !== pending.targetPlayerId) {
          return {
            valid: false,
            code: 'NOT_YOUR_TURN',
            message: 'Only the targeted player may accept the Draw penalty.',
          };
        }
        return { valid: true };
      }

      return {
        valid: false,
        code: 'PENDING_ACTION_REQUIRED',
        message: 'Must stack an eligible Draw card or accept the accumulated draw penalty.',
      };
    }

    if (pending.type === 'AWAITING_7S_SWAP_SELECTION') {
      if (action.type !== 'CHOOSE_7S_SWAP_TARGET') {
        return {
          valid: false,
          code: 'PENDING_ACTION_REQUIRED',
          message: 'Must select another active player to swap hands with.',
        };
      }

      if (action.playerId !== pending.sourcePlayerId) {
        return {
          valid: false,
          code: 'NOT_YOUR_TURN',
          message: 'Only the player who played the 7 can select the swap target.',
        };
      }

      if (action.playerId === action.targetPlayerId) {
        return {
          valid: false,
          code: 'INVALID_PLAYER',
          message: 'Cannot swap hands with yourself. Choose an active opponent.',
        };
      }

      const target = state.players.find((p) => p.id === action.targetPlayerId);
      if (!target || target.isEliminated) {
        return {
          valid: false,
          code: 'INVALID_PLAYER',
          message: 'Target player is invalid or already eliminated.',
        };
      }

      return { valid: true };
    }

    if (pending.type === 'AWAITING_COLOR_ROULETTE_SELECTION') {
      if (action.type !== 'CHOOSE_COLOR_ROULETTE_COLOR') {
        return {
          valid: false,
          code: 'PENDING_ACTION_REQUIRED',
          message: 'The targeted player must select a color for the Wild Color Roulette.',
        };
      }

      if (action.playerId !== pending.victimPlayerId) {
        return {
          valid: false,
          code: 'NOT_YOUR_TURN',
          message: 'Only the player targeted by Wild Color Roulette can select the color.',
        };
      }

      if (!NO_MERCY_COLORS.includes(action.chosenColor as ClassicCardColor)) {
        return {
          valid: false,
          code: 'INVALID_CHOSEN_COLOR',
          message: `Chosen color must be one of: ${NO_MERCY_COLORS.join(', ')}.`,
        };
      }

      return { valid: true };
    }

    return {
      valid: false,
      code: 'PENDING_ACTION_REQUIRED',
      message: 'A multi-step action is currently pending resolution.',
    };
  }

  private static validatePlayCard(
    state: GameState,
    playerId: string,
    cardId: string,
    chosenColor?: CardColor
  ): ValidationResult {
    const currentGuestId = state.players[state.currentPlayerIndex]?.id;
    if (currentGuestId !== playerId) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: 'It is not your turn to play.',
      };
    }

    const player = state.players.find((p) => p.id === playerId);
    if (!player) {
      return { valid: false, code: 'INVALID_PLAYER', message: 'Player not found.' };
    }

    if (player.isEliminated) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'Eliminated players cannot play cards.',
      };
    }

    const card = player.hand.find((c) => c.id === cardId);
    if (!card) {
      return {
        valid: false,
        code: 'CARD_NOT_IN_HAND',
        message: 'The requested card is not in your hand.',
      };
    }

    // Wild Color Roulette: Next player chooses color, so chosenColor is not required on play
    if (card.value === 'wild_color_roulette') {
      return { valid: true };
    }

    // Other Wild cards require chosenColor
    if (card.type === 'wild') {
      if (!chosenColor) {
        return {
          valid: false,
          code: 'MUST_CHOOSE_COLOR',
          message: 'You must choose an active color when playing a Wild card.',
        };
      }
      if (!NO_MERCY_COLORS.includes(chosenColor as ClassicCardColor)) {
        return {
          valid: false,
          code: 'INVALID_CHOSEN_COLOR',
          message: 'Invalid chosen color.',
        };
      }
      return { valid: true };
    }

    // Regular matching rule
    if (!this.isCardMatch(card, state.activeColor, state.topDiscardCard)) {
      return {
        valid: false,
        code: 'INVALID_CARD_MATCH',
        message: `Card ${card.color} ${card.value} does not match active color ${state.activeColor} or top card ${state.topDiscardCard.value}.`,
      };
    }

    return { valid: true };
  }

  private static validateDrawCard(state: GameState, playerId: string): ValidationResult {
    const currentGuestId = state.players[state.currentPlayerIndex]?.id;
    if (currentGuestId !== playerId) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: 'It is not your turn to draw.',
      };
    }

    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.isEliminated) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'Player is invalid or eliminated.',
      };
    }

    return { valid: true };
  }

  private static validateCallUno(state: GameState, playerId: string): ValidationResult {
    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.isEliminated) {
      return { valid: false, code: 'INVALID_PLAYER', message: 'Player not found or eliminated.' };
    }

    if (player.hand.length > 2) {
      return {
        valid: false,
        code: 'INVALID_UNO_CALL',
        message: 'You can only call UNO when you have 1 or 2 cards remaining.',
      };
    }

    return { valid: true };
  }

  private static validateChallengeUno(
    state: GameState,
    challengerId: string,
    targetPlayerId: string
  ): ValidationResult {
    if (challengerId === targetPlayerId) {
      return {
        valid: false,
        code: 'CANNOT_CHALLENGE_SELF',
        message: 'You cannot challenge yourself.',
      };
    }

    const target = state.players.find((p) => p.id === targetPlayerId);
    if (!target || target.isEliminated) {
      return { valid: false, code: 'INVALID_PLAYER', message: 'Target player not found or eliminated.' };
    }

    if (state.unoVulnerablePlayerId !== targetPlayerId) {
      return {
        valid: false,
        code: 'TARGET_NOT_VULNERABLE',
        message: 'Player is not currently vulnerable to an UNO challenge.',
      };
    }

    return { valid: true };
  }
}
