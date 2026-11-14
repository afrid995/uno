import { Card } from '../cards/card.types';
import { GameState } from '../game/game.types';
import { PublicGameState, getPublicGameState } from './public-state';
import { MoveValidator } from '../validation/move.validator';
import { getNoMercyStackCardValue } from '../variants/no-mercy/no-mercy.constants';

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
  readonly canResolveWildDrawTwo?: boolean;
  readonly isTargetedByWildDrawTwo?: boolean;
  readonly canResolveWildDrawColor?: boolean;
  readonly isTargetedByWildDrawColor?: boolean;
  readonly canChooseStartingColor?: boolean;
  readonly isAwaitingStartingColor?: boolean;
  readonly canStack?: boolean;
  readonly isTargetedByStack?: boolean;
  readonly canChoose7sSwap?: boolean;
  readonly canChooseRouletteColor?: boolean;
  readonly canChooseTargetedDrawTwo?: boolean;
  readonly canChooseForcedSwap?: boolean;
  readonly isEliminated?: boolean;
}

function getNoMercyDrawValue(card: Card): number | null {
  return getNoMercyStackCardValue(card.value);
}

export interface PlayerGameState extends PublicGameState {
  readonly self: PlayerPrivateView;
  /**
   * Only disclosed to the authorized challenger during a Wild Draw Four, Two, or Color challenge inspection.
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

  const isStackResolution = state.pendingActionState?.type === 'AWAITING_STACK_RESOLUTION';
  const isTargetedByStack = isStackResolution && state.pendingActionState!.targetPlayerId === playerId;

  if (player.isEliminated) {
    playableCardIds = [];
  } else if (isTargetedByStack) {
    // During stacking, only Draw cards of equal or higher value can be stacked
    const requiredMin = state.pendingActionState!.lastStackedValue;
    playableCardIds = player.hand
      .filter((c) => {
        const val = getNoMercyDrawValue(c);
        return val !== null && val >= requiredMin;
      })
      .map((c) => c.id);
  } else if (isCurrentTurn && state.status === 'IN_PROGRESS' && !state.pendingActionState) {
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

  const isPendingAction = !!state.pendingActionState;
  const isVictimOfWdf =
    state.pendingActionState?.type === 'AWAITING_WILD_DRAW_FOUR_RESOLUTION' &&
    state.pendingActionState.victimPlayerId === playerId;
  const isVictimOfWd2 =
    state.pendingActionState?.type === 'AWAITING_WILD_DRAW_TWO_RESOLUTION' &&
    state.pendingActionState.victimPlayerId === playerId;
  const isVictimOfWdc =
    state.pendingActionState?.type === 'AWAITING_WILD_DRAW_COLOR_RESOLUTION' &&
    state.pendingActionState.victimPlayerId === playerId;
  const isAwaitingStartingColor =
    state.pendingActionState?.type === 'AWAITING_STARTING_WILD_COLOR_SELECTION';
  const canChooseStartingColor =
    state.pendingActionState?.type === 'AWAITING_STARTING_WILD_COLOR_SELECTION' &&
    state.pendingActionState.designatedPlayerId === playerId;

  const canChoose7sSwap =
    state.pendingActionState?.type === 'AWAITING_7S_SWAP_SELECTION' &&
    state.pendingActionState.sourcePlayerId === playerId;

  const canChooseRouletteColor =
    state.pendingActionState?.type === 'AWAITING_COLOR_ROULETTE_SELECTION' &&
    state.pendingActionState.victimPlayerId === playerId;

  const canChooseTargetedDrawTwo =
    state.pendingActionState?.type === 'AWAITING_TARGETED_DRAW_TWO_SELECTION' &&
    state.pendingActionState.sourcePlayerId === playerId;

  const canChooseForcedSwap =
    state.pendingActionState?.type === 'AWAITING_FORCED_SWAP_SELECTION' &&
    state.pendingActionState.sourcePlayerId === playerId;

  const canDraw = !player.isEliminated && isCurrentTurn && !player.hasDrawnThisTurn && state.status === 'IN_PROGRESS' && !isPendingAction;
  const canPass = !player.isEliminated && isCurrentTurn && player.hasDrawnThisTurn && state.status === 'IN_PROGRESS' && !isPendingAction;

  // Player can call UNO if they hold 1 or 2 cards and haven't declared it yet
  const canCallUno = !player.isEliminated && player.hand.length <= 2 && !player.hasDeclaredUno;

  // Catching UNO is valid if someone else is currently vulnerable
  const canCatchUno = !player.isEliminated && !!(state.unoVulnerablePlayerId && state.unoVulnerablePlayerId !== playerId);

  const canResolveWildDrawFour = isVictimOfWdf;
  const canResolveWildDrawTwo = isVictimOfWd2;
  const canResolveWildDrawColor = isVictimOfWdc;

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
    canResolveWildDrawTwo,
    isTargetedByWildDrawTwo: isVictimOfWd2,
    canResolveWildDrawColor,
    isTargetedByWildDrawColor: isVictimOfWdc,
    canChooseStartingColor,
    isAwaitingStartingColor,
    canStack: isTargetedByStack && playableCardIds.length > 0,
    isTargetedByStack,
    canChoose7sSwap,
    canChooseRouletteColor,
    canChooseTargetedDrawTwo,
    canChooseForcedSwap,
    isEliminated: player.isEliminated,
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
