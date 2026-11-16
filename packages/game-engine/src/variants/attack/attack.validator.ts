import { GameState } from '../../game/game.types';
import { GameAction, PlayCardAction, CallUnoAction, ChallengeUnoFailureAction, ChooseAttackTargetAction } from '../../actions/action.types';
import { CardColor } from '../../cards/card.types';
import { isWildCard } from '../../cards/card.validation';
import { ValidationResult } from '../../validation/move.validator';

const VALID_ATTACK_COLORS: readonly CardColor[] = ['red', 'yellow', 'green', 'blue'];

export class AttackMoveValidator {
  static validate(state: GameState, action: GameAction): ValidationResult {
    // START_NEXT_ROUND requires ROUND_OVER status
    if (action.type === 'START_NEXT_ROUND') {
      return this.validateStartNextRound(state, action.triggeredByPlayerId);
    }

    // All other actions require IN_PROGRESS match status
    if (state.status !== 'IN_PROGRESS') {
      return {
        valid: false,
        code: 'MATCH_NOT_ACTIVE',
        message: 'Actions can only be executed while the match is in progress.',
      };
    }

    // Resolve player ID
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

    // Pending action state checks
    if (state.pendingActionState) {
      const pendingType = state.pendingActionState.type;

      if (pendingType === 'AWAITING_STARTING_WILD_COLOR_SELECTION') {
        if (action.type !== 'CHOOSE_STARTING_WILD_COLOR') {
          return {
            valid: false,
            code: 'PENDING_ACTION_REQUIRED',
            message: 'Must select color for starting wild card.',
          };
        }
        return this.validateChooseStartingWildColor(state, action.playerId, action.chosenColor);
      }

      if (pendingType === 'AWAITING_STARTING_ATTACK_SELECTION') {
        if (action.type !== 'CHOOSE_ATTACK_TARGET') {
          return {
            valid: false,
            code: 'PENDING_ACTION_REQUIRED',
            message: 'Must choose attack target for starting Wild Attack-Attack card.',
          };
        }
        return this.validateChooseAttackTarget(state, action);
      }

      if (pendingType === 'AWAITING_ATTACK_TARGET_SELECTION') {
        if (action.type !== 'CHOOSE_ATTACK_TARGET') {
          return {
            valid: false,
            code: 'PENDING_ACTION_REQUIRED',
            message: 'Must choose attack target for Wild Attack-Attack card.',
          };
        }
        return this.validateChooseAttackTarget(state, action);
      }

      return {
        valid: false,
        code: 'PENDING_ACTION_REQUIRED',
        message: `Pending action "${pendingType}" must be resolved.`,
      };
    }

    // Normal turn actions (no pending state)
    switch (action.type) {
      case 'PLAY_CARD':
        return this.validatePlayCard(state, action);
      case 'DRAW_CARD':
        return this.validateDrawCard(state, action.playerId);
      case 'PASS_TURN':
        // In UNO Attack: pressing the launcher ends turn automatically.
        // A player cannot pass turn without hitting the launcher.
        return {
          valid: false,
          code: 'INVALID_PASS',
          message: 'In UNO Attack, you cannot pass without pressing the Card Launcher button.',
        };
      case 'CALL_UNO':
        return this.validateCallUno(state, action);
      case 'CHALLENGE_UNO_FAILURE':
        return this.validateChallengeUnoFailure(state, action);
      default:
        return {
          valid: false,
          code: 'PENDING_ACTION_REQUIRED',
          message: `Action type "${action.type}" is not recognized in UNO Attack.`,
        };
    }
  }

