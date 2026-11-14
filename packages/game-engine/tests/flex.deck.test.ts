import { describe, it, expect } from 'vitest';
import { FlexDeckFactory } from '../src/variants/flex/flex.deck';
import {
  UNO_FLEX_RULES,
  FLEX_CARD_COLORS,
  classicNumberHasFlipIcon,
  getFlexNumberSecondaryColor,
  getFlexActionSecondaryColor,
} from '../src/variants/flex/flex.constants';

describe('UNO Flex — Deck Composition & Inventory Tests (Mattel Product HNB00 / HMY99)', () => {
  const deck = FlexDeckFactory.createDeck();

  it('generates exactly 104 playing cards in the deck', () => {
    expect(deck).toHaveLength(104);
    expect(deck.length).toBe(UNO_FLEX_RULES.PLAYING_CARDS);
  });

  it('ensures all 104 card IDs are unique', () => {
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(104);
  });

  it('ensures all cards have variant "uno_flex"', () => {
    expect(deck.every((c) => c.variant === 'uno_flex')).toBe(true);
  });

  it('contains exactly 64 number cards (numbers 1-8, no zeros)', () => {
    const numbers = deck.filter((c) => c.type === 'number');
    expect(numbers).toHaveLength(64);

    // No zeros in UNO Flex
    expect(numbers.some((c) => c.value === '0')).toBe(false);

    // Every number card is between 1 and 8
    for (const card of numbers) {
      const num = parseInt(card.value, 10);
      expect(num).toBeGreaterThanOrEqual(1);
      expect(num).toBeLessThanOrEqual(8);
      expect(card.scoreValue).toBe(num);
    }
  });

  it('splits number cards evenly into 32 Classic Number Cards and 32 Flex Number Cards', () => {
    const classicNumbers = deck.filter(
      (c) => c.type === 'number' && !c.flexColor
    );
    const flexNumbers = deck.filter(
      (c) => c.type === 'number' && !!c.flexColor
    );

    expect(classicNumbers).toHaveLength(32);
    expect(flexNumbers).toHaveLength(32);
  });

  it('contains exactly 16 Classic Number Cards with flip icon and 16 without', () => {
    const classicNumbers = deck.filter(
      (c) => c.type === 'number' && !c.flexColor
    );

    const withFlip = classicNumbers.filter((c) => c.hasFlipIcon === true);
    const withoutFlip = classicNumbers.filter((c) => c.hasFlipIcon === false);

    expect(withFlip).toHaveLength(16);
    expect(withoutFlip).toHaveLength(16);

    // Red & Green even (2, 4, 6, 8) have flip; odd (1, 3, 5, 7) do not
    // Yellow & Blue odd (1, 3, 5, 7) have flip; even (2, 4, 6, 8) do not
    for (const card of classicNumbers) {
      const val = parseInt(card.value, 10);
      const expected = classicNumberHasFlipIcon(card.color as any, val);
      expect(card.hasFlipIcon).toBe(expected);
    }
  });

  it('verifies deterministic color pairing on all 32 Flex Number Cards', () => {
    const flexNumbers = deck.filter(
      (c) => c.type === 'number' && !!c.flexColor
    );

    for (const card of flexNumbers) {
      const val = parseInt(card.value, 10);
      const expectedFlex = getFlexNumberSecondaryColor(card.color as any, val);
      expect(card.flexColor).toBe(expectedFlex);
      expect(card.hasFlipIcon).toBe(false);
    }
  });

  it('contains exactly 24 Action Cards (12 Classic + 12 Flex)', () => {
    const actions = deck.filter((c) => c.type === 'action');
    expect(actions).toHaveLength(24);

    const classicActions = actions.filter((c) => !c.value.startsWith('flex_'));
    const flexActions = actions.filter((c) => c.value.startsWith('flex_'));

    expect(classicActions).toHaveLength(12);
    expect(flexActions).toHaveLength(12);

    // Each action scores 20 points
    expect(actions.every((c) => c.scoreValue === 20)).toBe(true);

    // 4 of each classic action
    expect(deck.filter((c) => c.value === 'draw_two')).toHaveLength(4);
    expect(deck.filter((c) => c.value === 'reverse')).toHaveLength(4);
    expect(deck.filter((c) => c.value === 'skip')).toHaveLength(4);

    // 4 of each flex action
    expect(deck.filter((c) => c.value === 'flex_draw_two')).toHaveLength(4);
    expect(deck.filter((c) => c.value === 'flex_reverse')).toHaveLength(4);
    expect(deck.filter((c) => c.value === 'flex_skip')).toHaveLength(4);
  });

  it('verifies deterministic secondary colors on all 12 Flex Action Cards', () => {
    const flexActions = deck.filter(
      (c) => c.type === 'action' && c.value.startsWith('flex_')
    );

    for (const card of flexActions) {
      const expectedFlex = getFlexActionSecondaryColor(
        card.color as any,
        card.value as any
      );
      expect(card.flexColor).toBe(expectedFlex);
    }
  });

  it('contains exactly 16 Wild Cards (6 Wild All Flip, 2 Flex Wild Draw Four, 4 Flex Wild Target Draw Two, 4 Flex Wild All Draw)', () => {
    const wilds = deck.filter((c) => c.type === 'wild');
    expect(wilds).toHaveLength(16);

    // All wild cards score 50 points
    expect(wilds.every((c) => c.scoreValue === 50)).toBe(true);
    expect(wilds.every((c) => c.color === null)).toBe(true);

    expect(deck.filter((c) => c.value === 'wild_all_flip')).toHaveLength(6);
    expect(deck.filter((c) => c.value === 'flex_wild_draw_four')).toHaveLength(2);
    expect(deck.filter((c) => c.value === 'flex_wild_target_draw_two')).toHaveLength(4);
    expect(deck.filter((c) => c.value === 'flex_wild_all_draw')).toHaveLength(4);
  });

  it('verifies total point value of the entire deck', () => {
    // Numbers: 64 cards
    // 32 classic (sum of 1..8 = 36 * 4 colors = 144)
    // 32 flex (sum of 1..8 = 36 * 4 colors = 144) -> numbers total = 288
    // Actions: 24 cards * 20 = 480
    // Wilds: 16 cards * 50 = 800
    // Total = 288 + 480 + 800 = 1568
    const totalPoints = deck.reduce((sum, c) => sum + c.scoreValue, 0);
    expect(totalPoints).toBe(1568);
  });
});
