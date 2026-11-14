import { Card, AllWildCardValue } from '../../cards/card.types';
import { ALL_WILD_INVENTORY_COUNTS, ALL_WILD_SCORES, UNO_ALL_WILD_RULES } from './all-wild.constants';

export class AllWildDeckFactory {
  /**
   * Constructs the authoritative 112-card UNO All Wild (Mattel HHL33) deck.
   *
   * Inventory breakdown:
   * - 54 Standard Wild cards (20 points each)
   * - 14 Wild Reverse cards (50 points each)
   * - 14 Wild Skip cards (50 points each)
   * - 10 Wild Draw Two cards (50 points each)
   * -  6 Wild Skip Two cards (50 points each)
   * -  6 Wild Draw Four cards (50 points each)
   * -  4 Wild Targeted Draw Two cards (50 points each)
   * -  4 Wild Forced Swap cards (50 points each)
   * Total = 112 cards.
   *
   * Every card has type 'wild', color null, variant 'uno_all_wild', and a stable unique ID.
   */
  static createDeck(): Card[] {
    const cards: Card[] = [];
    const variant = 'uno_all_wild';

    const cardTypes: AllWildCardValue[] = [
      'wild',
      'wild_reverse',
      'wild_skip',
      'wild_draw_two',
      'wild_skip_two',
      'wild_draw_four',
      'wild_targeted_draw_two',
      'wild_forced_swap',
    ];

    for (const cardValue of cardTypes) {
      const count = ALL_WILD_INVENTORY_COUNTS[cardValue];
      const scoreValue = ALL_WILD_SCORES[cardValue];

      for (let copy = 1; copy <= count; copy++) {
        cards.push({
          id: `all_wild_${cardValue}_copy_${copy}`,
          color: null,
          value: cardValue,
          type: 'wild',
          scoreValue,
          variant,
        });
      }
    }

    if (cards.length !== UNO_ALL_WILD_RULES.TOTAL_DECK_SIZE) {
      throw new Error(
        `AllWildDeckFactory invariant violation: expected exactly ${UNO_ALL_WILD_RULES.TOTAL_DECK_SIZE} cards, but created ${cards.length}.`
      );
    }

    return cards;
  }
}
