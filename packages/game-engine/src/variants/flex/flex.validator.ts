import { GameState } from '../../game/game.types';
import { GameAction, PlayCardAction } from '../../actions/action.types';
import { Card, CardColor, isFlexCard } from '../../cards/card.types';
import { ValidationResult } from '../../validation/move.validator';
import { HandManager } from '../../players/hand.manager';

export class FlexMoveValidator {
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

    // Pending action gates
    if (state.pendingActionState) {
      const pendingType = state.pendingActionState.type;
      if (pendingType === 'AWAITING_WILD_DRAW_FOUR_RESOLUTION') {
        if (
          action.type !== 'ACCEPT_WILD_DRAW_FOUR' &&
          action.type !== 'CHALLENGE_WILD_DRAW_FOUR'
        ) {
          return {
            valid: false,
            code: 'PENDING_ACTION_REQUIRED',
            message: 'Must resolve pending Wild Draw Four challenge or accept before continuing gameplay.',
          };
        }
      } else if (pendingType === 'AWAITING_TARGETED_DRAW_TWO_SELECTION') {
        if (action.type !== 'CHOOSE_TARGETED_DRAW_TWO_TARGET') {
          return {
            valid: false,
            code: 'PENDING_ACTION_REQUIRED',
            message: 'Must select target player for Flex Wild Target Draw Two.',
          };
        }
      } else if (pendingType === 'AWAITING_TARGETED_DRAW_FOUR_SELECTION') {
        if (action.type !== 'CHOOSE_TARGETED_DRAW_FOUR_TARGET') {
          return {
            valid: false,
            code: 'PENDING_ACTION_REQUIRED',
            message: 'Must select target player for Flex Wild Draw Four.',
          };
        }
      } else {
        return {
          valid: false,
          code: 'PENDING_ACTION_REQUIRED',
          message: `Cannot perform action: pending action '${pendingType}' must be resolved first.`,
        };
      }
    }

