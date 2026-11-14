import { ClassicCardColor } from '../../cards/card.types';

export const UNO_FLEX_RULES = {
  EDITION: 'Mattel UNO Flex (Product HNB00 / HMY99 112-card edition)',
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 8,
  TARGET_WIN_SCORE: 500,
  TOTAL_CARDS: 112,
  PLAYING_CARDS: 104,
  POWER_CARDS: 8,
  INITIAL_HAND_SIZE: 7,
  MISSED_UNO_PENALTY_CARDS: 2,
  SCORES: {
    ACTION_CARD: 20,
    WILD_CARD: 50,
  },
} as const;

export const FLEX_CARD_COLORS: readonly ClassicCardColor[] = [
  'red',
  'yellow',
  'green',
  'blue',
] as const;

/**
 * Deterministic color pairing for Flex cards:
 * Red:    1-3 flexes to Blue,   4-6 flexes to Green,  7-8 flexes to Yellow, Draw Two -> Blue,   Reverse -> Green,  Skip -> Yellow
 * Yellow: 1-3 flexes to Green,  4-6 flexes to Blue,   7-8 flexes to Red,    Draw Two -> Green,  Reverse -> Blue,   Skip -> Red
 * Green:  1-3 flexes to Yellow, 4-6 flexes to Red,    7-8 flexes to Blue,   Draw Two -> Yellow, Reverse -> Red,    Skip -> Blue
 * Blue:   1-3 flexes to Red,    4-6 flexes to Yellow, 7-8 flexes to Green,  Draw Two -> Red,    Reverse -> Yellow, Skip -> Green
 */
export function getFlexNumberSecondaryColor(
  primaryColor: ClassicCardColor,
  value: number
): ClassicCardColor {
  switch (primaryColor) {
    case 'red':
      if (value <= 3) return 'blue';
      if (value <= 6) return 'green';
      return 'yellow';
    case 'yellow':
      if (value <= 3) return 'green';
      if (value <= 6) return 'blue';
      return 'red';
    case 'green':
      if (value <= 3) return 'yellow';
      if (value <= 6) return 'red';
      return 'blue';
    case 'blue':
      if (value <= 3) return 'red';
      if (value <= 6) return 'yellow';
      return 'green';
  }
}

export function getFlexActionSecondaryColor(
  primaryColor: ClassicCardColor,
  action: 'flex_draw_two' | 'flex_reverse' | 'flex_skip'
): ClassicCardColor {
  switch (primaryColor) {
    case 'red':
      if (action === 'flex_draw_two') return 'blue';
      if (action === 'flex_reverse') return 'green';
      return 'yellow';
    case 'yellow':
      if (action === 'flex_draw_two') return 'green';
      if (action === 'flex_reverse') return 'blue';
      return 'red';
    case 'green':
      if (action === 'flex_draw_two') return 'yellow';
      if (action === 'flex_reverse') return 'red';
      return 'blue';
    case 'blue':
      if (action === 'flex_draw_two') return 'red';
      if (action === 'flex_reverse') return 'yellow';
      return 'green';
  }
}

/**
 * Classic Number Cards with the Flip icon:
 * - Even numbers (2, 4, 6, 8) in Red and Green
 * - Odd numbers (1, 3, 5, 7) in Yellow and Blue
 */
export function classicNumberHasFlipIcon(
  color: ClassicCardColor,
  numValue: number
): boolean {
  const isEven = numValue % 2 === 0;
  if (color === 'red' || color === 'green') {
    return isEven; // Even in Red & Green
  } else {
    return !isEven; // Odd in Yellow & Blue
  }
}
