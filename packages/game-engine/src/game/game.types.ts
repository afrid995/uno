import { Card, CardColor } from '../cards/card.types';
import { Player } from '../players/player.types';
import { TurnDirection } from '../turns/turn.direction';

export type GameStatus =
  | 'WAITING'
  | 'STARTING'
  | 'IN_PROGRESS'
  | 'ROUND_OVER'
  | 'COMPLETED'
  | 'ABORTED';

export interface PendingWildDrawFourState {
  readonly type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION';
  readonly playedByPlayerId: string;
  readonly victimPlayerId: string;
  /** Whether the card play was officially legal (player held NO matching active color) */
  readonly wasOfficiallyLegal: boolean;
  readonly chosenColor: CardColor;
  /** Snapshot of offender's hand at moment of card play, for authorized inspection */
  readonly offenderHandSnapshot: readonly Card[];
}

export type PendingActionState = PendingWildDrawFourState;

export interface GameWinner {
  readonly id: string;
  readonly username: string;
  readonly score: number;
  readonly roundScore?: number;
}

export interface InspectionHand {
  readonly challengerPlayerId: string;
  readonly offenderPlayerId: string;
  readonly hand: readonly Card[];
}

export interface GameState {
  /** Match UUID identifier */
  readonly id: string;
  /** Room UUID identifier */
  readonly roomId: string;
  /** Rule variant identifier (e.g. "classic") */
  readonly variant: string;
  /** Current state of the match */
  readonly status: GameStatus;
  /** Current round number, starting from 1 */
  readonly roundNumber: number;
  /** Seating index of the current dealer */
  readonly dealerIndex: number;
  /** Cumulative score required to win match (default 500) */
  readonly targetScore: number;
  /** Players participating in the game */
  readonly players: readonly Player[];
  /** Seating order of player IDs */
  readonly playerOrder: readonly string[];
  /** Index in playerOrder of the currently active player */
  readonly currentPlayerIndex: number;
  /** Clockwise or counter-clockwise */
  readonly turnDirection: TurnDirection;
  /** Hidden draw pile */
  readonly drawPile: readonly Card[];
  /** Face-up discard pile */
  readonly discardPile: readonly Card[];
  /** Top visible card of the discard pile */
  readonly topDiscardCard: Card;
  /** Active playing color (tracks chosen color after Wilds) */
  readonly activeColor: CardColor;
  /** Incremental turn number */
  readonly turnNumber: number;
  /** Monotonically increasing sequence number for event sourcing */
  readonly sequenceNumber: number;
  /** Player ID vulnerable to a missed-UNO challenge, or null */
  readonly unoVulnerablePlayerId: string | null;
  /** Active multi-step resolution state (e.g. +4 challenge) */
  readonly pendingActionState: PendingActionState | null;
  /** Temporary hand disclosure granted exclusively to challenger */
  readonly inspectionHand: InspectionHand | null;
  /** Winner of the most recent completed round */
  readonly roundWinner: GameWinner | null;
  /** Match winner record if match is completed */
  readonly winner: GameWinner | null;
  /** ISO timestamp when match was created */
  readonly createdAt: string;
  /** ISO timestamp of latest state update */
  readonly updatedAt: string;
}

export interface GameConfig {
  readonly matchId?: string;
  readonly roomId: string;
  readonly variant?: string;
  readonly players: readonly { readonly id: string; readonly username: string }[];
  readonly cardsPerHand?: number;
  readonly targetScore?: number;
  readonly dealerIndex?: number;
}
