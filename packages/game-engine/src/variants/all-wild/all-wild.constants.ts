import { AllWildCardValue, AllWildActionCardValue } from '../../cards/card.types';

export const UNO_ALL_WILD_RULES = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 10,
  INITIAL_HAND_SIZE: 7,
  TARGET_WIN_SCORE: 500,
  MISSED_UNO_PENALTY_CARDS: 2,
  TOTAL_DECK_SIZE: 112,
  DECK_SIZE: 112,
} as const;

export const ALL_WILD_RULES = UNO_ALL_WILD_RULES;

export const ALL_WILD_INVENTORY_COUNTS: Record<AllWildCardValue, number> = {
  wild: 54,
  wild_reverse: 14,
  wild_skip: 14,
  wild_draw_two: 10,
  wild_skip_two: 6,
  wild_draw_four: 6,
  wild_targeted_draw_two: 4,
  wild_forced_swap: 4,
} as const;

export const ALL_WILD_CARD_COUNTS = ALL_WILD_INVENTORY_COUNTS;

export const ALL_WILD_ACTION_VALUES: readonly AllWildActionCardValue[] = [
  'wild_reverse',
  'wild_skip',
  'wild_skip_two',
  'wild_draw_two',
  'wild_draw_four',
  'wild_targeted_draw_two',
  'wild_forced_swap',
] as const;

export const ALL_WILD_SCORES: Record<AllWildCardValue, number> = {
  wild: 20,
  wild_reverse: 50,
  wild_skip: 50,
  wild_skip_two: 50,
  wild_draw_two: 50,
  wild_draw_four: 50,
  wild_targeted_draw_two: 50,
  wild_forced_swap: 50,
} as const;

export const ALL_WILD_CARD_POINTS = ALL_WILD_SCORES;

