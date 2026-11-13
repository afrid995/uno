import { Card } from '../cards/card.types';
import { RandomNumberGenerator, shuffleDeck } from './deck.shuffle';

export interface DrawResult {
  readonly drawnCards: Card[];
  readonly newDrawPile: Card[];
  readonly newDiscardPile: Card[];
  readonly wasReshuffled: boolean;
}

export class DeckManager {
  /**
   * Draws a specified count of cards from the draw pile.
   * If the draw pile does not have enough cards, reshuffles the discard pile
   * (excluding the current top discard card) to replenish the draw pile.
   */
  static drawCards(
    drawPile: readonly Card[],
    discardPile: readonly Card[],
    count: number,
    rng?: RandomNumberGenerator
  ): DrawResult {
    if (count <= 0) {
      return {
        drawnCards: [],
        newDrawPile: [...drawPile],
        newDiscardPile: [...discardPile],
        wasReshuffled: false,
      };
    }

    let currentDraw = [...drawPile];
    let currentDiscard = [...discardPile];
    const drawn: Card[] = [];
    let wasReshuffled = false;

    for (let i = 0; i < count; i++) {
      if (currentDraw.length === 0) {
        // Can only reshuffle if discard pile has more than the top card
        if (currentDiscard.length > 1) {
          const topDiscard = currentDiscard[currentDiscard.length - 1];
          const cardsToReshuffle = currentDiscard.slice(0, currentDiscard.length - 1);
          currentDraw = shuffleDeck(cardsToReshuffle, rng);
          currentDiscard = [topDiscard];
          wasReshuffled = true;
        } else {
          // No more cards available anywhere
          break;
        }
      }

      const card = currentDraw.pop();
      if (card) {
        drawn.push(card);
      }
    }

    return {
      drawnCards: drawn,
      newDrawPile: currentDraw,
      newDiscardPile: currentDiscard,
      wasReshuffled,
    };
  }

  /**
   * Pushes a played card onto the discard pile.
   */
  static discardCard(discardPile: readonly Card[], card: Card): Card[] {
    return [...discardPile, card];
  }

  /**
   * Asserts that card conservation holds: every card across all provided locations
   * has a unique ID and matches the expected total deck count.
   */
  static assertDeckConservation(
    drawPile: readonly Card[],
    discardPile: readonly Card[],
    playerHands: readonly (readonly Card[])[],
    expectedTotal = 108
  ): boolean {
    const allCards: Card[] = [
      ...drawPile,
      ...discardPile,
      ...playerHands.flat(),
    ];

    if (allCards.length !== expectedTotal) {
      return false;
    }

    const seenIds = new Set<string>();
    for (const card of allCards) {
      if (seenIds.has(card.id)) {
        return false;
      }
      seenIds.add(card.id);
    }

    return true;
  }
}
