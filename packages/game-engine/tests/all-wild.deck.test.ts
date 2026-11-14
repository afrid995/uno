import { describe, it, expect } from 'vitest';
import { AllWildDeckFactory } from '../src/variants/all-wild/all-wild.deck';
import { ALL_WILD_RULES, ALL_WILD_CARD_COUNTS, ALL_WILD_CARD_POINTS } from '../src/variants/all-wild/all-wild.constants';

describe('UNO All Wild — Deck Inventory & Generation (Mattel HHL33)', () => {
  it('creates exactly 112 cards in the deck', () => {
    const deck = AllWildDeckFactory.createDeck();
    expect(deck).toHaveLength(ALL_WILD_RULES.DECK_SIZE);
    expect(deck).toHaveLength(112);
  });

  it('guarantees unique IDs for all 112 physical cards', () => {
    const deck = AllWildDeckFactory.createDeck();
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(112);
  });

  it('all cards in the deck have type "wild" and color null', () => {
    const deck = AllWildDeckFactory.createDeck();
    for (const card of deck) {
      expect(card.type).toBe('wild');
      expect(card.color).toBeNull();
    }
  });

  it('contains exactly 54 Standard Wild cards', () => {
    const deck = AllWildDeckFactory.createDeck();
    const standardWilds = deck.filter((c) => c.value === 'wild');
    expect(standardWilds).toHaveLength(ALL_WILD_CARD_COUNTS.wild);
    expect(standardWilds).toHaveLength(54);
  });

  it('contains exactly 14 Wild Reverse cards', () => {
    const deck = AllWildDeckFactory.createDeck();
    const reverses = deck.filter((c) => c.value === 'wild_reverse');
    expect(reverses).toHaveLength(ALL_WILD_CARD_COUNTS.wild_reverse);
    expect(reverses).toHaveLength(14);
  });

  it('contains exactly 14 Wild Skip cards', () => {
    const deck = AllWildDeckFactory.createDeck();
    const skips = deck.filter((c) => c.value === 'wild_skip');
    expect(skips).toHaveLength(ALL_WILD_CARD_COUNTS.wild_skip);
    expect(skips).toHaveLength(14);
  });

  it('contains exactly 10 Wild Draw Two cards', () => {
    const deck = AllWildDeckFactory.createDeck();
    const drawTwos = deck.filter((c) => c.value === 'wild_draw_two');
    expect(drawTwos).toHaveLength(ALL_WILD_CARD_COUNTS.wild_draw_two);
    expect(drawTwos).toHaveLength(10);
  });

  it('contains exactly 6 Wild Skip Two cards', () => {
    const deck = AllWildDeckFactory.createDeck();
    const skipTwos = deck.filter((c) => c.value === 'wild_skip_two');
    expect(skipTwos).toHaveLength(ALL_WILD_CARD_COUNTS.wild_skip_two);
    expect(skipTwos).toHaveLength(6);
  });

  it('contains exactly 6 Wild Draw Four cards', () => {
    const deck = AllWildDeckFactory.createDeck();
    const drawFours = deck.filter((c) => c.value === 'wild_draw_four');
    expect(drawFours).toHaveLength(ALL_WILD_CARD_COUNTS.wild_draw_four);
    expect(drawFours).toHaveLength(6);
  });

  it('contains exactly 4 Wild Targeted Draw Two cards', () => {
    const deck = AllWildDeckFactory.createDeck();
    const targetedDrawTwos = deck.filter((c) => c.value === 'wild_targeted_draw_two');
    expect(targetedDrawTwos).toHaveLength(ALL_WILD_CARD_COUNTS.wild_targeted_draw_two);
    expect(targetedDrawTwos).toHaveLength(4);
  });

  it('contains exactly 4 Wild Forced Swap cards', () => {
    const deck = AllWildDeckFactory.createDeck();
    const forcedSwaps = deck.filter((c) => c.value === 'wild_forced_swap');
    expect(forcedSwaps).toHaveLength(ALL_WILD_CARD_COUNTS.wild_forced_swap);
    expect(forcedSwaps).toHaveLength(4);
  });

  it('has correct card scoring point assignments (20 pts for standard, 50 pts for action)', () => {
    expect(ALL_WILD_CARD_POINTS.wild).toBe(20);
    expect(ALL_WILD_CARD_POINTS.wild_reverse).toBe(50);
    expect(ALL_WILD_CARD_POINTS.wild_skip).toBe(50);
    expect(ALL_WILD_CARD_POINTS.wild_draw_two).toBe(50);
    expect(ALL_WILD_CARD_POINTS.wild_skip_two).toBe(50);
    expect(ALL_WILD_CARD_POINTS.wild_draw_four).toBe(50);
    expect(ALL_WILD_CARD_POINTS.wild_targeted_draw_two).toBe(50);
    expect(ALL_WILD_CARD_POINTS.wild_forced_swap).toBe(50);
  });
});
