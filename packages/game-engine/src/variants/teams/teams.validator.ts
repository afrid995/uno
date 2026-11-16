import { GameState } from '../../game/game.types';
import { GameAction, PlayCardAction, CallUnoAction, ChallengeUnoFailureAction } from '../../actions/action.types';
import { CardColor } from '../../cards/card.types';
import { isWildCard } from '../../cards/card.validation';
import { ValidationResult } from '../../validation/move.validator';
import { TEAMS_COLORS } from './teams.constants';

export class TeamsMoveValidator {
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

      if (pendingType === 'AWAITING_TEAM_INITIAL_PASS') {
        if (action.type !== 'TEAM_INITIAL_PASS') {
          return {
            valid: false,
            code: 'PENDING_ACTION_REQUIRED',
            message: 'Must complete initial team card pass before beginning gameplay.',
          };
        }
        return this.validateTeamInitialPass(state, action.playerId, action.cardId);
      }

      if (pendingType === 'AWAITING_TEAM_CARD_PASS') {
        if (action.type !== 'TEAM_CARD_PASS') {
          return {
            valid: false,
            code: 'PENDING_ACTION_REQUIRED',
            message: 'Must complete team card exchange from Passing Symbol card.',
          };
        }
        return this.validateTeamCardPass(state, action.playerId, action.cardId);
      }

