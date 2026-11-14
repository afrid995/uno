import { describe, it, expect } from 'vitest';
import { NoMercyDeckFactory } from '../src/variants/no-mercy/no-mercy.deck';
import { UNO_NO_MERCY_RULES } from '../src/variants/no-mercy/no-mercy.constants';
import { createSeededRng } from '../src/testing/deterministic-random';
import { shuffleDeck } from '../src/deck/deck.shuffle';

describe('UNO Show \'em No Mercy — Deck Inventory & Generation (HWV18)', () => {
  it('creates exactly 168 cards in the deck', () => {
    const deck = NoMercyDeckFactory.createDeck();
    expect(deck).toHaveLength(UNO_NO_MERCY_RULES.DECK_SIZE);
    expect(deck).toHaveLength(168);
  });

  it('guarantees unique IDs for all 168 physical cards', () => {
    const deck = NoMercyDeckFactory.createDeck();
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(168);
  });

  it('contains exactly 80 number cards (two 0-9 in each of the 4 colors)', () => {
    const deck = NoMercyDeckFactory.createDeck();
    const numberCards = deck.filter((c) => c.type === 'number');
    expect(numberCards).toHaveLength(80);

    const colors = ['red', 'yellow', 'green', 'blue'] as const;
    for (const color of colors) {
      for (let num = 0; num <= 9; num++) {
        const matching = numberCards.filter(
          (c) => c.color === color && c.value === String(num)
        );
        expect(matching).toHaveLength(2);
      }
    }
  });

  it('contains exactly 64 colored action cards with correct distributions', () => {
    const deck = NoMercyDeckFactory.createDeck();
    const actionCards = deck.filter((c) => c.type === 'action');
    expect(actionCards).toHaveLength(64);

    const colors = ['red', 'yellow', 'green', 'blue'] as const;
    for (const color of colors) {
      expect(actionCards.filter((c) => c.color === color && c.value === 'skip')).toHaveLength(3);
      expect(actionCards.filter((c) => c.color === color && c.value === 'reverse')).toHaveLength(3);
      expect(actionCards.filter((c) => c.color === color && c.value === 'draw_two')).toHaveLength(3);
      expect(actionCards.filter((c) => c.color === color && c.value === 'draw_four')).toHaveLength(2);
      expect(actionCards.filter((c) => c.color === color && c.value === 'discard_all')).toHaveLength(3);
      expect(actionCards.filter((c) => c.color === color && c.value === 'skip_everyone')).toHaveLength(2);
    }
  });

  it('contains exactly 24 wild action cards with correct distributions', () => {
    const deck = NoMercyDeckFactory.createDeck();
    const wildCards = deck.filter((c) => c.type === 'wild');
    expect(wildCards).toHaveLength(24);

    expect(wildCards.filter((c) => c.value === 'wild_reverse_draw_four')).toHaveLength(8);
    expect(wildCards.filter((c) => c.value === 'wild_color_roulette')).toHaveLength(8);
    expect(wildCards.filter((c) => c.value === 'wild_draw_six')).toHaveLength(4);
    expect(wildCards.filter((c) => c.value === 'wild_draw_ten')).toHaveLength(4);
  });

  it('produces deterministic shuffles with seeded RNG', () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);

    const deck1 = shuffleDeck(NoMercyDeckFactory.createDeck(), rng1);
    const deck2 = shuffleDeck(NoMercyDeckFactory.createDeck(), rng2);

    expect(deck1.map((c) => c.id)).toEqual(deck2.map((c) => c.id));
  });
});
