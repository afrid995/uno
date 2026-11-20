import { Card } from '../cards/card.types';

export type PowerCardStatus = 'green_check' | 'red_x';

export interface Player {
  /** Unique guest identifier */
  readonly id: string;
  /** Display username */
  readonly username: string;
  /** Server-authoritative secret hand */
  readonly hand: readonly Card[];
  /** Whether the player has declared UNO for their current single-card status */
  readonly hasDeclaredUno: boolean;
  /** Whether the player drew from the deck on their active turn */
  readonly hasDrawnThisTurn: boolean;
  /** The specific card drawn this turn, if still eligible to be played */
  readonly drawnCardId: string | null;
  /** Accumulated match score */
  readonly score: number;
  /** Points scored in the current round */
  readonly roundScore?: number;
  /** Cumulative score across rematches / room session */
  readonly cumulativeScore?: number;
  /** Whether the player has been eliminated under the Mercy Rule (25+ cards) */
  readonly isEliminated?: boolean;
  /** Elimination sequence order if eliminated */
  readonly eliminationOrder?: number;
  /** State of player's Power Card in UNO Flex (green checkmark or red X) */
  readonly powerCardStatus?: PowerCardStatus;
  /** Team identifier for UNO Teams (e.g. 'team_1', 'team_2') */
  readonly teamId?: string;
  /** Whether the player has emptied their hand and is waiting or out of the game */
  readonly isOut?: boolean;
}
