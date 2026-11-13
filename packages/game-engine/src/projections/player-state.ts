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
}

export interface PlayerGameState extends PublicGameState {
  readonly self: PlayerPrivateView;
}

export function getPlayerGameState(state: GameState, playerId: string): PlayerGameState {
  const publicState = getPublicGameState(state);
  const player = state.players.find((p) => p.id === playerId);

  if (!player) {
    throw new Error(`Player ${playerId} is not a participant in this game.`);
  }

  const isCurrentTurn = publicState.currentTurnGuestId === playerId;
  let playableCardIds: string[] = [];

  if (isCurrentTurn && state.status === 'IN_PROGRESS') {
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

  const canDraw = isCurrentTurn && !player.hasDrawnThisTurn && state.status === 'IN_PROGRESS';
  const canPass = isCurrentTurn && player.hasDrawnThisTurn && state.status === 'IN_PROGRESS';
  const canCallUno = player.hand.length <= 2 && !player.hasDeclaredUno;

  const self: PlayerPrivateView = {
    id: player.id,
    username: player.username,
    hand: player.hand,
    isCurrentTurn,
    playableCardIds,
    canDraw,
    canPass,
    canCallUno,
  };

  return {
    ...publicState,
    self,
  };
}
