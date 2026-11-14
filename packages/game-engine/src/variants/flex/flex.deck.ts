import { Card, NumberCardValue } from '../../cards/card.types';
import {
  FLEX_CARD_COLORS,
  UNO_FLEX_RULES,
  classicNumberHasFlipIcon,
  getFlexActionSecondaryColor,
  getFlexNumberSecondaryColor,
} from './flex.constants';

export class FlexDeckFactory {
  /**
   * Generates the authoritative 104-card playing deck for UNO Flex (Mattel Product HNB00 / HMY99).
   * Note: The 8 double-sided Power Cards are dealt to players at game start and are tracked on
   * player state (Player.powerCardStatus).
   */
  static createDeck(): Card[] {
    const cards: Card[] = [];

    // 1. 32 Classic Number Cards (1-8 across 4 colors)
    // 16 have the flip icon, 16 do not
    for (const color of FLEX_CARD_COLORS) {
      for (let val = 1; val <= 8; val++) {
        const hasFlip = classicNumberHasFlipIcon(color, val);
        cards.push({
          id: `flex_num_classic_${color}_${val}`,
          color,
          value: String(val) as NumberCardValue,
          type: 'number',
          scoreValue: val,
          variant: 'uno_flex',
          hasFlipIcon: hasFlip,
        });
      }
    }

    // 2. 32 Flex Number Cards (1-8 across 4 colors with paired secondary flex colors)
    for (const color of FLEX_CARD_COLORS) {
      for (let val = 1; val <= 8; val++) {
        const secondary = getFlexNumberSecondaryColor(color, val);
        cards.push({
          id: `flex_num_flex_${color}_${val}`,
          color,
          flexColor: secondary,
          value: String(val) as NumberCardValue,
          type: 'number',
          scoreValue: val,
          variant: 'uno_flex',
          hasFlipIcon: false,
        });
      }
    }

    // 3. 12 Classic Action Cards (4 Draw Two, 4 Reverse, 4 Skip)
    for (const color of FLEX_CARD_COLORS) {
      // Draw Two
      cards.push({
        id: `flex_action_classic_draw_two_${color}`,
        color,
        value: 'draw_two',
        type: 'action',
        scoreValue: UNO_FLEX_RULES.SCORES.ACTION_CARD,
        variant: 'uno_flex',
      });
      // Reverse
      cards.push({
        id: `flex_action_classic_reverse_${color}`,
        color,
        value: 'reverse',
        type: 'action',
        scoreValue: UNO_FLEX_RULES.SCORES.ACTION_CARD,
        variant: 'uno_flex',
      });
      // Skip
      cards.push({
        id: `flex_action_classic_skip_${color}`,
        color,
        value: 'skip',
        type: 'action',
        scoreValue: UNO_FLEX_RULES.SCORES.ACTION_CARD,
        variant: 'uno_flex',
      });
    }

    // 4. 12 Flex Action Cards (4 Flex Draw Two, 4 Flex Reverse, 4 Flex Skip)
    for (const color of FLEX_CARD_COLORS) {
      // Flex Draw Two
      cards.push({
        id: `flex_action_flex_draw_two_${color}`,
        color,
        flexColor: getFlexActionSecondaryColor(color, 'flex_draw_two'),
        value: 'flex_draw_two',
        type: 'action',
        scoreValue: UNO_FLEX_RULES.SCORES.ACTION_CARD,
        variant: 'uno_flex',
      });
      // Flex Reverse
      cards.push({
        id: `flex_action_flex_reverse_${color}`,
        color,
        flexColor: getFlexActionSecondaryColor(color, 'flex_reverse'),
        value: 'flex_reverse',
        type: 'action',
        scoreValue: UNO_FLEX_RULES.SCORES.ACTION_CARD,
        variant: 'uno_flex',
      });
      // Flex Skip
      cards.push({
        id: `flex_action_flex_skip_${color}`,
        color,
        flexColor: getFlexActionSecondaryColor(color, 'flex_skip'),
        value: 'flex_skip',
        type: 'action',
        scoreValue: UNO_FLEX_RULES.SCORES.ACTION_CARD,
        variant: 'uno_flex',
      });
    }

    // 5. 16 Wild Cards
    // 6 Wild All Flip
    for (let i = 1; i <= 6; i++) {
      cards.push({
        id: `flex_wild_all_flip_${i}`,
        color: null,
        value: 'wild_all_flip',
        type: 'wild',
        scoreValue: UNO_FLEX_RULES.SCORES.WILD_CARD,
        variant: 'uno_flex',
      });
    }

    // 2 Flex Wild Draw Four
    for (let i = 1; i <= 2; i++) {
      cards.push({
        id: `flex_wild_draw_four_${i}`,
        color: null,
        value: 'flex_wild_draw_four',
        type: 'wild',
        scoreValue: UNO_FLEX_RULES.SCORES.WILD_CARD,
        variant: 'uno_flex',
      });
    }

    // 4 Flex Wild Target Draw Two
    for (let i = 1; i <= 4; i++) {
      cards.push({
        id: `flex_wild_target_draw_two_${i}`,
        color: null,
        value: 'flex_wild_target_draw_two',
        type: 'wild',
        scoreValue: UNO_FLEX_RULES.SCORES.WILD_CARD,
        variant: 'uno_flex',
      });
    }

    // 4 Flex Wild All Draw
    for (let i = 1; i <= 4; i++) {
      cards.push({
        id: `flex_wild_all_draw_${i}`,
        color: null,
        value: 'flex_wild_all_draw',
        type: 'wild',
        scoreValue: UNO_FLEX_RULES.SCORES.WILD_CARD,
        variant: 'uno_flex',
      });
    }

    if (cards.length !== UNO_FLEX_RULES.PLAYING_CARDS) {
      throw new Error(
        `FlexDeckFactory invariant failure: generated ${cards.length} cards, expected ${UNO_FLEX_RULES.PLAYING_CARDS}`
      );
    }

    return cards;
  }
}
