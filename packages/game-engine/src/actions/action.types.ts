import { CardColor } from '../cards/card.types';

export type GameActionType =
  | 'PLAY_CARD'
  | 'DRAW_CARD'
  | 'PASS_TURN'
  | 'CALL_UNO'
  | 'CHALLENGE_UNO_FAILURE'
  | 'CHALLENGE_WILD_DRAW_FOUR'
  | 'ACCEPT_WILD_DRAW_FOUR';

export interface PlayCardAction {
  readonly type: 'PLAY_CARD';
  readonly playerId: string;
  readonly cardId: string;
  /** Chosen color if playing a Wild or Wild Draw Four */
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

export type GameAction =
  | PlayCardAction
  | DrawCardAction
  | PassTurnAction
  | CallUnoAction
  | ChallengeUnoFailureAction
  | ChallengeWildDrawFourAction
  | AcceptWildDrawFourAction;

export interface GameEventRecord {
  readonly sequenceNumber: number;
  readonly type: string;
  readonly playerId?: string;
  readonly payload: Record<string, unknown>;
  readonly timestamp: string;
}
