import { Card, CardColor } from './card.types';

/**
 * Standard UNO Color Ordering:
 * 1. Red
 * 2. Blue
 * 3. Green
 * 4. Yellow
 * Followed by UNO Flip Dark Side colors:
 * 5. Pink
 * 6. Teal
 * 7. Orange
 * 8. Purple
 * Followed by any other custom colors, and finally Wild cards at rank 99.
 */
export const COLOR_ORDER_MAP: Record<string, number> = {
  red: 1,
  blue: 2,
  green: 3,
  yellow: 4,
  pink: 5,
  teal: 6,
  orange: 7,
  purple: 8,
};

/**
 * Action card ordering hierarchy within a color group:
 * Numeric cards always precede action cards.
 * Action cards are sorted ascending by scoreValue, then by defined hierarchy.
 */
export const ACTION_VALUE_HIERARCHY: Record<string, number> = {
  draw_two: 1,
  flex_draw_two: 1,
  reverse: 2,
  flex_reverse: 2,
  skip: 3,
  flex_skip: 3,
  flip: 4,
  draw_four: 5,
  discard_all: 6,
  skip_everyone: 7,
};

/**
 * Wild card ordering hierarchy:
 * Plain Wild cards first, followed by Draw / Reverse Draw / Action Wilds in ascending power.
 */
export const WILD_VALUE_HIERARCHY: Record<string, number> = {
  wild: 1,
  wild_customizable: 2,
  wild_team_play: 3,
  wild_reverse: 4,
  wild_skip: 5,
  wild_skip_two: 6,
  wild_draw_two: 7,
  wild_targeted_draw_two: 8,
  flex_wild_target_draw_two: 8,
  wild_draw_four: 9,
  wild_reverse_draw_four: 10,
  flex_wild_draw_four: 10,
  wild_team_draw_four: 11,
  wild_draw_six: 12,
  wild_draw_ten: 13,
  wild_draw_color: 14,
  flex_wild_all_draw: 15,
  wild_forced_swap: 16,
  wild_attack_attack: 17,
  wild_hit_4: 18,
  wild_all_flip: 19,
};

export function isWildLikeCard(card: Card): boolean {
  return card.type === 'wild' || (card.color as string) === 'wild' || card.color === null || !card.color;
}

export function getColorRank(color: CardColor | null | undefined, isWild: boolean): number {
  if (isWild || !color || (color as string) === 'wild') return 99;
  return COLOR_ORDER_MAP[color] ?? 90;
}

/**
 * Pure presentation / hand-ordering function:
 * 1. Groups cards by color: Red, Blue, Green, Yellow, (Flip dark colors), then Wild.
 * 2. Within each color group:
 *    - Numeric cards sorted by ascending numeric value (0-9).
 *    - Action cards sorted after numeric cards by scoreValue ascending, then action hierarchy.
 * 3. Wild cards grouped together at the end, sorted by scoreValue ascending, then wild hierarchy.
 * 4. Duplicate cards are preserved and sorted stably by card ID.
 * 5. Safe against undefined/unexpected color or score.
 */
export function sortPlayerHand(cards: readonly Card[]): Card[] {
  if (!cards || cards.length <= 1) {
    return cards ? [...cards] : [];
  }

  return [...cards].sort((a, b) => {
    const aIsWild = isWildLikeCard(a);
    const bIsWild = isWildLikeCard(b);

    // 1. Color group ordering
    const aColorRank = getColorRank(a.color, aIsWild);
    const bColorRank = getColorRank(b.color, bIsWild);

    if (aColorRank !== bColorRank) {
      return aColorRank - bColorRank;
    }

    // Both cards belong to the same color group (or both are Wild)
    if (!aIsWild && !bIsWild) {
      // 2. Card Category Ordering: Numbers first (1), Actions second (2)
      const aTypeRank = a.type === 'number' ? 1 : 2;
      const bTypeRank = b.type === 'number' ? 1 : 2;

      if (aTypeRank !== bTypeRank) {
        return aTypeRank - bTypeRank;
      }

      // If both are numbers: sort by ascending numeric value
      if (a.type === 'number' && b.type === 'number') {
        const aNum = Number.isInteger(Number(a.value)) ? Number(a.value) : (a.scoreValue ?? 0);
        const bNum = Number.isInteger(Number(b.value)) ? Number(b.value) : (b.scoreValue ?? 0);
        if (aNum !== bNum) {
          return aNum - bNum;
        }
      } else {
        // Both are actions: sort by scoreValue ascending
        const aScore = a.scoreValue ?? 0;
        const bScore = b.scoreValue ?? 0;
        if (aScore !== bScore) {
          return aScore - bScore;
        }

        // Secondary action hierarchy
        const aActionRank = ACTION_VALUE_HIERARCHY[a.value] ?? 50;
        const bActionRank = ACTION_VALUE_HIERARCHY[b.value] ?? 50;
        if (aActionRank !== bActionRank) {
          return aActionRank - bActionRank;
        }

        const valCompare = String(a.value).localeCompare(String(b.value));
        if (valCompare !== 0) return valCompare;
      }
    } else {
      // Both are Wild cards
      // Sort by scoreValue ascending
      const aScore = a.scoreValue ?? 0;
      const bScore = b.scoreValue ?? 0;
      if (aScore !== bScore) {
        return aScore - bScore;
      }

      // Secondary wild hierarchy
      const aWildRank = WILD_VALUE_HIERARCHY[a.value] ?? 50;
      const bWildRank = WILD_VALUE_HIERARCHY[b.value] ?? 50;
      if (aWildRank !== bWildRank) {
        return aWildRank - bWildRank;
      }

      const valCompare = String(a.value).localeCompare(String(b.value));
      if (valCompare !== 0) return valCompare;
    }

    // Stable tie-break for duplicate cards using card ID
    return String(a.id).localeCompare(String(b.id));
  });
}
