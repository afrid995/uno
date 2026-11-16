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
  readonly hasDrawnThisTurn?: boolean;
  readonly drawnCardId?: string | null;
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
  readonly canChooseTargetedDrawFour?: boolean;
  readonly canChooseForcedSwap?: boolean;
  readonly canTeamInitialPass?: boolean;
  readonly canTeamCardPass?: boolean;
  readonly canTeamHandSplit?: boolean;
  readonly teamHandSplitCount?: number;
  readonly canChooseAttackTarget?: boolean;
  readonly teamId?: string;
  readonly isOut?: boolean;
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
    const isFlexMatch = (card: Card): boolean => {
      if (MoveValidator.isCardMatch(card, state.activeColor, state.topDiscardCard)) {
        return true;
      }
      if (state.variant === 'uno_flex' && player.powerCardStatus === 'green_check') {
        // Flex side matching
        if (card.flexColor && state.activeColor !== null && card.flexColor === state.activeColor) {
          return true;
        }
        if (
          (card.value === 'flex_draw_two' || card.value === 'flex_reverse' || card.value === 'flex_skip') &&
          (card.flexColor === state.activeColor ||
            card.color === state.activeColor ||
            state.topDiscardCard.value === card.value ||
            state.topDiscardCard.value === card.value.replace('flex_', ''))
        ) {
          return true;
        }
        if (
          card.value === 'flex_wild_draw_four' ||
          card.value === 'flex_wild_target_draw_two' ||
          card.value === 'flex_wild_all_draw'
        ) {
          return true;
        }
      }
      return false;
    };

    if (player.hasDrawnThisTurn) {
      // Per official rules, after drawing, only the drawn card can be played (if it matches)
      if (player.drawnCardId) {
        const drawnCard = player.hand.find((c) => c.id === player.drawnCardId);
        if (drawnCard && isFlexMatch(drawnCard)) {
          playableCardIds = [drawnCard.id];
        }
      }
    } else {
      playableCardIds = player.hand
        .filter((c) => isFlexMatch(c))
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

  const canChooseTargetedDrawFour =
    state.pendingActionState?.type === 'AWAITING_TARGETED_DRAW_FOUR_SELECTION' &&
    state.pendingActionState.sourcePlayerId === playerId;

  const canChooseForcedSwap =
    state.pendingActionState?.type === 'AWAITING_FORCED_SWAP_SELECTION' &&
    state.pendingActionState.sourcePlayerId === playerId;

  const canTeamInitialPass =
    state.pendingActionState?.type === 'AWAITING_TEAM_INITIAL_PASS' &&
    !state.pendingActionState.selections[playerId];

  const canTeamCardPass =
    state.pendingActionState?.type === 'AWAITING_TEAM_CARD_PASS' &&
    (state.pendingActionState.player1Id === playerId || state.pendingActionState.player2Id === playerId) &&
    !state.pendingActionState.selections[playerId];

  const canTeamHandSplit =
    state.pendingActionState?.type === 'AWAITING_TEAM_HAND_SPLIT' &&
    state.pendingActionState.giverPlayerId === playerId;

  const teamHandSplitCount =
    state.pendingActionState?.type === 'AWAITING_TEAM_HAND_SPLIT'
      ? state.pendingActionState.cardsCountToPass
      : undefined;

  const canChooseAttackTarget =
    (state.pendingActionState?.type === 'AWAITING_ATTACK_TARGET_SELECTION' &&
      state.pendingActionState.playedByPlayerId === playerId) ||
    (state.pendingActionState?.type === 'AWAITING_STARTING_ATTACK_SELECTION' &&
      state.pendingActionState.designatedPlayerId === playerId);

  const canDraw = !player.isEliminated && !player.isOut && isCurrentTurn && !player.hasDrawnThisTurn && state.status === 'IN_PROGRESS' && !isPendingAction;
  const canPass =
    !player.isEliminated &&
    !player.isOut &&
    isCurrentTurn &&
    player.hasDrawnThisTurn &&
    state.status === 'IN_PROGRESS' &&
    !isPendingAction;

  const partner = state.variant === 'uno_teams' && player.teamId
    ? state.players.find((p) => p.teamId === player.teamId && p.id !== player.id)
    : undefined;
  const partnerCanCallUno = partner && !partner.isEliminated && partner.hand.length === 2 && !partner.hasDeclaredUno;

  // Player can call UNO if they hold 2 cards on their turn and haven't declared it yet, or if partner holds 2 cards in UNO Teams
  const canCallUno = (!player.isEliminated && player.hand.length === 2 && isCurrentTurn && !player.hasDeclaredUno) || !!partnerCanCallUno;

  // Catching UNO is valid if someone else is currently vulnerable (in UNO Teams, partner cannot catch partner)
  const isPartnerVulnerable = partner && state.unoVulnerablePlayerId === partner.id;
  const canCatchUno = !player.isEliminated && !!(state.unoVulnerablePlayerId && state.unoVulnerablePlayerId !== playerId && !isPartnerVulnerable);

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
    hasDrawnThisTurn: player.hasDrawnThisTurn,
    drawnCardId: player.drawnCardId,
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
    canChooseTargetedDrawFour,
    canChooseForcedSwap,
    canTeamInitialPass,
    canTeamCardPass,
    canTeamHandSplit,
    teamHandSplitCount,
    canChooseAttackTarget,
    teamId: player.teamId,
    isOut: player.isOut,
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
