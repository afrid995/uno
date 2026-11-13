import { LightCardColor, DarkCardColor } from '../../cards/card.types';

export const FLIP_LIGHT_COLORS: readonly LightCardColor[] = [
  'blue',
  'green',
  'red',
  'yellow',
] as const;

export const FLIP_DARK_COLORS: readonly DarkCardColor[] = [
  'pink',
  'teal',
  'orange',
  'purple',
] as const;

export const UNO_FLIP_RULES = {
  EDITION: 'Mattel UNO Flip GDR44 (112 double-sided cards edition)',
  DECK_SIZE: 112,
  INITIAL_HAND_SIZE: 7,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 10,
  TARGET_WIN_SCORE: 500,
  MISSED_UNO_PENALTY_CARDS: 2, // Official Mattel GDR44: 2 cards (differs from Classic 4-card rule)

  // Light Side point values (Official Mattel GDR44 Scoring Table)
  LIGHT_DRAW_ONE_POINTS: 10,
  LIGHT_REVERSE_POINTS: 20,
  LIGHT_SKIP_POINTS: 20,
  LIGHT_FLIP_POINTS: 20,
  LIGHT_WILD_POINTS: 40,
  LIGHT_WILD_DRAW_TWO_POINTS: 50,

  // Dark Side point values (Official Mattel GDR44 Scoring Table)
  DARK_DRAW_FIVE_POINTS: 20,
  DARK_REVERSE_POINTS: 20,
  DARK_SKIP_EVERYONE_POINTS: 30,
  DARK_FLIP_POINTS: 20,
  DARK_WILD_POINTS: 40,
  DARK_WILD_DRAW_COLOR_POINTS: 60,
} as const;