    switch (action.type) {
      case 'PLAY_CARD':
        return this.validatePlayCard(state, action);

      case 'DRAW_CARD':
        return this.validateDrawCard(state, player.id);

      case 'PASS_TURN':
        return this.validatePassTurn(state, player.id);

      case 'CALL_UNO':
        return this.validateCallUno(state, player.id);

      case 'CHALLENGE_UNO_FAILURE':
        return this.validateChallengeUno(state, action.challengerPlayerId, action.targetPlayerId);

      case 'CHALLENGE_WILD_DRAW_FOUR':
      case 'ACCEPT_WILD_DRAW_FOUR':
        return this.validateWildDrawFourResolution(state, player.id);

      case 'CHOOSE_TARGETED_DRAW_TWO_TARGET':
        return this.validateTargetedDrawTwo(state, action.playerId, action.targetPlayerId);

      case 'CHOOSE_TARGETED_DRAW_FOUR_TARGET':
        return this.validateTargetedDrawFour(state, action.playerId, action.targetPlayerId);

      default:
        return {
          valid: false,
          code: 'MATCH_NOT_ACTIVE',
          message: `Action type '${(action as GameAction).type}' is not recognized for UNO Flex.`,
        };
    }
  }

  /**
   * Asserts whether a card matches in regular mode against activeColor and topDiscardCard.
   */
  static isRegularMatch(card: Card, activeColor: CardColor | null, topDiscard: Card): boolean {
    if (card.type === 'wild') {
      return true;
    }
    if (activeColor !== null && card.color === activeColor) {
      return true;
    }
    if (card.value === topDiscard.value) {
      return true;
    }
    // Also match if action types correspond (e.g. classic skip vs flex skip)
    if (
      card.type === 'action' &&
      topDiscard.type === 'action' &&
      card.value.replace('flex_', '') === topDiscard.value.replace('flex_', '')
    ) {
      return true;
    }
    return false;
  }

  /**
   * Asserts whether a card matches in flex mode against activeColor and topDiscardCard.
   */
  static isFlexMatch(card: Card, activeColor: CardColor | null, topDiscard: Card): boolean {
    // Flex Wild cards match anything
    if (
      card.value === 'flex_wild_draw_four' ||
      card.value === 'flex_wild_target_draw_two' ||
      card.value === 'flex_wild_all_draw'
    ) {
      return true;
    }

    // Flex Number cards match if secondary flexColor matches activeColor OR number matches
    if (card.type === 'number' && card.flexColor) {
      if (activeColor !== null && card.flexColor === activeColor) {
        return true;
      }
      if (card.value === topDiscard.value) {
        return true;
      }
    }

    // Flex Action cards match if flexColor matches activeColor, regular color matches activeColor, or symbol matches
    if (
      card.value === 'flex_draw_two' ||
      card.value === 'flex_reverse' ||
      card.value === 'flex_skip'
    ) {
      if (activeColor !== null && card.flexColor === activeColor) {
        return true;
      }
      if (activeColor !== null && card.color === activeColor) {
        return true;
      }
      if (
        topDiscard.value === card.value ||
        topDiscard.value === card.value.replace('flex_', '')
      ) {
        return true;
      }
    }

    return false;
  }

  private static validatePlayCard(state: GameState, action: PlayCardAction): ValidationResult {
    const { playerId, cardId, chosenColor, playMode = 'regular', targetPlayerId } = action;

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

    // After drawing, only the drawn card can be played
    if (currentPlayer.hasDrawnThisTurn) {
      if (currentPlayer.drawnCardId !== cardId) {
        return {
          valid: false,
          code: 'INVALID_CARD_MATCH',
          message: 'After drawing, you may only play the card that was just drawn.',
        };
      }
    }

    // Wild color requirement
    const isWild = card.type === 'wild';
    if (isWild && !chosenColor) {
      return {
        valid: false,
        code: 'MUST_CHOOSE_COLOR',
        message: 'Must specify chosenColor when playing a Wild card in UNO Flex.',
      };
    }

    if (playMode === 'flex') {
      // 1. Player's Power Card MUST be on green check
      if (currentPlayer.powerCardStatus !== 'green_check') {
        return {
          valid: false,
          code: 'INVALID_CARD_MATCH',
          message: 'Cannot play card in flex mode: your Power Card is on the Red X side.',
        };
      }

      // 2. Card must be flex-capable
      if (!isFlexCard(card)) {
        return {
          valid: false,
          code: 'INVALID_CARD_MATCH',
          message: `Card ${card.id} cannot be played in flex mode because it is not a Flex card.`,
        };
      }

      // 3. Must match on flex side
      if (!this.isFlexMatch(card, state.activeColor, state.topDiscardCard)) {
        return {
          valid: false,
          code: 'INVALID_CARD_MATCH',
          message: `Card ${card.id} does not match active color ${state.activeColor} or top card on its flex side.`,
        };
      }

      // 4. Targeted flex wild cards target validation if provided
      if (
        (card.value === 'flex_wild_target_draw_two' || card.value === 'flex_wild_draw_four') &&
        targetPlayerId
      ) {
        const target = state.players.find((p) => p.id === targetPlayerId);
        if (!target) {
          return {
            valid: false,
            code: 'INVALID_PLAYER',
            message: 'Target player not found in match.',
          };
        }
        if (target.id === playerId) {
          return {
            valid: false,
            code: 'CANNOT_CHALLENGE_SELF',
            message: 'Cannot target yourself for targeted card draw.',
          };
        }
      }
    } else {
      // Regular mode
      if (!this.isRegularMatch(card, state.activeColor, state.topDiscardCard)) {
        return {
          valid: false,
          code: 'INVALID_CARD_MATCH',
          message: `Card ${card.id} (${card.color ?? 'wild'} ${card.value}) does not match active color ${state.activeColor} or top card ${state.topDiscardCard.value}.`,
        };
      }
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
        message: 'You must draw a card before you can pass your turn.',
      };
    }

    return { valid: true };
  }

  private static validateCallUno(state: GameState, playerId: string): ValidationResult {
    if (state.status !== 'IN_PROGRESS') {
      return { valid: false, code: 'MATCH_NOT_ACTIVE', message: 'Cannot declare UNO: match is not in progress.' };
    }

    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.isEliminated) {
      return { valid: false, code: 'INVALID_PLAYER', message: 'Player not found or eliminated.' };
    }

    const isCurrentTurn = state.players[state.currentPlayerIndex]?.id === playerId;
    if (!isCurrentTurn) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: 'You can only declare UNO on your turn.',
      };
    }

    if (player.hand.length > 2) {
      return {
        valid: false,
        code: 'INVALID_UNO_CALL',
        message: 'You can only call UNO when you have 2 cards remaining.',
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

  private static validateChallengeUno(
    state: GameState,
    challengerId: string,
    targetPlayerId: string
  ): ValidationResult {
    if (state.status !== 'IN_PROGRESS') {
      return { valid: false, code: 'MATCH_NOT_ACTIVE', message: 'Cannot challenge UNO: match is not in progress.' };
    }

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

  private static validateWildDrawFourResolution(
    state: GameState,
    playerId: string
  ): ValidationResult {
    if (
      !state.pendingActionState ||
      state.pendingActionState.type !== 'AWAITING_WILD_DRAW_FOUR_RESOLUTION'
    ) {
      return {
        valid: false,
        code: 'NO_PENDING_CHALLENGE',
        message: 'There is no pending Wild Draw Four to challenge or accept.',
      };
    }

    if (state.pendingActionState.victimPlayerId !== playerId) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'Only the targeted victim of the Wild Draw Four can resolve this action.',
      };
    }

    return { valid: true };
  }

  private static validateTargetedDrawTwo(
    state: GameState,
    sourcePlayerId: string,
    targetPlayerId: string
  ): ValidationResult {
    if (
      !state.pendingActionState ||
      state.pendingActionState.type !== 'AWAITING_TARGETED_DRAW_TWO_SELECTION'
    ) {
      return {
        valid: false,
        code: 'NO_PENDING_CHALLENGE',
        message: 'No pending Targeted Draw Two selection active.',
      };
    }

    if (state.pendingActionState.sourcePlayerId !== sourcePlayerId) {
      return {
        valid: false,
        code: 'UNAUTHORIZED_CHOOSER',
        message: 'Only the player who played Flex Wild Target Draw Two can choose the target.',
      };
    }

    if (sourcePlayerId === targetPlayerId) {
      return {
        valid: false,
        code: 'CANNOT_CHALLENGE_SELF',
        message: 'Cannot target yourself for targeted draw two.',
      };
    }

    const target = state.players.find((p) => p.id === targetPlayerId);
    if (!target) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'Target player not found in match.',
      };
    }

    return { valid: true };
  }

  private static validateTargetedDrawFour(
    state: GameState,
    sourcePlayerId: string,
    targetPlayerId: string
  ): ValidationResult {
    if (
      !state.pendingActionState ||
      state.pendingActionState.type !== 'AWAITING_TARGETED_DRAW_FOUR_SELECTION'
    ) {
      return {
        valid: false,
        code: 'NO_PENDING_CHALLENGE',
        message: 'No pending Targeted Draw Four selection active.',
      };
    }

    if (state.pendingActionState.sourcePlayerId !== sourcePlayerId) {
      return {
        valid: false,
        code: 'UNAUTHORIZED_CHOOSER',
        message: 'Only the player who played Flex Wild Draw Four can choose the target.',
      };
    }

    if (sourcePlayerId === targetPlayerId) {
      return {
        valid: false,
        code: 'CANNOT_CHALLENGE_SELF',
        message: 'Cannot target yourself for targeted draw four.',
      };
    }

    const target = state.players.find((p) => p.id === targetPlayerId);
    if (!target) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'Target player not found in match.',
      };
    }

    return { valid: true };
  }

  private static validateStartNextRound(
    state: GameState,
    playerId: string
  ): ValidationResult {
    if (state.status !== 'ROUND_OVER') {
      return {
        valid: false,
        code: 'ROUND_NOT_OVER',
        message: 'Cannot start next round because the current round is still in progress or match is complete.',
      };
    }

    const player = state.players.find((p) => p.id === playerId);
    if (!player) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'Player is not registered in this match.',
      };
    }

    return { valid: true };
  }
}
