export type CardColor = 'red' | 'yellow' | 'green' | 'blue';

export type NumberCardValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export type ActionCardValue = 'skip' | 'reverse' | 'draw_two';

export type WildCardValue = 'wild' | 'wild_draw_four';

export type CardValue = NumberCardValue | ActionCardValue | WildCardValue;

export type CardType = 'number' | 'action' | 'wild';

export interface Card {
  /** Globally unique card instance ID within the match/deck (e.g. "c_red_7_1") */
  readonly id: string;
  /** Natural color of the card, or null for neutral wild cards */
  readonly color: CardColor | null;
  /** Card face value or action symbol */
  readonly value: CardValue;
  /** General category: number, action, or wild */
  readonly type: CardType;
  /** Point value scored by opponent upon round end per official Mattel rules */
  readonly scoreValue: number;
  /** Game variant identifier this card belongs to (e.g. "classic") */
  readonly variant: string;
}

export const CARD_COLORS: readonly CardColor[] = ['red', 'yellow', 'green', 'blue'] as const;

export const NUMBER_VALUES: readonly NumberCardValue[] = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
] as const;

export const ACTION_VALUES: readonly ActionCardValue[] = ['skip', 'reverse', 'draw_two'] as const;

export const WILD_VALUES: readonly WildCardValue[] = ['wild', 'wild_draw_four'] as const;
