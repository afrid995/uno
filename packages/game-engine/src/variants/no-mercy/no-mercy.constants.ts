import { ClassicCardColor } from '../../cards/card.types';

export const NO_MERCY_COLORS: readonly ClassicCardColor[] = [
  'red',
  'yellow',
  'green',
  'blue',
] as const;

export const UNO_NO_MERCY_RULES = {
  EDITION: "Mattel UNO Show 'em No Mercy (Product HWV18 168-card edition)",
  DECK_SIZE: 168,
  INITIAL_HAND_SIZE: 7,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 6,
  TARGET_WIN_SCORE: 1000,
  MERCY_HAND_LIMIT: 25,
  MISSED_UNO_PENALTY_CARDS: 2,
  ELIMINATION_BONUS_POINTS: 250,

  // Action card point values per official Mattel HWV18 scoring table
  COLORED_ACTION_POINTS: 20, // Skip, Reverse, Draw 2, Draw 4, Discard All, Skip Everyone
  WILD_ACTION_POINTS: 50, // Wild Reverse Draw 4, Wild Draw 6, Wild Draw 10, Wild Color Roulette
} as const;

export function getNoMercyDrawPenalty(cardValue: string): number | null {
  switch (cardValue) {
    case 'draw_two':
      return 2;
    case 'draw_four':
    case 'wild_reverse_draw_four':
      return 4;
    case 'wild_draw_six':
      return 6;
    case 'wild_draw_ten':
      return 10;
    default:
      return null;
  }
}
