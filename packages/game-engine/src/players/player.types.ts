import { Card } from '../cards/card.types';

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
  /** Whether the player has been eliminated under the Mercy Rule (25+ cards) */
  readonly isEliminated?: boolean;
  /** Elimination sequence order if eliminated */
  readonly eliminationOrder?: number;
}
