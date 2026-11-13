import { Card, CARD_COLORS, NUMBER_VALUES, ACTION_VALUES, WILD_VALUES } from '../cards/card.types';
import { CardFactory } from '../cards/card.factory';

export class DeckFactory {
  /**
   * Generates the canonical 108-card Classic Mattel UNO gameplay deck.
   *
   * Note on Physical Components vs Gameplay Deck:
   * The official Mattel 42001 instruction sheet lists 112 physical cards in the box,
   * which includes 4 Blank Cards described as replacement cards or cards for custom rules.
   * This digital implementation intentionally uses the standard 108 non-blank gameplay
   * cards, excluding the 4 optional Blank Cards to maintain official rules without house rules.
   *
   * 108-Card Gameplay Composition:
   * - 4 Number 0 cards (1 per color: Red, Yellow, Green, Blue) = 4
   * - 72 Number 1-9 cards (2 of each number 1-9 per color) = 72
   * - 8 Skip cards (2 per color) = 8
   * - 8 Reverse cards (2 per color) = 8
   * - 8 Draw Two (+2) cards (2 per color) = 8
   * - 4 Wild cards = 4
   * - 4 Wild Draw Four (+4) cards = 4
   * -------------------------------------------------------------
   * TOTAL: 108 playable cards
   */
  static createClassicDeck(variant = 'classic'): Card[] {
    const deck: Card[] = [];

    // 1. Colored Number Cards (76 cards)
    for (const color of CARD_COLORS) {
      // One '0' per color
      deck.push(CardFactory.createNumberCard(color, '0', 1, variant));

      // Two '1' through '9' per color
      for (const num of NUMBER_VALUES) {
        if (num === '0') continue;
        deck.push(CardFactory.createNumberCard(color, num, 1, variant));
        deck.push(CardFactory.createNumberCard(color, num, 2, variant));
      }
    }

    // 2. Colored Action Cards (24 cards: 2 Skip, 2 Reverse, 2 Draw Two per color)
    for (const color of CARD_COLORS) {
      for (const action of ACTION_VALUES) {
        deck.push(CardFactory.createActionCard(color, action, 1, variant));
        deck.push(CardFactory.createActionCard(color, action, 2, variant));
      }
    }

    // 3. Wild Cards (8 cards: 4 Wild, 4 Wild Draw Four)
    for (const wild of WILD_VALUES) {
      for (let i = 1; i <= 4; i++) {
        deck.push(CardFactory.createWildCard(wild, i, variant));
      }
    }

    return deck;
  }
}
