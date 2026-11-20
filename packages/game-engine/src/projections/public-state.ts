import { Card, CardColor, FlipSide } from '../cards/card.types';
import { GameState, GameStatus, GameWinner } from '../game/game.types';
import { PowerCardStatus } from '../players/player.types';
import { TurnDirection } from '../turns/turn.direction';

export interface PublicPlayer {
  readonly id: string;
  readonly username: string;
  readonly cardCount: number;
  readonly hasDeclaredUno: boolean;
  readonly isVulnerableToUno?: boolean;
  readonly score: number;
  readonly roundScore?: number;
  readonly cumulativeScore?: number;
  readonly isEliminated?: boolean;
  readonly powerCardStatus?: PowerCardStatus;
  readonly teamId?: string;
  readonly isOut?: boolean;
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

export interface PublicPendingTeamInitialPass {
  readonly type: 'AWAITING_TEAM_INITIAL_PASS';
  readonly completedPlayerIds: readonly string[];
}

export interface PublicPendingTeamCardPass {
  readonly type: 'AWAITING_TEAM_CARD_PASS';
  readonly player1Id: string;
  readonly player2Id: string;
  readonly completedPlayerIds: readonly string[];
}

export interface PublicPendingTeamHandSplit {
  readonly type: 'AWAITING_TEAM_HAND_SPLIT';
  readonly giverPlayerId: string;
  readonly receiverPlayerId: string;
  readonly cardsCountToPass: number;
  readonly reason: 'GOING_OUT' | 'TAGGING_BACK_IN';
}

export interface PublicPendingWildTeamPlay {
  readonly type: 'AWAITING_WILD_TEAM_PLAY';
  readonly playedByPlayerId: string;
  readonly partnerPlayerId: string;
  readonly chosenColor: CardColor;
}

export interface PublicPendingAttackTarget {
  readonly type: 'AWAITING_ATTACK_TARGET_SELECTION';
  readonly playedByPlayerId: string;
  readonly chosenColor: CardColor;
}

export interface PublicPendingStartingAttack {
  readonly type: 'AWAITING_STARTING_ATTACK_SELECTION';
  readonly designatedPlayerId: string;
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
  | PublicPendingForcedSwap
  | PublicPendingTeamInitialPass
  | PublicPendingTeamCardPass
  | PublicPendingTeamHandSplit
  | PublicPendingWildTeamPlay
  | PublicPendingAttackTarget
  | PublicPendingStartingAttack;

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
  readonly attackLauncherState?: GameState['attackLauncherState'];
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
    } else if (state.pendingActionState.type === 'AWAITING_TEAM_INITIAL_PASS') {
      pendingActionState = {
        type: 'AWAITING_TEAM_INITIAL_PASS',
        completedPlayerIds: Object.keys(state.pendingActionState.selections),
      };
    } else if (state.pendingActionState.type === 'AWAITING_TEAM_CARD_PASS') {
      pendingActionState = {
        type: 'AWAITING_TEAM_CARD_PASS',
        player1Id: state.pendingActionState.player1Id,
        player2Id: state.pendingActionState.player2Id,
        completedPlayerIds: Object.keys(state.pendingActionState.selections),
      };
    } else if (state.pendingActionState.type === 'AWAITING_TEAM_HAND_SPLIT') {
      pendingActionState = {
        type: 'AWAITING_TEAM_HAND_SPLIT',
        giverPlayerId: state.pendingActionState.giverPlayerId,
        receiverPlayerId: state.pendingActionState.receiverPlayerId,
        cardsCountToPass: state.pendingActionState.cardsCountToPass,
        reason: state.pendingActionState.reason,
      };
    } else if (state.pendingActionState.type === 'AWAITING_WILD_TEAM_PLAY') {
      pendingActionState = {
        type: 'AWAITING_WILD_TEAM_PLAY',
        playedByPlayerId: state.pendingActionState.playedByPlayerId,
        partnerPlayerId: state.pendingActionState.partnerPlayerId,
        chosenColor: state.pendingActionState.chosenColor,
      };
    } else if (state.pendingActionState.type === 'AWAITING_ATTACK_TARGET_SELECTION') {
      pendingActionState = {
        type: 'AWAITING_ATTACK_TARGET_SELECTION',
        playedByPlayerId: state.pendingActionState.playedByPlayerId,
        chosenColor: state.pendingActionState.chosenColor,
      };
    } else if (state.pendingActionState.type === 'AWAITING_STARTING_ATTACK_SELECTION') {
      pendingActionState = {
        type: 'AWAITING_STARTING_ATTACK_SELECTION',
        designatedPlayerId: state.pendingActionState.designatedPlayerId,
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
      isVulnerableToUno: p.id === state.unoVulnerablePlayerId,
      score: p.score,
      roundScore: p.roundScore,
      cumulativeScore: p.cumulativeScore ?? p.score,
      isEliminated: p.isEliminated,
      powerCardStatus: p.powerCardStatus,
      teamId: p.teamId,
      isOut: p.isOut,
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
    attackLauncherState: state.attackLauncherState,
    roundWinner: state.roundWinner,
    winner: state.winner,
  };
}
