import { GameState } from '../../game/game.types';
import { GameAction } from '../../actions/action.types';
import { ValidationResult } from '../../validation/move.validator';

export class AllWildMoveValidator {
  static validate(state: GameState, action: GameAction): ValidationResult {
    switch (action.type) {
      case 'PLAY_CARD':
        return this.validatePlayCard(state, action.playerId, action.cardId);

      case 'DRAW_CARD':
        return this.validateDrawCard(state, action.playerId);

      case 'PASS_TURN':
        return this.validatePassTurn(state, action.playerId);

      case 'CALL_UNO':
        return this.validateCallUno(state, action.playerId);

      case 'CHALLENGE_UNO_FAILURE':
        return this.validateChallengeUno(state, action.challengerPlayerId, action.targetPlayerId);

      case 'CHOOSE_TARGETED_DRAW_TWO_TARGET':
        return this.validateTargetedDrawTwo(state, action.playerId, action.targetPlayerId);

      case 'CHOOSE_FORCED_SWAP_TARGET':
        return this.validateForcedSwap(state, action.playerId, action.targetPlayerId);

      case 'START_NEXT_ROUND':
        return this.validateStartNextRound(state, action.triggeredByPlayerId);

      default:
        return {
          valid: false,
          code: 'INVALID_PLAYER',
          message: `Action type '${(action as GameAction).type}' is not recognized for UNO All Wild.`,
        };
    }
  }

