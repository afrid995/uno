import { Card } from '../cards/card.types';
import { GameState } from '../game/game.types';
import { PublicGameState, getPublicGameState } from './public-state';
import { MoveValidator } from '../validation/move.validator';

export interface PlayerPrivateView {
  readonly id: string;
  readonly username: string;
  readonly hand: readonly Card[];
  readonly isCurrentTurn: boolean;
  readonly playableCardIds: readonly string[];
  readonly canDraw: boolean;
  readonly canPass: boolean;
  readonly canCallUno: boolean;
  readonly canCatchUno: boolean;
  readonly canResolveWildDrawFour: boolean;
  readonly isTargetedByWildDrawFour: boolean;
}

export interface PlayerGameState extends PublicGameState {
  readonly self: PlayerPrivateView;
  /**
   * Only disclosed to the authorized challenger during a Wild Draw Four challenge inspection.
   * Completely hidden from all other participants.
   */
  readonly inspectedChallengedHand?: readonly Card[] | null;
}

export function getPlayerGameState(state: GameState, playerId: string): PlayerGameState {
  const publicState = getPublicGameState(state);
  const player = state.players.find((p) => p.id === playerId);

  if (!player) {
    throw new Error(`Player ${playerId} is not a participant in this game.`);
  }

  const isCurrentTurn = publicState.currentTurnGuestId === playerId;
  let playableCardIds: string[] = [];

  // Card play is only allowed when match is in progress and NO pending Wild Draw Four resolution is blocking
  if (isCurrentTurn && state.status === 'IN_PROGRESS' && !state.pendingActionState) {
    if (player.hasDrawnThisTurn) {
      // Per official rules, after drawing, only the drawn card can be played (if it matches)
      if (player.drawnCardId) {
        const drawnCard = player.hand.find((c) => c.id === player.drawnCardId);
        if (drawnCard && MoveValidator.isCardMatch(drawnCard, state.activeColor, state.topDiscardCard)) {
          playableCardIds = [drawnCard.id];
        }
      }
    } else {
      playableCardIds = player.hand
        .filter((c) => MoveValidator.isCardMatch(c, state.activeColor, state.topDiscardCard))
        .map((c) => c.id);
    }
  }

  const hasPendingWdf = !!state.pendingActionState;
  const isVictimOfWdf = state.pendingActionState?.victimPlayerId === playerId;

  const canDraw = isCurrentTurn && !player.hasDrawnThisTurn && state.status === 'IN_PROGRESS' && !hasPendingWdf;
  const canPass = isCurrentTurn && player.hasDrawnThisTurn && state.status === 'IN_PROGRESS' && !hasPendingWdf;

  // Player can call UNO if they hold 1 or 2 cards and haven't declared it yet
  const canCallUno = player.hand.length <= 2 && !player.hasDeclaredUno;

  // Catching UNO is valid if someone else is currently vulnerable
  const canCatchUno = !!(state.unoVulnerablePlayerId && state.unoVulnerablePlayerId !== playerId);

  const canResolveWildDrawFour = isVictimOfWdf;

  const self: PlayerPrivateView = {
    id: player.id,
    username: player.username,
    hand: player.hand,
    isCurrentTurn,
    playableCardIds,
    canDraw,
    canPass,
    canCallUno,
    canCatchUno,
    canResolveWildDrawFour,
    isTargetedByWildDrawFour: isVictimOfWdf,
  };

  // Temporary private disclosure of offender's hand to authorized challenger only
  const inspectedChallengedHand = state.inspectionHand && state.inspectionHand.challengerPlayerId === playerId
    ? state.inspectionHand.hand
    : null;

  return {
    ...publicState,
    self,
    inspectedChallengedHand,
  };
}
