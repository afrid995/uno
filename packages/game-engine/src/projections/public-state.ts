import { Card, CardColor, FlipSide } from '../cards/card.types';
import { GameState, GameStatus, GameWinner } from '../game/game.types';
import { PowerCardStatus } from '../players/player.types';
import { TurnDirection } from '../turns/turn.direction';

export interface PublicPlayer {
  readonly id: string;
  readonly username: string;
  readonly cardCount: number;
  readonly hasDeclaredUno: boolean;
  readonly score: number;
  readonly isEliminated?: boolean;
  readonly powerCardStatus?: PowerCardStatus;
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

export interface PublicPendingStartingWildColor {
  readonly type: 'AWAITING_STARTING_WILD_COLOR_SELECTION';
  readonly designatedPlayerId: string;
}

export interface PublicPendingStack {
  readonly type: 'AWAITING_STACK_RESOLUTION';
  readonly targetPlayerId: string;
  readonly playedByPlayerId: string;
  readonly accumulatedPenalty: number;
  readonly lastStackedValue: number;
  readonly lastCardValue: Card['value'];
}

export interface PublicPending7sSwap {
  readonly type: 'AWAITING_7S_SWAP_SELECTION';
  readonly sourcePlayerId: string;
}

export interface PublicPendingColorRoulette {
  readonly type: 'AWAITING_COLOR_ROULETTE_SELECTION';
  readonly victimPlayerId: string;
  readonly playedByPlayerId: string;
}

export interface PublicPendingTargetedDrawTwo {
  readonly type: 'AWAITING_TARGETED_DRAW_TWO_SELECTION';
  readonly sourcePlayerId: string;
}

export interface PublicPendingTargetedDrawFour {
  readonly type: 'AWAITING_TARGETED_DRAW_FOUR_SELECTION';
  readonly sourcePlayerId: string;
}

export interface PublicPendingForcedSwap {
  readonly type: 'AWAITING_FORCED_SWAP_SELECTION';
  readonly sourcePlayerId: string;
}

export type PublicPendingActionState =
  | PublicPendingWildDrawFour
  | PublicPendingWildDrawTwo
  | PublicPendingWildDrawColor
  | PublicPendingStartingWildColor
  | PublicPendingStack
  | PublicPending7sSwap
  | PublicPendingColorRoulette
  | PublicPendingTargetedDrawTwo
  | PublicPendingTargetedDrawFour
  | PublicPendingForcedSwap;

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
  readonly activeColor: CardColor | null;
  readonly activeSide?: FlipSide;
  readonly drawPileCount: number;
  readonly discardPileCount: number;
  readonly turnNumber: number;
  readonly sequenceNumber: number;
  readonly unoVulnerablePlayerId: string | null;
  readonly pendingActionState: PublicPendingActionState | null;
  readonly eliminatedPlayerIds?: readonly string[];
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
    } else if (state.pendingActionState.type === 'AWAITING_STARTING_WILD_COLOR_SELECTION') {
      pendingActionState = {
        type: 'AWAITING_STARTING_WILD_COLOR_SELECTION',
        designatedPlayerId: state.pendingActionState.designatedPlayerId,
      };
    } else if (state.pendingActionState.type === 'AWAITING_STACK_RESOLUTION') {
      pendingActionState = {
        type: 'AWAITING_STACK_RESOLUTION',
        targetPlayerId: state.pendingActionState.targetPlayerId,
        playedByPlayerId: state.pendingActionState.playedByPlayerId,
        accumulatedPenalty: state.pendingActionState.accumulatedPenalty,
        lastStackedValue: state.pendingActionState.lastStackedValue,
        lastCardValue: state.pendingActionState.lastCardValue,
      };
    } else if (state.pendingActionState.type === 'AWAITING_7S_SWAP_SELECTION') {
      pendingActionState = {
        type: 'AWAITING_7S_SWAP_SELECTION',
        sourcePlayerId: state.pendingActionState.sourcePlayerId,
      };
    } else if (state.pendingActionState.type === 'AWAITING_COLOR_ROULETTE_SELECTION') {
      pendingActionState = {
        type: 'AWAITING_COLOR_ROULETTE_SELECTION',
        victimPlayerId: state.pendingActionState.victimPlayerId,
        playedByPlayerId: state.pendingActionState.playedByPlayerId,
      };
    } else if (state.pendingActionState.type === 'AWAITING_TARGETED_DRAW_TWO_SELECTION') {
      pendingActionState = {
        type: 'AWAITING_TARGETED_DRAW_TWO_SELECTION',
        sourcePlayerId: state.pendingActionState.sourcePlayerId,
      };
    } else if (state.pendingActionState.type === 'AWAITING_TARGETED_DRAW_FOUR_SELECTION') {
      pendingActionState = {
        type: 'AWAITING_TARGETED_DRAW_FOUR_SELECTION',
        sourcePlayerId: state.pendingActionState.sourcePlayerId,
      };
    } else if (state.pendingActionState.type === 'AWAITING_FORCED_SWAP_SELECTION') {
      pendingActionState = {
        type: 'AWAITING_FORCED_SWAP_SELECTION',
        sourcePlayerId: state.pendingActionState.sourcePlayerId,
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
      isEliminated: p.isEliminated,
      powerCardStatus: p.powerCardStatus,
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
    eliminatedPlayerIds: state.eliminatedPlayerIds,
    roundWinner: state.roundWinner,
    winner: state.winner,
  };
}
