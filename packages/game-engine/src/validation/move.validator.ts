import { GameState } from '../game/game.types';
import { GameAction } from '../actions/action.types';
import { Card, CardColor } from '../cards/card.types';
import { isWildCard } from '../cards/card.validation';
import { HandManager } from '../players/hand.manager';
import { VariantRegistry } from '../variants/variant.types';

export type EngineErrorCode =
  | 'MATCH_NOT_ACTIVE'
  | 'ROUND_NOT_OVER'
  | 'PENDING_ACTION_REQUIRED'
  | 'NOT_YOUR_TURN'
  | 'INVALID_PLAYER'
  | 'CARD_NOT_IN_HAND'
  | 'INVALID_CARD_MATCH'
  | 'MUST_CHOOSE_COLOR'
  | 'INVALID_WILD_DRAW_FOUR'
  | 'INVALID_PASS'
  | 'ALREADY_DRAWN'
  | 'INVALID_UNO_CALL'
  | 'TARGET_NOT_VULNERABLE'
  | 'CANNOT_CHALLENGE_SELF'
  | 'NO_PENDING_CHALLENGE'
  | 'NO_STARTING_WILD_PENDING'
  | 'UNAUTHORIZED_CHOOSER'
  | 'INVALID_CHOSEN_COLOR';

export interface ValidationSuccess {
  readonly valid: true;
}

export interface ValidationFailure {
  readonly valid: false;
  readonly code: EngineErrorCode;
  readonly message: string;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

export class MoveValidator {
  /**
   * Pure validation function asserting whether an action is legal given the current game state.
   * Delegates to the registered variant adapter (Classic UNO or UNO Flip).
   */
  static validate(state: GameState, action: GameAction): ValidationResult {
    const variant = state.variant ?? 'classic';
    if (variant === 'classic') {
      return this.validateClassic(state, action);
    }
    const adapter = VariantRegistry.get(variant);
    return adapter.validateMove(state, action);
  }

  /**
   * Classic Mattel 42001 move validation.
   */
  static validateClassic(state: GameState, action: GameAction): ValidationResult {
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

    // Validate player existence
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

    // If there is an active pending action (such as Wild Draw Four resolution),
    // only the corresponding resolution actions are allowed!
    if (state.pendingActionState) {
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

      case 'CHALLENGE_WILD_DRAW_FOUR':
      case 'ACCEPT_WILD_DRAW_FOUR':
        return this.validateWildDrawFourResolution(state, player.id);

      default:
        return { valid: false, code: 'MATCH_NOT_ACTIVE', message: 'Unknown action type.' };
    }
  }

  /**
   * Asserts whether a card matches the active discard pile top and active color.
   */
  static isCardMatch(card: Card, activeColor: CardColor | null, topDiscard: Card): boolean {
    // Wild cards can be played on any card
    if (isWildCard(card)) {
      return true;
    }

    // Color match
    if (activeColor !== null && card.color === activeColor) {
      return true;
    }

    // Value / symbol match (e.g. Red 5 on Blue 5, or Green Skip on Yellow Skip)
    if (card.value === topDiscard.value) {
      return true;
    }

    return false;
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

    // Check card in hand
    const card = HandManager.findCard(currentPlayer.hand, cardId);
    if (!card) {
      return {
        valid: false,
        code: 'CARD_NOT_IN_HAND',
        message: `Card ${cardId} is not in player's hand.`,
      };
    }

    // If player already drew this turn, official Mattel rule says they can only play the drawn card!
    if (currentPlayer.hasDrawnThisTurn) {
      if (currentPlayer.drawnCardId !== cardId) {
        return {
          valid: false,
          code: 'INVALID_CARD_MATCH',
          message: 'After drawing, you may only play the card that was just drawn.',
        };
      }
    }

    // Check color choice for wild cards
    if (isWildCard(card) && !chosenColor) {
      return {
        valid: false,
        code: 'MUST_CHOOSE_COLOR',
        message: 'Must specify chosenColor when playing a Wild or Wild Draw Four card.',
      };
    }

    // Check card match legality against top discard
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

    // Official Mattel rule: player can only pass IF they have drawn a card this turn
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
    const player = state.players.find((p) => p.id === playerId);
    if (!player) {
      return { valid: false, code: 'INVALID_PLAYER', message: 'Player not found.' };
    }

    // Calling UNO is valid when holding 1 card or about to play the 2nd-to-last card (2 cards in hand)
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
    if (!target) {
      return { valid: false, code: 'INVALID_PLAYER', message: 'Target player not found.' };
    }

    // Under Mattel 42001:
    // A player is vulnerable to an UNO failure challenge ONLY if they are marked as unoVulnerablePlayerId
    // which is set when they play down to 1 card without declaring UNO, and clears as soon as the next player acts.
    if (state.unoVulnerablePlayerId !== targetPlayerId) {
      return {
        valid: false,
        code: 'TARGET_NOT_VULNERABLE',
        message: 'Player is not currently vulnerable to an UNO challenge.',
      };
    }

    return { valid: true };
  }

  private static validateWildDrawFourResolution(state: GameState, playerId: string): ValidationResult {
    if (!state.pendingActionState || state.pendingActionState.type !== 'AWAITING_WILD_DRAW_FOUR_RESOLUTION') {
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

  private static validateStartNextRound(state: GameState, playerId: string): ValidationResult {
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
