import { Card, CardColor } from '../cards/card.types';
import { GameState, GameStatus, GameWinner, PendingActionState } from '../game/game.types';
import { TurnDirection } from '../turns/turn.direction';

export interface PublicPlayer {
  readonly id: string;
  readonly username: string;
  readonly cardCount: number;
  readonly hasDeclaredUno: boolean;
  readonly score: number;
}

export interface PublicGameState {
  readonly id: string;
  readonly roomId: string;
  readonly variant: string;
  readonly status: GameStatus;
  readonly players: readonly PublicPlayer[];
  readonly playerOrder: readonly string[];
  readonly currentPlayerIndex: number;
  readonly currentTurnGuestId: string;
  readonly turnDirection: TurnDirection;
  readonly topDiscardCard: Card;
  readonly activeColor: CardColor;
  readonly drawPileCount: number;
  readonly discardPileCount: number;
  readonly turnNumber: number;
  readonly sequenceNumber: number;
  readonly pendingActionState: PendingActionState | null;
  readonly winner: GameWinner | null;
}

export function getPublicGameState(state: GameState): PublicGameState {
  const currentTurnGuestId = state.players[state.currentPlayerIndex]?.id ?? '';

  return {
    id: state.id,
    roomId: state.roomId,
    variant: state.variant,
    status: state.status,
    players: state.players.map((p) => ({
      id: p.id,
      username: p.username,
      cardCount: p.hand.length,
      hasDeclaredUno: p.hasDeclaredUno,
      score: p.score,
    })),
    playerOrder: state.playerOrder,
    currentPlayerIndex: state.currentPlayerIndex,
    currentTurnGuestId,
    turnDirection: state.turnDirection,
    topDiscardCard: state.topDiscardCard,
    activeColor: state.activeColor,
    drawPileCount: state.drawPile.length,
    discardPileCount: state.discardPile.length,
    turnNumber: state.turnNumber,
    sequenceNumber: state.sequenceNumber,
    pendingActionState: state.pendingActionState,
    winner: state.winner,
  };
}
