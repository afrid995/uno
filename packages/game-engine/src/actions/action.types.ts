import { CardColor } from '../cards/card.types';

export type GameActionType =
  | 'PLAY_CARD'
  | 'DRAW_CARD'
  | 'PASS_TURN'
  | 'CALL_UNO'
  | 'CHALLENGE_UNO_FAILURE'
  | 'CHALLENGE_WILD_DRAW_FOUR'
  | 'ACCEPT_WILD_DRAW_FOUR'
  | 'CHALLENGE_WILD_DRAW_TWO'
  | 'ACCEPT_WILD_DRAW_TWO'
  | 'CHALLENGE_WILD_DRAW_COLOR'
  | 'ACCEPT_WILD_DRAW_COLOR'
  | 'CHOOSE_STARTING_WILD_COLOR'
  | 'CHOOSE_7S_SWAP_TARGET'
  | 'CHOOSE_COLOR_ROULETTE_COLOR'
  | 'ACCEPT_STACK_PENALTY'
  | 'START_NEXT_ROUND';

export interface PlayCardAction {
  readonly type: 'PLAY_CARD';
  readonly playerId: string;
  readonly cardId: string;
  /** Chosen color if playing a Wild, Wild Draw Four, Wild Draw Two, or Wild Draw Color */
  readonly chosenColor?: CardColor;
}

export interface DrawCardAction {
  readonly type: 'DRAW_CARD';
  readonly playerId: string;
}

export interface PassTurnAction {
  readonly type: 'PASS_TURN';
  readonly playerId: string;
}

export interface CallUnoAction {
  readonly type: 'CALL_UNO';
  readonly playerId: string;
}

export interface ChallengeUnoFailureAction {
  readonly type: 'CHALLENGE_UNO_FAILURE';
  readonly challengerPlayerId: string;
  readonly targetPlayerId: string;
}

export interface ChallengeWildDrawFourAction {
  readonly type: 'CHALLENGE_WILD_DRAW_FOUR';
  readonly challengerPlayerId: string;
}

export interface AcceptWildDrawFourAction {
  readonly type: 'ACCEPT_WILD_DRAW_FOUR';
  readonly playerId: string;
}

export interface ChallengeWildDrawTwoAction {
  readonly type: 'CHALLENGE_WILD_DRAW_TWO';
  readonly challengerPlayerId: string;
}

export interface AcceptWildDrawTwoAction {
  readonly type: 'ACCEPT_WILD_DRAW_TWO';
  readonly playerId: string;
}

export interface ChallengeWildDrawColorAction {
  readonly type: 'CHALLENGE_WILD_DRAW_COLOR';
  readonly challengerPlayerId: string;
}

export interface AcceptWildDrawColorAction {
  readonly type: 'ACCEPT_WILD_DRAW_COLOR';
  readonly playerId: string;
}

export interface ChooseStartingWildColorAction {
  readonly type: 'CHOOSE_STARTING_WILD_COLOR';
  readonly playerId: string;
  readonly chosenColor: CardColor;
}

export interface Choose7sSwapTargetAction {
  readonly type: 'CHOOSE_7S_SWAP_TARGET';
  readonly playerId: string;
  readonly targetPlayerId: string;
}

export interface ChooseColorRouletteColorAction {
  readonly type: 'CHOOSE_COLOR_ROULETTE_COLOR';
  readonly playerId: string;
  readonly chosenColor: CardColor;
}

export interface AcceptStackPenaltyAction {
  readonly type: 'ACCEPT_STACK_PENALTY';
  readonly playerId: string;
}

export interface StartNextRoundAction {
  readonly type: 'START_NEXT_ROUND';
  readonly triggeredByPlayerId: string;
}

export type GameAction =
  | PlayCardAction
  | DrawCardAction
  | PassTurnAction
  | CallUnoAction
  | ChallengeUnoFailureAction
  | ChallengeWildDrawFourAction
  | AcceptWildDrawFourAction
  | ChallengeWildDrawTwoAction
  | AcceptWildDrawTwoAction
  | ChallengeWildDrawColorAction
  | AcceptWildDrawColorAction
  | ChooseStartingWildColorAction
  | Choose7sSwapTargetAction
  | ChooseColorRouletteColorAction
  | AcceptStackPenaltyAction
  | StartNextRoundAction;

export interface GameEventRecord {
  readonly sequenceNumber: number;
  readonly type: string;
  readonly playerId?: string;
  readonly payload: Record<string, unknown>;
  readonly timestamp: string;
}
