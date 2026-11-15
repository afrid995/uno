export type ClassicCardColor = 'red' | 'yellow' | 'green' | 'blue';
export type LightCardColor = 'blue' | 'green' | 'red' | 'yellow';
export type DarkCardColor = 'pink' | 'teal' | 'orange' | 'purple';

export type CardColor = ClassicCardColor | DarkCardColor;

export type NumberCardValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export type ClassicActionCardValue = 'skip' | 'reverse' | 'draw_two';
export type FlipActionCardValue = 'draw_one' | 'draw_five' | 'skip_everyone' | 'flip';
export type FlexActionCardValue = 'flex_draw_two' | 'flex_reverse' | 'flex_skip';
export type NoMercyActionCardValue =
  | 'skip'
  | 'reverse'
  | 'draw_two'
  | 'draw_four'
  | 'discard_all'
  | 'skip_everyone';
export type ActionCardValue =
  | ClassicActionCardValue
  | FlipActionCardValue
  | FlexActionCardValue
  | 'draw_four'
  | 'discard_all'
  | 'hit_2';

export type ClassicWildCardValue = 'wild' | 'wild_draw_four';
export type FlipWildCardValue = 'wild_draw_two' | 'wild_draw_color';
export type FlexWildCardValue =
  | 'wild_all_flip'
  | 'flex_wild_draw_four'
  | 'flex_wild_target_draw_two'
  | 'flex_wild_all_draw';
export type NoMercyWildCardValue =
  | 'wild_reverse_draw_four'
  | 'wild_draw_six'
  | 'wild_draw_ten'
  | 'wild_color_roulette';

export type AllWildActionCardValue =
  | 'wild_reverse'
  | 'wild_skip'
  | 'wild_skip_two'
  | 'wild_draw_two'
  | 'wild_draw_four'
  | 'wild_targeted_draw_two'
  | 'wild_forced_swap';

export type AllWildCardValue = 'wild' | AllWildActionCardValue;

export type TeamsWildCardValue = 'wild_team_play' | 'wild_team_draw_four';

export type AttackWildCardValue =
  | 'wild'
  | 'wild_hit_4'
  | 'wild_attack_attack'
  | 'wild_customizable';

export type WildCardValue =
  | ClassicWildCardValue
  | FlipWildCardValue
  | FlexWildCardValue
  | NoMercyWildCardValue
  | AllWildActionCardValue
  | TeamsWildCardValue
  | AttackWildCardValue;

export type CardValue = NumberCardValue | ActionCardValue | WildCardValue;

export type CardType = 'number' | 'action' | 'wild';

export type FlipSide = 'LIGHT' | 'DARK';

export interface CardFace {
  readonly color: CardColor | null;
  readonly value: CardValue;
  readonly type: CardType;
  readonly scoreValue: number;
}

export interface Card {
  /** Globally unique card instance ID within the match/deck (e.g. "c_red_7_1" or "flip_card_001") */
  readonly id: string;
  /** Natural color of the card, or null for neutral wild cards */
  readonly color: CardColor | null;
  /** Card face value or action symbol */
  readonly value: CardValue;
  /** General category: number, action, or wild */
  readonly type: CardType;
  /** Point value scored by opponent upon round end per official rules */
  readonly scoreValue: number;
  /** Game variant identifier this card belongs to (e.g. "classic" or "uno_flip") */
  readonly variant: string;
  /** Optional double-sided faces for UNO Flip */
  readonly lightFace?: CardFace;
  readonly darkFace?: CardFace;
  readonly currentSide?: FlipSide;
  /** Optional secondary flex color for UNO Flex */
  readonly flexColor?: CardColor | null;
  /** Optional flip icon indicator for UNO Flex classic number cards */
  readonly hasFlipIcon?: boolean;
  /** Optional passing symbol indicator for UNO Teams number cards */
  readonly hasPassingSymbol?: boolean;
}

export interface PhysicalFlipCard extends Card {
  readonly variant: 'uno_flip';
  readonly lightFace: CardFace;
  readonly darkFace: CardFace;
  readonly currentSide: FlipSide;
}

export function isFlipCard(card: Card): card is PhysicalFlipCard {
  return card.variant === 'uno_flip' && !!card.lightFace && !!card.darkFace;
}

export function isFlexCard(card: Card): boolean {
  return (
    card.variant === 'uno_flex' &&
    (!!card.flexColor ||
      card.value === 'flex_draw_two' ||
      card.value === 'flex_reverse' ||
      card.value === 'flex_skip' ||
      card.value === 'flex_wild_draw_four' ||
      card.value === 'flex_wild_target_draw_two' ||
      card.value === 'flex_wild_all_draw')
  );
}

export function isTeamsCard(card: Card): boolean {
  return card.variant === 'uno_teams';
}

export const CLASSIC_CARD_COLORS: readonly ClassicCardColor[] = ['red', 'yellow', 'green', 'blue'] as const;
export const LIGHT_CARD_COLORS: readonly LightCardColor[] = ['blue', 'green', 'red', 'yellow'] as const;
export const DARK_CARD_COLORS: readonly DarkCardColor[] = ['pink', 'teal', 'orange', 'purple'] as const;

export const CARD_COLORS: readonly ClassicCardColor[] = ['red', 'yellow', 'green', 'blue'] as const;

export const NUMBER_VALUES: readonly NumberCardValue[] = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
] as const;

export const ACTION_VALUES: readonly ClassicActionCardValue[] = [
  'skip',
  'reverse',
  'draw_two',
] as const;

export const WILD_VALUES: readonly ClassicWildCardValue[] = [
  'wild',
  'wild_draw_four',
] as const;

export const ALL_CARD_COLORS: readonly CardColor[] = [
  ...CARD_COLORS,
  ...DARK_CARD_COLORS,
] as const;

export const ALL_ACTION_VALUES: readonly ActionCardValue[] = [
  ...ACTION_VALUES,
  'draw_one',
  'draw_five',
  'skip_everyone',
  'flip',
  'draw_four',
  'discard_all',
  'flex_draw_two',
  'flex_reverse',
  'flex_skip',
] as const;

export const ALL_WILD_VALUES: readonly WildCardValue[] = [
  ...WILD_VALUES,
  'wild_draw_two',
  'wild_draw_color',
  'wild_reverse_draw_four',
  'wild_draw_six',
  'wild_draw_ten',
  'wild_color_roulette',
  'wild_all_flip',
  'flex_wild_draw_four',
  'flex_wild_target_draw_two',
  'flex_wild_all_draw',
  'wild_reverse',
  'wild_skip',
  'wild_skip_two',
  'wild_targeted_draw_two',
  'wild_forced_swap',
  'wild_team_play',
  'wild_team_draw_four',
  'wild_hit_4',
  'wild_attack_attack',
  'wild_customizable',
] as const;

export function isAttackCard(card: Card): boolean {
  return card.variant === 'uno_attack';
}
