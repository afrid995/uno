import { CardColor } from '../../cards/card.types';

export const UNO_TEAMS_RULES = {
  MIN_PLAYERS: 4,
  MAX_PLAYERS: 8,
  INITIAL_HAND_SIZE: 7,
  TARGET_WIN_SCORE: 500,
  MISSED_UNO_PENALTY_CARDS: 2,
  WILD_TEAM_PLAY_PENALTY_CARDS: 2,
  WILD_TEAM_DRAW_FOUR_PENALTY_PER_PLAYER: 2,
  TOTAL_CARDS_IN_DECK: 112,
} as const;

export const TEAMS_COLORS: readonly CardColor[] = ['red', 'yellow', 'green', 'blue'] as const;

export const TEAMS_CARD_SCORES = {
  ACTION_CARD: 20,
  WILD_CARD: 50,
} as const;

export function getTeamsCardScore(type: 'number' | 'action' | 'wild', value: string): number {
  if (type === 'number') {
    return parseInt(value, 10);
  }
  if (type === 'action') {
    return TEAMS_CARD_SCORES.ACTION_CARD;
  }
  return TEAMS_CARD_SCORES.WILD_CARD;
}
