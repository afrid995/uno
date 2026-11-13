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

  // Light Side point values
  LIGHT_ACTION_POINTS: 20,
  LIGHT_FLIP_POINTS: 20,
  LIGHT_WILD_POINTS: 50,
  LIGHT_WILD_DRAW_TWO_POINTS: 50,

  // Dark Side point values
  DARK_ACTION_POINTS: 20,
  DARK_FLIP_POINTS: 20,
  DARK_WILD_POINTS: 50,
  DARK_WILD_DRAW_COLOR_POINTS: 60, // Official English Mattel GDR44 scoring table
} as const;
