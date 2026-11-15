import { describe, it, expect } from 'vitest';
import { AttackDeckFactory } from '../src/variants/attack/attack.deck';
import { UNO_ATTACK_RULES, ATTACK_SCORING } from '../src/variants/attack/attack.constants';

describe('UNO Attack Deck Factory (Mattel Product GTX66)', () => {
  const deck = AttackDeckFactory.createDeck();
  const colors = ['red', 'yellow', 'green', 'blue'] as const;

  it('generates exactly 112 cards', () => {
    expect(deck.length).toBe(UNO_ATTACK_RULES.TOTAL_DECK_SIZE);
    expect(deck.length).toBe(112);
  });

  it('ensures all cards have variant "uno_attack"', () => {
    expect(deck.every((c) => c.variant === 'uno_attack')).toBe(true);
  });

  it('ensures all card IDs are unique', () => {
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(112);
  });

  it('generates exactly 72 number cards (18 per color: 2x 1-9, NO zeros)', () => {
    const numberCards = deck.filter((c) => c.type === 'number');
    expect(numberCards.length).toBe(72);

    // Verify no 0 cards exist in UNO Attack
    expect(numberCards.some((c) => c.value === '0')).toBe(false);

    for (const color of colors) {
      const colorNumbers = numberCards.filter((c) => c.color === color);
      expect(colorNumbers.length).toBe(18);

      for (let n = 1; n <= 9; n++) {
        const cardsOfN = colorNumbers.filter((c) => c.value === String(n));
        expect(cardsOfN.length).toBe(2);
        expect(cardsOfN[0].scoreValue).toBe(n);
        expect(cardsOfN[1].scoreValue).toBe(n);
      }
    }
  });

  it('generates exactly 28 colored action cards (8 Hit 2, 4 Reverse, 8 Skip, 8 Discard All)', () => {
    const actionCards = deck.filter((c) => c.type === 'action');
    expect(actionCards.length).toBe(28);

    for (const color of colors) {
      const hitTwos = actionCards.filter((c) => c.color === color && c.value === 'hit_2');
      const reverses = actionCards.filter((c) => c.color === color && c.value === 'reverse');
      const skips = actionCards.filter((c) => c.color === color && c.value === 'skip');
      const discardAlls = actionCards.filter((c) => c.color === color && c.value === 'discard_all');

      expect(hitTwos.length).toBe(2);
      expect(reverses.length).toBe(1); // Exactly 1 reverse per color in GTX66!
      expect(skips.length).toBe(2);
      expect(discardAlls.length).toBe(2);

      expect(hitTwos[0].scoreValue).toBe(ATTACK_SCORING.HIT_2); // 20
      expect(reverses[0].scoreValue).toBe(ATTACK_SCORING.REVERSE); // 20
      expect(skips[0].scoreValue).toBe(ATTACK_SCORING.SKIP); // 20
      expect(discardAlls[0].scoreValue).toBe(ATTACK_SCORING.DISCARD_ALL); // 30
    }
  });

  it('generates exactly 12 Wild cards (4 Wild, 4 Wild Attack-Attack, 3 Wild Customizable, 1 Wild Hit 4)', () => {
    const wildCards = deck.filter((c) => c.type === 'wild');
    expect(wildCards.length).toBe(12);

    const standardWilds = wildCards.filter((c) => c.value === 'wild');
    const attackWilds = wildCards.filter((c) => c.value === 'wild_attack_attack');
    const customWilds = wildCards.filter((c) => c.value === 'wild_customizable');
    const hitFourWilds = wildCards.filter((c) => c.value === 'wild_hit_4');

    expect(standardWilds.length).toBe(4);
    expect(attackWilds.length).toBe(4);
    expect(customWilds.length).toBe(3);
    expect(hitFourWilds.length).toBe(1);

    expect(standardWilds.every((c) => c.scoreValue === ATTACK_SCORING.WILD && c.color === null)).toBe(true); // 50
    expect(attackWilds.every((c) => c.scoreValue === ATTACK_SCORING.WILD_ATTACK_ATTACK && c.color === null)).toBe(true); // 50
    expect(customWilds.every((c) => c.scoreValue === ATTACK_SCORING.WILD_CUSTOMIZABLE && c.color === null)).toBe(true); // 50
    expect(hitFourWilds.every((c) => c.scoreValue === ATTACK_SCORING.WILD_HIT_4 && c.color === null)).toBe(true); // 40
  });
});
