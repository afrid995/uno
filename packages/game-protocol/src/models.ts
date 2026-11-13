/**
 * Server-authoritative state models and projections for UNO Ultimate.
 *
 * CRITICAL ARCHITECTURAL SECURITY PRINCIPLE:
 * The server holds the canonical, unredacted game state (including the exact draw pile order
 * and all players' private hands). The server NEVER broadcasts the canonical state directly.
 * Instead, the server projects a strictly filtered PlayerStateProjection for each individual player:
 * 1. Each player only receives their own cards in their private hand.
 * 2. Opponents' hands are projected solely as a card count.
 * 3. The draw pile is projected solely as a count of remaining cards (order is secret).
 * 4. The discard pile top card is public.
 */

export type UnoColor =
  | 'RED'
  | 'YELLOW'
  | 'GREEN'
  | 'BLUE'
  | 'WILD'
  | 'PINK'
  | 'TEAL'
  | 'ORANGE'
  | 'PURPLE';

export type UnoValue =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'SKIP'
  | 'REVERSE'
  | 'DRAW_TWO'
  | 'DRAW_ONE'
  | 'DRAW_FIVE'
  | 'SKIP_EVERYONE'
  | 'FLIP'
  | 'WILD'
  | 'WILD_DRAW_FOUR'
  | 'WILD_DRAW_TWO'
  | 'WILD_DRAW_COLOR';

export interface UnoCard {
  id: string;
  color: UnoColor;
  value: UnoValue;
}

export interface PlayerPublicProfile {
  guestId: string;
  username: string;
  cardCount: number;
  isHost: boolean;
  isConnected: boolean;
  hasCalledUno: boolean;
}

export interface PlayerStateProjection {
  playerId: string;
  roomCode: string;
  currentTurnPlayerId: string;
  direction: 'CLOCKWISE' | 'COUNTER_CLOCKWISE';
  topDiscardCard: UnoCard;
  currentColor: UnoColor;
  drawPileCount: number;
  privateHand: UnoCard[]; // Only visible to this specific player
  players: PlayerPublicProfile[];
}

export interface ServerAuthoritativeGameState {
  roomCode: string;
  hostGuestId: string;
  deck: UnoCard[]; // SECRET: Only on server
  discardPile: UnoCard[];
  playerHands: Map<string, UnoCard[]>; // SECRET: Master collection
  currentTurnIndex: number;
  direction: 1 | -1;
  currentColor: UnoColor;
}
