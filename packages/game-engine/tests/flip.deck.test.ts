import { describe, it, expect } from 'vitest';
import { FlipDeckFactory } from '../src/variants/flip/flip.deck';
import { FLIP_LIGHT_COLORS, FLIP_DARK_COLORS, UNO_FLIP_RULES } from '../src/variants/flip/flip.constants';
import { Card } from '../src/cards/card.types';

describe('UNO Flip Authoritative Deck (Mattel GDR44)', () => {
  it('creates an authoritative 112 double-sided card deck with unique IDs', () => {
    const deck = FlipDeckFactory.createFlipDeck();
    expect(deck).toHaveLength(112);

    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(112);
    expect(deck[0].id).toBe('flip_c_001');
    expect(deck[111].id).toBe('flip_c_112');
  });

  it('contains exactly 112 Light Side faces matching Mattel GDR44 specifications', () => {
    const lightFaces = FlipDeckFactory.generateLightFaces();
    expect(lightFaces).toHaveLength(112);

    // Number cards: 72 (1-9, two each across 4 colors) - NO ZEROES
    const numberCards = lightFaces.filter((f) => f.type === 'number');
    expect(numberCards).toHaveLength(72);
    expect(lightFaces.some((f) => f.value === '0')).toBe(false);

    for (const color of FLIP_LIGHT_COLORS) {
      for (let n = 1; n <= 9; n++) {
        const matches = numberCards.filter((f) => f.color === color && f.value === String(n));
        expect(matches).toHaveLength(2);
        expect(matches[0].scoreValue).toBe(n);
      }
    }

    // Action cards: Draw One (8, 10pts), Reverse (8, 20pts), Skip (8, 20pts), Flip (8, 20pts)
    const drawOneCards = lightFaces.filter((f) => f.value === 'draw_one');
    expect(drawOneCards).toHaveLength(8);
    expect(drawOneCards.every((f) => f.scoreValue === 10)).toBe(true);
    for (const color of FLIP_LIGHT_COLORS) {
      expect(drawOneCards.filter((f) => f.color === color)).toHaveLength(2);
    }

    const reverseCards = lightFaces.filter((f) => f.value === 'reverse');
    expect(reverseCards).toHaveLength(8);
    expect(reverseCards.every((f) => f.scoreValue === 20)).toBe(true);
    for (const color of FLIP_LIGHT_COLORS) {
      expect(reverseCards.filter((f) => f.color === color)).toHaveLength(2);
    }

    const skipCards = lightFaces.filter((f) => f.value === 'skip');
    expect(skipCards).toHaveLength(8);
    expect(skipCards.every((f) => f.scoreValue === 20)).toBe(true);
    for (const color of FLIP_LIGHT_COLORS) {
      expect(skipCards.filter((f) => f.color === color)).toHaveLength(2);
    }

    // Flip card count: 8 Flip cards (2 per color, 20pts each)
    const flipCards = lightFaces.filter((f) => f.value === 'flip');
    expect(flipCards).toHaveLength(8);
    expect(flipCards.every((f) => f.scoreValue === 20)).toBe(true);
    for (const color of FLIP_LIGHT_COLORS) {
      expect(flipCards.filter((f) => f.color === color)).toHaveLength(2);
    }

    // Wild cards (4, 40pts) and Wild Draw Two cards (4, 50pts)
    const wildCards = lightFaces.filter((f) => f.value === 'wild');
    expect(wildCards).toHaveLength(4);
    expect(wildCards.every((f) => f.color === null && f.scoreValue === 40)).toBe(true);

    const wildDrawTwoCards = lightFaces.filter((f) => f.value === 'wild_draw_two');
    expect(wildDrawTwoCards).toHaveLength(4);
    expect(wildDrawTwoCards.every((f) => f.color === null && f.scoreValue === 50)).toBe(true);
  });

  it('contains exactly 112 Dark Side faces matching Mattel GDR44 specifications', () => {
    const darkFaces = FlipDeckFactory.generateDarkFaces();
    expect(darkFaces).toHaveLength(112);

    // Number cards: 72 (1-9, two each across 4 dark colors) - NO ZEROES
    const numberCards = darkFaces.filter((f) => f.type === 'number');
    expect(numberCards).toHaveLength(72);
    expect(darkFaces.some((f) => f.value === '0')).toBe(false);

    for (const color of FLIP_DARK_COLORS) {
      for (let n = 1; n <= 9; n++) {
        const matches = numberCards.filter((f) => f.color === color && f.value === String(n));
        expect(matches).toHaveLength(2);
        expect(matches[0].scoreValue).toBe(n);
      }
    }

    // Action cards: Draw Five (8, 20pts), Reverse (8, 20pts), Skip Everyone (8, 30pts), Flip (8, 20pts)
    const drawFiveCards = darkFaces.filter((f) => f.value === 'draw_five');
    expect(drawFiveCards).toHaveLength(8);
    expect(drawFiveCards.every((f) => f.scoreValue === 20)).toBe(true);
    for (const color of FLIP_DARK_COLORS) {
      expect(drawFiveCards.filter((f) => f.color === color)).toHaveLength(2);
    }

    const reverseCards = darkFaces.filter((f) => f.value === 'reverse');
    expect(reverseCards).toHaveLength(8);
    expect(reverseCards.every((f) => f.scoreValue === 20)).toBe(true);
    for (const color of FLIP_DARK_COLORS) {
      expect(reverseCards.filter((f) => f.color === color)).toHaveLength(2);
    }

    const skipEveryoneCards = darkFaces.filter((f) => f.value === 'skip_everyone');
    expect(skipEveryoneCards).toHaveLength(8);
    expect(skipEveryoneCards.every((f) => f.scoreValue === 30)).toBe(true);
    for (const color of FLIP_DARK_COLORS) {
      expect(skipEveryoneCards.filter((f) => f.color === color)).toHaveLength(2);
    }

    const flipCards = darkFaces.filter((f) => f.value === 'flip');
    expect(flipCards).toHaveLength(8);
    expect(flipCards.every((f) => f.scoreValue === 20)).toBe(true);
    for (const color of FLIP_DARK_COLORS) {
      expect(flipCards.filter((f) => f.color === color)).toHaveLength(2);
    }

    // Wild cards (4, 40pts) and Wild Draw Color cards (4, 60pts)
    const wildCards = darkFaces.filter((f) => f.value === 'wild');
    expect(wildCards).toHaveLength(4);
    expect(wildCards.every((f) => f.color === null && f.scoreValue === 40)).toBe(true);

    const wildDrawColorCards = darkFaces.filter((f) => f.value === 'wild_draw_color');
    expect(wildDrawColorCards).toHaveLength(4);
    expect(wildDrawColorCards.every((f) => f.color === null && f.scoreValue === 60)).toBe(true);
  });

  it('guarantees every physical card has dual faces and flips dynamically', () => {
    const deck = FlipDeckFactory.createFlipDeck();

    for (const card of deck) {
      expect(card.lightFace).toBeDefined();
      expect(card.darkFace).toBeDefined();
      expect(card.currentSide).toBe('LIGHT');
      expect(card.color).toBe(card.lightFace!.color);
      expect(card.value).toBe(card.lightFace!.value);

      // Flip card to DARK
      const flippedDark = FlipDeckFactory.flipCard(card, 'DARK');
      expect(flippedDark.id).toBe(card.id);
      expect(flippedDark.currentSide).toBe('DARK');
      expect(flippedDark.color).toBe(card.darkFace!.color);
      expect(flippedDark.value).toBe(card.darkFace!.value);
      expect(flippedDark.scoreValue).toBe(card.darkFace!.scoreValue);

      // Flip back to LIGHT
      const flippedLight = FlipDeckFactory.flipCard(flippedDark, 'LIGHT');
      expect(flippedLight.id).toBe(card.id);
      expect(flippedLight.currentSide).toBe('LIGHT');
      expect(flippedLight.color).toBe(card.lightFace!.color);
      expect(flippedLight.value).toBe(card.lightFace!.value);
    }
  });

  it('returns card untouched if it lacks dual faces', () => {
    const classicCard: Card = {
      id: 'c1',
      color: 'red',
      value: '7',
      type: 'number',
      scoreValue: 7,
    };
    const result = FlipDeckFactory.flipCard(classicCard, 'DARK');
    expect(result).toBe(classicCard);
  });
});