  static validatePlayCard(state: GameState, action: PlayCardAction): ValidationResult {
    const playerIndex = state.players.findIndex((p) => p.id === action.playerId);
    if (playerIndex !== state.currentPlayerIndex) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: 'It is not your turn to play.',
      };
    }

    const player = state.players[playerIndex];
    const card = player.hand.find((c) => c.id === action.cardId);
    if (!card) {
      return {
        valid: false,
        code: 'CARD_NOT_IN_HAND',
        message: 'The specified card is not in your hand.',
      };
    }

    // Card matching rules for UNO Attack:
    // 1. Wild cards (wild, wild_hit_4, wild_attack_attack, wild_customizable) can be played on any card
    if (isWildCard(card) || card.type === 'wild') {
      if (!action.chosenColor || !VALID_ATTACK_COLORS.includes(action.chosenColor)) {
        return {
          valid: false,
          code: 'MUST_CHOOSE_COLOR',
          message: 'You must select a valid color (red, yellow, green, or blue) when playing a Wild card.',
        };
      }

      if (card.value === 'wild_attack_attack' && action.targetPlayerId) {
        if (action.targetPlayerId === action.playerId) {
          return {
            valid: false,
            code: 'INVALID_PLAYER',
            message: 'You cannot choose yourself as the attack target.',
          };
        }
        const targetPlayer = state.players.find((p) => p.id === action.targetPlayerId);
        if (!targetPlayer) {
          return {
            valid: false,
            code: 'INVALID_PLAYER',
            message: 'Target player is not registered in this match.',
          };
        }
      }

      return { valid: true };
    }

    // 2. Discard All card: matches active color or another Discard All card
    if (card.value === 'discard_all') {
      if (
        (state.activeColor && card.color === state.activeColor) ||
        state.topDiscardCard.value === 'discard_all'
      ) {
        return { valid: true };
      }
      return {
        valid: false,
        code: 'INVALID_CARD_MATCH',
        message: 'Discard All card must match the active color or another Discard All card.',
      };
    }

    // 3. Number or standard Action cards (Skip, Reverse, Hit 2): match active color or symbol/number
    const colorMatches = state.activeColor !== null && card.color === state.activeColor;
    const valueMatches = card.value === state.topDiscardCard.value;

    if (!colorMatches && !valueMatches) {
      return {
        valid: false,
        code: 'INVALID_CARD_MATCH',
        message: `Card ${card.value} (${card.color}) does not match active color (${state.activeColor}) or top card value (${state.topDiscardCard.value}).`,
      };
    }

    return { valid: true };
  }

  static validateDrawCard(state: GameState, playerId: string): ValidationResult {
    const playerIndex = state.players.findIndex((p) => p.id === playerId);
    if (playerIndex !== state.currentPlayerIndex) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: 'It is not your turn to hit the Launcher.',
      };
    }

    const player = state.players[playerIndex];
    if (player.hasDrawnThisTurn) {
      return {
        valid: false,
        code: 'ALREADY_DRAWN',
        message: 'You have already pressed the Launcher this turn.',
      };
    }

    return { valid: true };
  }

  static validateCallUno(state: GameState, action: CallUnoAction): ValidationResult {
    if (state.status !== 'IN_PROGRESS') {
      return { valid: false, code: 'MATCH_NOT_ACTIVE', message: 'Cannot declare UNO: match is not in progress.' };
    }

    const player = state.players.find((p) => p.id === action.playerId);
    if (!player || player.isEliminated) {
      return { valid: false, code: 'INVALID_PLAYER', message: 'Player not found or eliminated.' };
    }

    const isCurrentTurn = state.players[state.currentPlayerIndex]?.id === action.playerId;
    if (!isCurrentTurn) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: 'You can only declare UNO on your turn.',
      };
    }

    // Player can call UNO ONLY if they hold exactly 2 cards and haven't declared it yet
    if (player.hand.length > 2) {
      return {
        valid: false,
        code: 'INVALID_UNO_CALL',
        message: 'You can only declare UNO when you hold 2 cards before playing down to 1.',
      };
    }

    if (player.hand.length < 2) {
      return {
        valid: false,
        code: 'INVALID_UNO_CALL',
        message: 'You cannot declare UNO after playing your card.',
      };
    }

    if (player.hasDeclaredUno) {
      return {
        valid: false,
        code: 'INVALID_UNO_CALL',
        message: 'You have already declared UNO.',
      };
    }

    return { valid: true };
  }

  static validateChallengeUnoFailure(state: GameState, action: ChallengeUnoFailureAction): ValidationResult {
    if (state.status !== 'IN_PROGRESS') {
      return { valid: false, code: 'MATCH_NOT_ACTIVE', message: 'Cannot challenge UNO: match is not in progress.' };
    }

    if (action.challengerPlayerId === action.targetPlayerId) {
      return {
        valid: false,
        code: 'CANNOT_CHALLENGE_SELF',
        message: 'You cannot challenge yourself for a missed UNO declaration.',
      };
    }

    const target = state.players.find((p) => p.id === action.targetPlayerId);
    if (!target || target.isEliminated) {
      return { valid: false, code: 'INVALID_PLAYER', message: 'Target player not found or eliminated.' };
    }

    if (state.unoVulnerablePlayerId !== action.targetPlayerId) {
      return {
        valid: false,
        code: 'TARGET_NOT_VULNERABLE',
        message: 'Target player is not vulnerable to a missed-UNO challenge.',
      };
    }

    if (target.hand.length !== 1) {
      return {
        valid: false,
        code: 'TARGET_NOT_VULNERABLE',
        message: 'Target player does not have exactly 1 card.',
      };
    }

    if (target.hasDeclaredUno) {
      return {
        valid: false,
        code: 'TARGET_NOT_VULNERABLE',
        message: 'Target player has already declared UNO.',
      };
    }

    return { valid: true };
  }

  static validateChooseStartingWildColor(
    state: GameState,
    playerId: string,
    chosenColor: CardColor
  ): ValidationResult {
    if (state.pendingActionState?.type !== 'AWAITING_STARTING_WILD_COLOR_SELECTION') {
      return {
        valid: false,
        code: 'NO_STARTING_WILD_PENDING',
        message: 'No starting wild color selection is pending.',
      };
    }

    if (state.pendingActionState.designatedPlayerId !== playerId) {
      return {
        valid: false,
        code: 'UNAUTHORIZED_CHOOSER',
        message: 'You are not the designated player to select the starting color.',
      };
    }

    if (!VALID_ATTACK_COLORS.includes(chosenColor)) {
      return {
        valid: false,
        code: 'INVALID_CHOSEN_COLOR',
        message: `Chosen color "${chosenColor}" is invalid. Must be red, yellow, green, or blue.`,
      };
    }

    return { valid: true };
  }

  static validateChooseAttackTarget(state: GameState, action: ChooseAttackTargetAction): ValidationResult {
    const pending = state.pendingActionState;
    if (
      pending?.type !== 'AWAITING_ATTACK_TARGET_SELECTION' &&
      pending?.type !== 'AWAITING_STARTING_ATTACK_SELECTION'
    ) {
      return {
        valid: false,
        code: 'NO_PENDING_CHALLENGE',
        message: 'No attack target selection is pending.',
      };
    }

    const expectedPlayerId =
      pending.type === 'AWAITING_ATTACK_TARGET_SELECTION'
        ? pending.playedByPlayerId
        : pending.designatedPlayerId;

    if (action.playerId !== expectedPlayerId) {
      return {
        valid: false,
        code: 'UNAUTHORIZED_CHOOSER',
        message: 'You are not the player authorized to choose an attack target.',
      };
    }

    if (action.targetPlayerId === action.playerId) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'You cannot choose yourself as the attack target.',
      };
    }

    const target = state.players.find((p) => p.id === action.targetPlayerId);
    if (!target) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'Specified target player does not exist in this match.',
      };
    }

    if (pending.type === 'AWAITING_STARTING_ATTACK_SELECTION' && action.chosenColor) {
      if (!VALID_ATTACK_COLORS.includes(action.chosenColor)) {
        return {
          valid: false,
          code: 'INVALID_CHOSEN_COLOR',
          message: 'Invalid starting color specified.',
        };
      }
    }

    return { valid: true };
  }

  static validateStartNextRound(state: GameState, _playerId: string): ValidationResult {
    if (state.status !== 'ROUND_OVER') {
      return {
        valid: false,
        code: 'ROUND_NOT_OVER',
        message: 'Next round can only be started when the current round has concluded.',
      };
    }
    return { valid: true };
  }
}
