import { Card, CardColor, FlipSide, CardValue } from '../cards/card.types';
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

export interface PendingWildDrawTwoState {
  readonly type: 'AWAITING_WILD_DRAW_TWO_RESOLUTION';
  readonly playedByPlayerId: string;
  readonly victimPlayerId: string;
  readonly wasOfficiallyLegal: boolean;
  readonly chosenColor: CardColor;
  readonly offenderHandSnapshot: readonly Card[];
}

export interface PendingWildDrawColorState {
  readonly type: 'AWAITING_WILD_DRAW_COLOR_RESOLUTION';
  readonly playedByPlayerId: string;
  readonly victimPlayerId: string;
  readonly wasOfficiallyLegal: boolean;
  readonly chosenColor: CardColor;
  readonly offenderHandSnapshot: readonly Card[];
}

export interface PendingStartingWildColorState {
  readonly type: 'AWAITING_STARTING_WILD_COLOR_SELECTION';
  readonly designatedPlayerId: string;
}

export interface PendingStackState {
  readonly type: 'AWAITING_STACK_RESOLUTION';
  readonly targetPlayerId: string;
  readonly playedByPlayerId: string;
  readonly accumulatedPenalty: number;
  /** The numerical penalty of the last played card (2, 4, 6, 10). Next stack card must be >= lastStackedValue */
  readonly lastStackedValue: number;
  readonly lastCardValue: CardValue;
  readonly chosenColor?: CardColor;
}

export interface Pending7sSwapState {
  readonly type: 'AWAITING_7S_SWAP_SELECTION';
  readonly sourcePlayerId: string;
}

export interface PendingColorRouletteState {
  readonly type: 'AWAITING_COLOR_ROULETTE_SELECTION';
  readonly victimPlayerId: string;
  readonly playedByPlayerId: string;
}

export type PendingActionState =
  | PendingWildDrawFourState
  | PendingWildDrawTwoState
  | PendingWildDrawColorState
  | PendingStartingWildColorState
  | PendingStackState
  | Pending7sSwapState
  | PendingColorRouletteState;

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
  /** Active playing color (tracks chosen color after Wilds, null if awaiting starting Wild color selection) */
  readonly activeColor: CardColor | null;
  /** Authoritative side for UNO Flip ('LIGHT' or 'DARK') */
  readonly activeSide?: FlipSide;
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
  /** Discarded / set-aside cards from eliminated players for 168-card conservation */
  readonly setAsideCards?: readonly Card[];
  /** IDs of players eliminated under the Mercy Rule (25+ cards) */
  readonly eliminatedPlayerIds?: readonly string[];
  /** Number of players eliminated during the current hand (for 250pt winner bonus) */
  readonly eliminatedBonusCount?: number;
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
