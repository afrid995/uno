import { describe, it, expect } from 'vitest';
import { DeckFactory } from '../src/deck/deck.factory';
import { DeckManager } from '../src/deck/deck.manager';
import { shuffleDeck } from '../src/deck/deck.shuffle';
import { createSeededRng } from '../src/testing/deterministic-random';
import { CARD_COLORS } from '../src/cards/card.types';

describe('Deck and Shuffling Verification', () => {
  it('generates exactly 108 cards for canonical Classic UNO deck', () => {
    const deck = DeckFactory.createClassicDeck();
    expect(deck).toHaveLength(108);
  });

  it('guarantees globally unique IDs for all 108 cards', () => {
    const deck = DeckFactory.createClassicDeck();
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(108);
  });

  it('verifies exact color and type distribution per official Mattel rules', () => {
    const deck = DeckFactory.createClassicDeck();

    // 25 cards per color (1 zero + 18 1-9s + 2 skips + 2 reverses + 2 draw twos = 25)
    for (const color of CARD_COLORS) {
      const coloredCards = deck.filter((c) => c.color === color);
      expect(coloredCards).toHaveLength(25);

      // One zero
      expect(coloredCards.filter((c) => c.value === '0')).toHaveLength(1);

      // Two of each 1-9 (18 cards)
      for (let i = 1; i <= 9; i++) {
        expect(coloredCards.filter((c) => c.value === String(i))).toHaveLength(2);
      }

      // Two of each action
      expect(coloredCards.filter((c) => c.value === 'skip')).toHaveLength(2);
      expect(coloredCards.filter((c) => c.value === 'reverse')).toHaveLength(2);
      expect(coloredCards.filter((c) => c.value === 'draw_two')).toHaveLength(2);
    }

    // 8 Wild cards total (4 Wild, 4 Wild Draw Four)
    const wildCards = deck.filter((c) => c.type === 'wild');
    expect(wildCards).toHaveLength(8);
    expect(wildCards.filter((c) => c.value === 'wild')).toHaveLength(4);
    expect(wildCards.filter((c) => c.value === 'wild_draw_four')).toHaveLength(4);

    // Total: 25 * 4 = 100 colored + 8 wilds = 108 cards
    expect(100 + 8).toBe(108);
  });

  it('Fisher-Yates shuffle preserves all elements without mutation', () => {
    const deck = DeckFactory.createClassicDeck();
    const originalDeck = [...deck];
    const shuffled = shuffleDeck(deck);

    expect(shuffled).toHaveLength(108);
    expect(deck).toEqual(originalDeck); // original unchanged
    // Elements should match set
    expect(new Set(shuffled.map((c) => c.id))).toEqual(new Set(deck.map((c) => c.id)));
  });

  it('deterministic shuffle with seeded RNG produces identical permutations', () => {
    const deck = DeckFactory.createClassicDeck();
    const rng1 = createSeededRng(12345);
    const rng2 = createSeededRng(12345);

    const shuffled1 = shuffleDeck(deck, rng1);
    const shuffled2 = shuffleDeck(deck, rng2);

    expect(shuffled1.map((c) => c.id)).toEqual(shuffled2.map((c) => c.id));
  });

  it('draws cards and reshuffles discard pile when draw pile is exhausted', () => {
    const deck = DeckFactory.createClassicDeck();
    const drawPile = [deck[0], deck[1]]; // only 2 cards in draw pile
    const discardPile = [deck[2], deck[3], deck[4], deck[5]]; // 4 cards in discard
    const rng = createSeededRng(42);

    // Request 4 cards: 2 from draw pile + 2 from reshuffled discard pile
    const result = DeckManager.drawCards(drawPile, discardPile, 4, rng);

    expect(result.drawnCards).toHaveLength(4);
    expect(result.wasReshuffled).toBe(true);
    // Discard pile must preserve the active top card (deck[5])
    expect(result.newDiscardPile).toEqual([deck[5]]);
    // Total cards conserved
    const totalAfter = result.drawnCards.length + result.newDrawPile.length + result.newDiscardPile.length;
    expect(totalAfter).toBe(drawPile.length + discardPile.length);
  });

  it('asserts deck conservation across all locations', () => {
    const deck = DeckFactory.createClassicDeck();
    const drawPile = deck.slice(0, 80);
    const discardPile = deck.slice(80, 94);
    const hand1 = deck.slice(94, 101);
    const hand2 = deck.slice(101, 108);

    expect(DeckManager.assertDeckConservation(drawPile, discardPile, [hand1, hand2], 108)).toBe(true);

    // If duplicate introduced
    expect(DeckManager.assertDeckConservation(drawPile, discardPile, [hand1, [...hand2.slice(0, 6), hand1[0]]], 108)).toBe(false);
  });
});