  private static validatePlayCard(
    state: GameState,
    playerId: string,
    cardId: string
  ): ValidationResult {
    if (state.status !== 'IN_PROGRESS') {
      return {
        valid: false,
        code: 'MATCH_NOT_ACTIVE',
        message: 'Cannot play card: match is not in progress.',
      };
    }

    if (state.pendingActionState) {
      return {
        valid: false,
        code: 'PENDING_ACTION_REQUIRED',
        message: `Cannot play card: pending action '${state.pendingActionState.type}' must be resolved first.`,
      };
    }

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer.id !== playerId) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: 'Cannot play card: it is not your turn.',
      };
    }

    const card = currentPlayer.hand.find((c) => c.id === cardId);
    if (!card) {
      return {
        valid: false,
        code: 'CARD_NOT_IN_HAND',
        message: `Card '${cardId}' is not in your hand.`,
      };
    }

    // Official Mattel HHL33 Draw Decision Rule:
    // If a player draws instead of playing, they may either play the drawn card immediately or pass.
    // They cannot play a different card from their hand.
    if (currentPlayer.hasDrawnThisTurn) {
      if (currentPlayer.drawnCardId !== cardId) {
        return {
          valid: false,
          code: 'INVALID_CARD_MATCH',
          message: 'After drawing, you may only play the newly drawn card, or pass your turn.',
        };
      }
    }

    return { valid: true };
  }

  private static validateDrawCard(state: GameState, playerId: string): ValidationResult {
    if (state.status !== 'IN_PROGRESS') {
      return {
        valid: false,
        code: 'MATCH_NOT_ACTIVE',
        message: 'Cannot draw card: match is not in progress.',
      };
    }

    if (state.pendingActionState) {
      return {
        valid: false,
        code: 'PENDING_ACTION_REQUIRED',
        message: 'Cannot draw card: a pending action must be resolved first.',
      };
    }

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer.id !== playerId) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: 'Cannot draw card: it is not your turn.',
      };
    }

    if (currentPlayer.hasDrawnThisTurn) {
      return {
        valid: false,
        code: 'ALREADY_DRAWN',
        message: 'You have already drawn a card this turn.',
      };
    }

    return { valid: true };
  }

  private static validatePassTurn(state: GameState, playerId: string): ValidationResult {
    if (state.status !== 'IN_PROGRESS') {
      return {
        valid: false,
        code: 'MATCH_NOT_ACTIVE',
        message: 'Cannot pass turn: match is not in progress.',
      };
    }

    if (state.pendingActionState) {
      return {
        valid: false,
        code: 'PENDING_ACTION_REQUIRED',
        message: 'Cannot pass turn: a pending action must be resolved first.',
      };
    }

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer.id !== playerId) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: 'Cannot pass turn: it is not your turn.',
      };
    }

    // Per official rules, a player may only pass after drawing a card
    if (!currentPlayer.hasDrawnThisTurn) {
      return {
        valid: false,
        code: 'INVALID_PASS',
        message: 'You cannot pass without drawing a card first.',
      };
    }

    return { valid: true };
  }

  private static validateCallUno(state: GameState, playerId: string): ValidationResult {
    if (state.status !== 'IN_PROGRESS') {
      return {
        valid: false,
        code: 'MATCH_NOT_ACTIVE',
        message: 'Cannot declare UNO: match is not in progress.',
      };
    }

    const player = state.players.find((p) => p.id === playerId);
    if (!player) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: `Player '${playerId}' is not in this game.`,
      };
    }

    if (player.hand.length > 2) {
      return {
        valid: false,
        code: 'INVALID_UNO_CALL',
        message: 'You can only declare UNO when you have 1 or 2 cards remaining.',
      };
    }

    return { valid: true };
  }

  private static validateChallengeUno(
    state: GameState,
    challengerPlayerId: string,
    targetPlayerId: string
  ): ValidationResult {
    if (state.status !== 'IN_PROGRESS') {
      return {
        valid: false,
        code: 'MATCH_NOT_ACTIVE',
        message: 'Cannot challenge UNO: match is not in progress.',
      };
    }

    if (challengerPlayerId === targetPlayerId) {
      return {
        valid: false,
        code: 'CANNOT_CHALLENGE_SELF',
        message: 'You cannot challenge yourself for missing UNO.',
      };
    }

    if (state.unoVulnerablePlayerId !== targetPlayerId) {
      return {
        valid: false,
        code: 'TARGET_NOT_VULNERABLE',
        message: `Player '${targetPlayerId}' is not vulnerable to an UNO challenge.`,
      };
    }

    const targetPlayer = state.players.find((p) => p.id === targetPlayerId);
    if (!targetPlayer || targetPlayer.hand.length !== 1) {
      return {
        valid: false,
        code: 'TARGET_NOT_VULNERABLE',
        message: 'Target player does not have exactly one card.',
      };
    }

    return { valid: true };
  }

  private static validateTargetedDrawTwo(
    state: GameState,
    playerId: string,
    targetPlayerId: string
  ): ValidationResult {
    if (!state.pendingActionState || state.pendingActionState.type !== 'AWAITING_TARGETED_DRAW_TWO_SELECTION') {
      return {
        valid: false,
        code: 'NO_PENDING_CHALLENGE',
        message: 'No pending Targeted Draw Two selection.',
      };
    }

    if (state.pendingActionState.sourcePlayerId !== playerId) {
      return {
        valid: false,
        code: 'UNAUTHORIZED_CHOOSER',
        message: 'Only the player who played Targeted Draw Two may select the target.',
      };
    }

    if (targetPlayerId === playerId) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'You cannot target yourself with Targeted Draw Two.',
      };
    }

    const target = state.players.find((p) => p.id === targetPlayerId);
    if (!target) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: `Target player '${targetPlayerId}' not found in match.`,
      };
    }

    return { valid: true };
  }

  private static validateForcedSwap(
    state: GameState,
    playerId: string,
    targetPlayerId: string
  ): ValidationResult {
    if (!state.pendingActionState || state.pendingActionState.type !== 'AWAITING_FORCED_SWAP_SELECTION') {
      return {
        valid: false,
        code: 'NO_PENDING_CHALLENGE',
        message: 'No pending Forced Swap selection.',
      };
    }

    if (state.pendingActionState.sourcePlayerId !== playerId) {
      return {
        valid: false,
        code: 'UNAUTHORIZED_CHOOSER',
        message: 'Only the player who played Forced Swap may select the swap target.',
      };
    }

    if (targetPlayerId === playerId) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'You cannot swap hands with yourself.',
      };
    }

    const target = state.players.find((p) => p.id === targetPlayerId);
    if (!target) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: `Target player '${targetPlayerId}' not found in match.`,
      };
    }

    return { valid: true };
  }

  private static validateStartNextRound(state: GameState, playerId: string): ValidationResult {
    if (state.status !== 'ROUND_OVER') {
      return {
        valid: false,
        code: 'ROUND_NOT_OVER',
        message: 'Cannot start next round: current round is not over.',
      };
    }

    const isMember = state.players.some((p) => p.id === playerId);
    if (!isMember) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: `Player '${playerId}' is not a participant in this game.`,
      };
    }

    return { valid: true };
  }
}
