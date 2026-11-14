import { Card, NumberCardValue } from '../../cards/card.types';
import { NO_MERCY_COLORS, UNO_NO_MERCY_RULES } from './no-mercy.constants';

export class NoMercyDeckFactory {
  /**
   * Generates the authoritative 168-card inventory for UNO Show 'em No Mercy (HWV18).
   *
   * Inventory breakdown (168 total cards):
   * 1. Number Cards (80 cards):
   *    - Numbers 0 through 9 in 4 colors (Red, Yellow, Green, Blue)
   *    - 2 of each number per color (10 numbers x 2 copies x 4 colors = 80 cards)
   *    - Score value: Face value (0-9)
   *
   * 2. Colored Action Cards (64 cards):
   *    - Skip: 3 of each color x 4 colors = 12 cards (Score: 20)
   *    - Reverse: 3 of each color x 4 colors = 12 cards (Score: 20)
   *    - Draw Two (+2): 3 of each color x 4 colors = 12 cards (Score: 20)
   *    - Draw Four (+4): 2 of each color x 4 colors = 8 cards (Score: 20)
   *    - Discard All: 3 of each color x 4 colors = 12 cards (Score: 20)
   *    - Skip Everyone: 2 of each color x 4 colors = 8 cards (Score: 20)
   *
   * 3. Wild Action Cards (24 cards):
   *    - Wild Reverse Draw 4: 8 cards (Score: 50)
   *    - Wild Color Roulette: 8 cards (Score: 50)
   *    - Wild Draw 6: 4 cards (Score: 50)
   *    - Wild Draw 10: 4 cards (Score: 50)
   *
   * Grand Total = 80 + 64 + 24 = 168 cards.
   */
  static createDeck(): Card[] {
    const cards: Card[] = [];
    const variant = 'uno_show_em_no_mercy';

    // 1. Number Cards (0-9, 2 copies each per color = 80 cards)
    for (const color of NO_MERCY_COLORS) {
      for (let num = 0; num <= 9; num++) {
        const valStr = num.toString() as NumberCardValue;
        for (let copy = 1; copy <= 2; copy++) {
          cards.push({
            id: `nm_${color}_${valStr}_copy_${copy}`,
            color,
            value: valStr,
            type: 'number',
            scoreValue: num,
            variant,
          });
        }
      }
    }

    // 2. Colored Action Cards (64 cards)
    const coloredActions: Array<{
      value: 'skip' | 'reverse' | 'draw_two' | 'draw_four' | 'discard_all' | 'skip_everyone';
      copiesPerColor: number;
    }> = [
      { value: 'skip', copiesPerColor: 3 },
      { value: 'reverse', copiesPerColor: 3 },
      { value: 'draw_two', copiesPerColor: 3 },
      { value: 'draw_four', copiesPerColor: 2 },
      { value: 'discard_all', copiesPerColor: 3 },
      { value: 'skip_everyone', copiesPerColor: 2 },
    ];

    for (const color of NO_MERCY_COLORS) {
      for (const action of coloredActions) {
        for (let copy = 1; copy <= action.copiesPerColor; copy++) {
          cards.push({
            id: `nm_${color}_${action.value}_copy_${copy}`,
            color,
            value: action.value,
            type: 'action',
            scoreValue: UNO_NO_MERCY_RULES.COLORED_ACTION_POINTS,
            variant,
          });
        }
      }
    }

    // 3. Wild Action Cards (24 cards)
    const wildActions: Array<{
      value: 'wild_reverse_draw_four' | 'wild_color_roulette' | 'wild_draw_six' | 'wild_draw_ten';
      count: number;
    }> = [
      { value: 'wild_reverse_draw_four', count: 8 },
      { value: 'wild_color_roulette', count: 8 },
      { value: 'wild_draw_six', count: 4 },
      { value: 'wild_draw_ten', count: 4 },
    ];

    for (const wild of wildActions) {
      for (let i = 1; i <= wild.count; i++) {
        cards.push({
          id: `nm_${wild.value}_copy_${i}`,
          color: null,
          value: wild.value,
          type: 'wild',
          scoreValue: UNO_NO_MERCY_RULES.WILD_ACTION_POINTS,
          variant,
        });
      }
    }

    if (cards.length !== UNO_NO_MERCY_RULES.DECK_SIZE) {
      throw new Error(
        `No Mercy deck creation invariant violation: expected ${UNO_NO_MERCY_RULES.DECK_SIZE} cards, got ${cards.length}`
      );
    }

    return cards;
  }
}
