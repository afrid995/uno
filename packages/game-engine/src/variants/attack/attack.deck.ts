import { Card, ClassicCardColor } from '../../cards/card.types';
import { ATTACK_SCORING, UNO_ATTACK_RULES } from './attack.constants';

const COLORS: readonly ClassicCardColor[] = ['red', 'yellow', 'green', 'blue'];

/**
 * Factory for creating the official Mattel UNO Attack (Product GTX66) deck.
 *
 * NOTE: Official GTX66 rules state:
 * "Before the game begins, decide how many of these cards to include. You may use only 1 or all 3, it's up to you."
 * Default is 3 cards (112-card deck). 1 or 2 may also be selected (110 or 111 cards).
 */
export class AttackDeckFactory {
  static createDeck(
    customizableCount: number = UNO_ATTACK_RULES.DEFAULT_CUSTOMIZABLE_CARDS_COUNT
  ): Card[] {
    const validCustomizableCount = Math.max(
      UNO_ATTACK_RULES.MIN_CUSTOMIZABLE_CARDS_COUNT,
      Math.min(UNO_ATTACK_RULES.MAX_CUSTOMIZABLE_CARDS_COUNT, Math.floor(customizableCount))
    );
    const deck: Card[] = [];

    // 1. Number Cards (1 to 9, two of each per color = 18 per color * 4 = 72 cards)
    // Note: UNO Attack has NO 0 number cards!
    for (const color of COLORS) {
      for (let num = 1; num <= 9; num++) {
        for (let copy = 0; copy < 2; copy++) {
          const valueStr = String(num) as Card['value'];
          deck.push({
            id: `attack_${color}_${num}_${copy}`,
            color,
            value: valueStr,
            type: 'number',
            scoreValue: ATTACK_SCORING.NUMBER_CARD_FACE_VALUE(valueStr),
            variant: 'uno_attack',
          });
        }
      }
    }

    // 2. Colored Action Cards
    for (const color of COLORS) {
      // 8 Hit 2 cards: 2 each in blue, green, red, yellow (20 pts)
      for (let copy = 0; copy < 2; copy++) {
        deck.push({
          id: `attack_${color}_hit_2_${copy}`,
          color,
          value: 'hit_2',
          type: 'action',
          scoreValue: ATTACK_SCORING.HIT_2,
          variant: 'uno_attack',
        });
      }

      // 4 Reverse cards: 1 each in blue, green, red, yellow (20 pts)
      deck.push({
        id: `attack_${color}_reverse_0`,
        color,
        value: 'reverse',
        type: 'action',
        scoreValue: ATTACK_SCORING.REVERSE,
        variant: 'uno_attack',
      });

      // 8 Skip cards: 2 each in blue, green, red, yellow (20 pts)
      for (let copy = 0; copy < 2; copy++) {
        deck.push({
          id: `attack_${color}_skip_${copy}`,
          color,
          value: 'skip',
          type: 'action',
          scoreValue: ATTACK_SCORING.SKIP,
          variant: 'uno_attack',
        });
      }

      // 8 Discard All cards: 2 each in blue, green, red, yellow (30 pts)
      for (let copy = 0; copy < 2; copy++) {
        deck.push({
          id: `attack_${color}_discard_all_${copy}`,
          color,
          value: 'discard_all',
          type: 'action',
          scoreValue: ATTACK_SCORING.DISCARD_ALL,
          variant: 'uno_attack',
        });
      }
    }

    // 3. Wild Cards (12 cards total)
    // 4 Wild cards (50 pts)
    for (let i = 0; i < 4; i++) {
      deck.push({
        id: `attack_wild_${i}`,
        color: null,
        value: 'wild',
        type: 'wild',
        scoreValue: ATTACK_SCORING.WILD,
        variant: 'uno_attack',
      });
    }

    // 4 Wild Attack-Attack cards (50 pts)
    for (let i = 0; i < 4; i++) {
      deck.push({
        id: `attack_wild_attack_attack_${i}`,
        color: null,
        value: 'wild_attack_attack',
        type: 'wild',
        scoreValue: ATTACK_SCORING.WILD_ATTACK_ATTACK,
        variant: 'uno_attack',
      });
    }

    // Wild Customizable cards (50 pts, between 1 and 3 per GTX66 rules)
    for (let i = 0; i < validCustomizableCount; i++) {
      deck.push({
        id: `attack_wild_customizable_${i}`,
        color: null,
        value: 'wild_customizable',
        type: 'wild',
        scoreValue: ATTACK_SCORING.WILD_CUSTOMIZABLE,
        variant: 'uno_attack',
      });
    }

    // 1 Wild Hit 4 card (40 pts)
    deck.push({
      id: `attack_wild_hit_4_0`,
      color: null,
      value: 'wild_hit_4',
      type: 'wild',
      scoreValue: ATTACK_SCORING.WILD_HIT_4,
      variant: 'uno_attack',
    });

    const expectedTotal = UNO_ATTACK_RULES.BASE_CARDS_COUNT + validCustomizableCount;
    if (deck.length !== expectedTotal) {
      throw new Error(
        `Invalid UNO Attack deck size generated: ${deck.length}. Expected exactly ${expectedTotal}.`
      );
    }

    return deck;
  }
}
