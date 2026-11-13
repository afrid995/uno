import { Card, CardColor, FlipSide } from '../cards/card.types';
import { GameState, GameStatus, GameWinner } from '../game/game.types';
import { TurnDirection } from '../turns/turn.direction';

export interface PublicPlayer {
  readonly id: string;
  readonly username: string;
  readonly cardCount: number;
  readonly hasDeclaredUno: boolean;
  readonly score: number;
}

export interface PublicPendingWildDrawFour {
  readonly type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION';
  readonly playedByPlayerId: string;
  readonly victimPlayerId: string;
  readonly chosenColor: CardColor;
}

export interface PublicPendingWildDrawTwo {
  readonly type: 'AWAITING_WILD_DRAW_TWO_RESOLUTION';
  readonly playedByPlayerId: string;
  readonly victimPlayerId: string;
  readonly chosenColor: CardColor;
}

export interface PublicPendingWildDrawColor {
  readonly type: 'AWAITING_WILD_DRAW_COLOR_RESOLUTION';
  readonly playedByPlayerId: string;
  readonly victimPlayerId: string;
  readonly chosenColor: CardColor;
}

export type PublicPendingActionState =
  | PublicPendingWildDrawFour
  | PublicPendingWildDrawTwo
  | PublicPendingWildDrawColor;

export interface PublicGameState {
  readonly id: string;
  readonly roomId: string;
  readonly variant: string;
  readonly status: GameStatus;
  readonly roundNumber: number;
  readonly dealerIndex: number;
  readonly targetScore: number;
  readonly players: readonly PublicPlayer[];
  readonly playerOrder: readonly string[];
  readonly currentPlayerIndex: number;
  readonly currentTurnGuestId: string;
  readonly turnDirection: TurnDirection;
  readonly topDiscardCard: Card;
  readonly activeColor: CardColor;
  readonly activeSide?: FlipSide;
  readonly drawPileCount: number;
  readonly discardPileCount: number;
  readonly turnNumber: number;
  readonly sequenceNumber: number;
  readonly unoVulnerablePlayerId: string | null;
  readonly pendingActionState: PublicPendingActionState | null;
  readonly roundWinner: GameWinner | null;
  readonly winner: GameWinner | null;
}

export function getPublicGameState(state: GameState): PublicGameState {
  const currentTurnGuestId = state.players[state.currentPlayerIndex]?.id ?? '';

  // Sanitize pendingActionState so neither wasOfficiallyLegal nor offenderHandSnapshot are exposed
  let pendingActionState: PublicPendingActionState | null = null;
  if (state.pendingActionState) {
    if (state.pendingActionState.type === 'AWAITING_WILD_DRAW_FOUR_RESOLUTION') {
      pendingActionState = {
        type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
        playedByPlayerId: state.pendingActionState.playedByPlayerId,
        victimPlayerId: state.pendingActionState.victimPlayerId,
        chosenColor: state.pendingActionState.chosenColor,
      };
    } else if (state.pendingActionState.type === 'AWAITING_WILD_DRAW_TWO_RESOLUTION') {
      pendingActionState = {
        type: 'AWAITING_WILD_DRAW_TWO_RESOLUTION',
        playedByPlayerId: state.pendingActionState.playedByPlayerId,
        victimPlayerId: state.pendingActionState.victimPlayerId,
        chosenColor: state.pendingActionState.chosenColor,
      };
    } else if (state.pendingActionState.type === 'AWAITING_WILD_DRAW_COLOR_RESOLUTION') {
      pendingActionState = {
        type: 'AWAITING_WILD_DRAW_COLOR_RESOLUTION',
        playedByPlayerId: state.pendingActionState.playedByPlayerId,
        victimPlayerId: state.pendingActionState.victimPlayerId,
        chosenColor: state.pendingActionState.chosenColor,
      };
    }
  }

  return {
    id: state.id,
    roomId: state.roomId,
    variant: state.variant,
    status: state.status,
    roundNumber: state.roundNumber,
    dealerIndex: state.dealerIndex,
    targetScore: state.targetScore,
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
    activeSide: state.activeSide,
    drawPileCount: state.drawPile.length,
    discardPileCount: state.discardPile.length,
    turnNumber: state.turnNumber,
    sequenceNumber: state.sequenceNumber,
    unoVulnerablePlayerId: state.unoVulnerablePlayerId,
    pendingActionState,
    roundWinner: state.roundWinner,
    winner: state.winner,
  };
}
