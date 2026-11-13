import { Card, CardColor } from '../cards/card.types';

export class HandManager {
  /**
   * Deals initial hands to all players.
   * Default hand size is 7 cards per official Mattel rules.
   */
  static dealInitialHands(
    deck: readonly Card[],
    playerIds: readonly string[],
    cardsPerHand = 7
  ): { hands: Map<string, Card[]>; remainingDeck: Card[] } {
    const remainingDeck = [...deck];
    const hands = new Map<string, Card[]>();

    for (const id of playerIds) {
      hands.set(id, []);
    }

    for (let round = 0; round < cardsPerHand; round++) {
      for (const id of playerIds) {
        const card = remainingDeck.pop();
        if (!card) {
          throw new Error('Not enough cards in deck to complete initial dealing.');
        }
        hands.get(id)!.push(card);
      }
    }

    return { hands, remainingDeck };
  }

  /**
   * Adds a card to a player's hand.
   */
  static addCard(hand: readonly Card[], card: Card): Card[] {
    return [...hand, card];
  }

  /**
   * Removes a card from a player's hand by ID.
   * Throws if the card is not present in the hand.
   */
  static removeCard(hand: readonly Card[], cardId: string): { updatedHand: Card[]; removedCard: Card } {
    const index = hand.findIndex((c) => c.id === cardId);
    if (index === -1) {
      throw new Error(`Card with ID ${cardId} is not in hand.`);
    }

    const removedCard = hand[index];
    const updatedHand = [...hand.slice(0, index), ...hand.slice(index + 1)];
    return { updatedHand, removedCard };
  }

  /**
   * Checks whether a card exists in a hand.
   */
  static hasCard(hand: readonly Card[], cardId: string): boolean {
    return hand.some((c) => c.id === cardId);
  }

  /**
   * Finds a card in a hand by ID.
   */
  static findCard(hand: readonly Card[], cardId: string): Card | undefined {
    return hand.find((c) => c.id === cardId);
  }

  /**
   * Checks whether a player holds any card matching a specific color.
   * Crucial for Wild Draw Four challenge legality:
   * Per official Mattel rules, a Wild Draw Four is only legal if the player holds
   * NO cards matching the active color of the discard pile.
   */
  static hasMatchingColor(hand: readonly Card[], activeColor: CardColor): boolean {
    return hand.some((c) => c.color === activeColor);
  }

  /**
   * Checks whether the player has exactly one card remaining.
   */
  static hasOneCard(hand: readonly Card[]): boolean {
    return hand.length === 1;
  }

  /**
   * Checks whether the player has emptied their hand (round winner).
   */
  static isHandEmpty(hand: readonly Card[]): boolean {
    return hand.length === 0;
  }

  /**
   * Calculates the total score value of all cards remaining in hands.
   */
  static calculateHandScore(hand: readonly Card[]): number {
    return hand.reduce((total, card) => total + card.scoreValue, 0);
  }
}