      if (pendingType === 'AWAITING_TEAM_HAND_SPLIT') {
        if (action.type !== 'TEAM_SPLIT_HAND_PASS') {
          return {
            valid: false,
            code: 'PENDING_ACTION_REQUIRED',
            message: 'Must complete hand split card pass to teammate.',
          };
        }
        return this.validateTeamSplitHandPass(state, action.playerId, action.cardIds);
      }

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
        return this.validatePassTurn(state, action.playerId);
      case 'CALL_UNO':
        return this.validateCallUno(state, action);
      case 'CHALLENGE_UNO_FAILURE':
        return this.validateChallengeUnoFailure(state, action);
      default:
        return {
          valid: false,
          code: 'PENDING_ACTION_REQUIRED',
          message: `Action type "${action.type}" is not supported or not allowed in current state.`,
        };
    }
  }

  private static validateStartNextRound(state: GameState, playerId: string): ValidationResult {
    if (state.status !== 'ROUND_OVER') {
      return {
        valid: false,
        code: 'ROUND_NOT_OVER',
        message: 'Cannot start next round while round is still in progress.',
      };
    }
    const player = state.players.find((p) => p.id === playerId);
    if (!player) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'Only match participants can trigger the next round.',
      };
    }
    return { valid: true };
  }

  private static validateTeamInitialPass(
    state: GameState,
    playerId: string,
    cardId: string
  ): ValidationResult {
    const pending = state.pendingActionState;
    if (!pending || pending.type !== 'AWAITING_TEAM_INITIAL_PASS') {
      return {
        valid: false,
        code: 'PENDING_ACTION_REQUIRED',
        message: 'No pending initial team pass.',
      };
    }

    if (pending.selections[playerId]) {
      return {
        valid: false,
        code: 'PENDING_ACTION_REQUIRED',
        message: 'Player has already selected a card for initial pass.',
      };
    }

    const player = state.players.find((p) => p.id === playerId);
    if (!player) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'Player not found.',
      };
    }

    const hasCard = player.hand.some((c) => c.id === cardId);
    if (!hasCard) {
      return {
        valid: false,
        code: 'CARD_NOT_IN_HAND',
        message: `Card ${cardId} is not in player hand.`,
      };
    }

    return { valid: true };
  }

  private static validateTeamCardPass(
    state: GameState,
    playerId: string,
    cardId: string
  ): ValidationResult {
    const pending = state.pendingActionState;
    if (!pending || pending.type !== 'AWAITING_TEAM_CARD_PASS') {
      return {
        valid: false,
        code: 'PENDING_ACTION_REQUIRED',
        message: 'No pending team card pass.',
      };
    }

    if (playerId !== pending.player1Id && playerId !== pending.player2Id) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'Player is not part of this team pass.',
      };
    }

    if (pending.selections[playerId]) {
      return {
        valid: false,
        code: 'PENDING_ACTION_REQUIRED',
        message: 'Player has already selected a card to pass.',
      };
    }

    const player = state.players.find((p) => p.id === playerId);
    if (!player) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'Player not found.',
      };
    }

    const hasCard = player.hand.some((c) => c.id === cardId);
    if (!hasCard) {
      return {
        valid: false,
        code: 'CARD_NOT_IN_HAND',
        message: `Card ${cardId} is not in player hand.`,
      };
    }

    return { valid: true };
  }

  private static validateTeamSplitHandPass(
    state: GameState,
    playerId: string,
    cardIds: readonly string[]
  ): ValidationResult {
    const pending = state.pendingActionState;
    if (!pending || pending.type !== 'AWAITING_TEAM_HAND_SPLIT') {
      return {
        valid: false,
        code: 'PENDING_ACTION_REQUIRED',
        message: 'No pending team hand split.',
      };
    }

    if (playerId !== pending.giverPlayerId) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: `Only player ${pending.giverPlayerId} must pass split hand cards.`,
      };
    }

    if (cardIds.length !== pending.cardsCountToPass) {
      return {
        valid: false,
        code: 'CARD_NOT_IN_HAND',
        message: `Expected exactly ${pending.cardsCountToPass} cards to pass, received ${cardIds.length}.`,
      };
    }

    const player = state.players.find((p) => p.id === playerId);
    if (!player) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'Player not found.',
      };
    }

    const handCardIds = new Set(player.hand.map((c) => c.id));
    for (const id of cardIds) {
      if (!handCardIds.has(id)) {
        return {
          valid: false,
          code: 'CARD_NOT_IN_HAND',
          message: `Card ${id} is not in giver's hand.`,
        };
      }
    }

    return { valid: true };
  }

  private static validateChooseStartingWildColor(
    state: GameState,
    playerId: string,
    chosenColor: CardColor
  ): ValidationResult {
    const pending = state.pendingActionState;
    if (!pending || pending.type !== 'AWAITING_STARTING_WILD_COLOR_SELECTION') {
      return {
        valid: false,
        code: 'NO_STARTING_WILD_PENDING',
        message: 'No starting wild color selection is pending.',
      };
    }

    if (pending.designatedPlayerId !== playerId) {
      return {
        valid: false,
        code: 'UNAUTHORIZED_CHOOSER',
        message: `Player ${playerId} is not authorized to select the starting color.`,
      };
    }

    if (!TEAMS_COLORS.includes(chosenColor)) {
      return {
        valid: false,
        code: 'INVALID_CHOSEN_COLOR',
        message: `Invalid chosen color "${chosenColor}". Must be one of: ${TEAMS_COLORS.join(', ')}`,
      };
    }

    return { valid: true };
  }

  private static validatePlayCard(state: GameState, action: PlayCardAction): ValidationResult {
    const { playerId, cardId, chosenColor } = action;

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer.id !== playerId) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: `It is not player ${playerId}'s turn. Current turn: ${currentPlayer.id}`,
      };
    }

    if (currentPlayer.isOut) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: `Player ${playerId} is currently out of the game.`,
      };
    }

    const card = currentPlayer.hand.find((c) => c.id === cardId);
    if (!card) {
      return {
        valid: false,
        code: 'CARD_NOT_IN_HAND',
        message: `Card ${cardId} is not in player ${playerId}'s hand.`,
      };
    }

    // If player drew from the deck this turn, only that specific drawn card can be played
    if (currentPlayer.hasDrawnThisTurn) {
      if (currentPlayer.drawnCardId !== cardId) {
        return {
          valid: false,
          code: 'INVALID_CARD_MATCH',
          message: 'After drawing, you may only play the card you just drew.',
        };
      }
    }

    // Card matching rules: Wild matches anything; otherwise match color, number, or symbol
    if (isWildCard(card)) {
      if (!chosenColor) {
        return {
          valid: false,
          code: 'MUST_CHOOSE_COLOR',
          message: 'A color must be chosen when playing any Wild card.',
        };
      }
      if (!TEAMS_COLORS.includes(chosenColor)) {
        return {
          valid: false,
          code: 'INVALID_CHOSEN_COLOR',
          message: `Invalid chosen color "${chosenColor}". Must be one of: ${TEAMS_COLORS.join(', ')}`,
        };
      }
      return { valid: true };
    }

    // Non-wild cards:
    // Match active color OR face value/symbol
    const isColorMatch = state.activeColor !== null && card.color === state.activeColor;
    const isValueMatch = card.value === state.topDiscardCard.value;

    if (!isColorMatch && !isValueMatch) {
      return {
        valid: false,
        code: 'INVALID_CARD_MATCH',
        message: `Card ${card.color} ${card.value} does not match active color (${state.activeColor}) or discard (${state.topDiscardCard.color} ${state.topDiscardCard.value}).`,
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
        message: `It is not player ${playerId}'s turn to draw.`,
      };
    }

    if (currentPlayer.isOut) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: `Player ${playerId} is currently out of the game.`,
      };
    }

    if (currentPlayer.hasDrawnThisTurn) {
      return {
        valid: false,
        code: 'ALREADY_DRAWN',
        message: 'Player has already drawn a card this turn.',
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
        message: `It is not player ${playerId}'s turn to pass.`,
      };
    }

    if (currentPlayer.isOut) {
      return {
        valid: false,
        code: 'NOT_YOUR_TURN',
        message: `Player ${playerId} is currently out of the game.`,
      };
    }

    if (!currentPlayer.hasDrawnThisTurn) {
      return {
        valid: false,
        code: 'INVALID_PASS',
        message: 'Player must draw before passing the turn.',
      };
    }

    return { valid: true };
  }

  private static validateCallUno(state: GameState, action: CallUnoAction): ValidationResult {
    if (state.status !== 'IN_PROGRESS') {
      return { valid: false, code: 'MATCH_NOT_ACTIVE', message: 'Cannot declare UNO: match is not in progress.' };
    }

    const { playerId, targetPlayerId } = action;
    const player = state.players.find((p) => p.id === playerId);
    if (!player || player.isEliminated) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'Player not found or eliminated.',
      };
    }

    // In UNO Teams, you can call UNO for yourself or for your partner
    const targetId = targetPlayerId ?? playerId;
    const targetPlayer = state.players.find((p) => p.id === targetId);
    if (!targetPlayer || targetPlayer.isEliminated) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'Target player not found or eliminated.',
      };
    }

    if (targetId !== playerId) {
      // Must be on the same team
      if (player.teamId !== targetPlayer.teamId) {
        return {
          valid: false,
          code: 'INVALID_UNO_CALL',
          message: 'You can only call UNO for yourself or your teammate.',
        };
      }
      // In UNO Teams: A player may shout UNO on behalf of their teammate holding 1 or 2 cards
      // to protect them before the opposing team catches them!
      if (targetPlayer.hand.length > 2 || targetPlayer.hand.length === 0) {
        return {
          valid: false,
          code: 'INVALID_UNO_CALL',
          message: 'Teammate can only declare UNO with 1 or 2 cards in hand.',
        };
      }
    } else {
      const isCurrentTurn = state.players[state.currentPlayerIndex]?.id === playerId;
      if (!isCurrentTurn) {
        return {
          valid: false,
          code: 'NOT_YOUR_TURN',
          message: 'You can only declare UNO on your turn.',
        };
      }
      if (targetPlayer.hand.length > 2) {
        return {
          valid: false,
          code: 'INVALID_UNO_CALL',
          message: 'Player can only declare UNO with 2 cards in hand before playing down to 1.',
        };
      }
      if (targetPlayer.hand.length < 2) {
        return {
          valid: false,
          code: 'INVALID_UNO_CALL',
          message: 'Player cannot declare UNO after playing their card.',
        };
      }
    }

    if (targetPlayer.hasDeclaredUno) {
      return {
        valid: false,
        code: 'INVALID_UNO_CALL',
        message: 'UNO has already been declared.',
      };
    }

    return { valid: true };
  }

  private static validateChallengeUnoFailure(
    state: GameState,
    action: ChallengeUnoFailureAction
  ): ValidationResult {
    if (state.status !== 'IN_PROGRESS') {
      return { valid: false, code: 'MATCH_NOT_ACTIVE', message: 'Cannot challenge UNO: match is not in progress.' };
    }

    const { challengerPlayerId, targetPlayerId } = action;

    if (challengerPlayerId === targetPlayerId) {
      return {
        valid: false,
        code: 'CANNOT_CHALLENGE_SELF',
        message: 'A player cannot challenge themselves.',
      };
    }

    const challenger = state.players.find((p) => p.id === challengerPlayerId);
    const target = state.players.find((p) => p.id === targetPlayerId);

    if (!challenger || !target || challenger.isEliminated || target.isEliminated) {
      return {
        valid: false,
        code: 'INVALID_PLAYER',
        message: 'Participant not found or eliminated.',
      };
    }

    // In UNO Teams: You cannot challenge your own partner!
    if (challenger.teamId === target.teamId) {
      return {
        valid: false,
        code: 'CANNOT_CHALLENGE_SELF',
        message: 'You cannot challenge your own teammate for missed UNO.',
      };
    }

    if (state.unoVulnerablePlayerId !== targetPlayerId) {
      return {
        valid: false,
        code: 'TARGET_NOT_VULNERABLE',
        message: `Player ${targetPlayerId} is not vulnerable to a missed-UNO challenge.`,
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
}
