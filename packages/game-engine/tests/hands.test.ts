import { describe, it, expect } from 'vitest';
import { HandManager } from '../src/players/hand.manager';
import { DeckFactory } from '../src/deck/deck.factory';
import { CardFactory } from '../src/cards/card.factory';

describe('Player Hand Management Verification', () => {
  it('deals exactly 7 cards to each player and removes them from the deck', () => {
    const deck = DeckFactory.createClassicDeck();
    const playerIds = ['p1', 'p2', 'p3', 'p4'];
    const { hands, remainingDeck } = HandManager.dealInitialHands(deck, playerIds, 7);

    expect(hands.size).toBe(4);
    for (const id of playerIds) {
      expect(hands.get(id)).toHaveLength(7);
    }
    // 108 - (4 * 7) = 108 - 28 = 80 remaining
    expect(remainingDeck).toHaveLength(80);
  });

  it('adds and removes cards from player hand correctly', () => {
    const card1 = CardFactory.createNumberCard('red', '5', 1);
    const card2 = CardFactory.createActionCard('blue', 'skip', 1);

    let hand = [card1];
    hand = HandManager.addCard(hand, card2);
    expect(hand).toHaveLength(2);
    expect(HandManager.hasCard(hand, card2.id)).toBe(true);

    const { updatedHand, removedCard } = HandManager.removeCard(hand, card1.id);
    expect(updatedHand).toHaveLength(1);
    expect(removedCard).toEqual(card1);
    expect(HandManager.hasCard(updatedHand, card1.id)).toBe(false);
  });

  it('throws error when attempting to remove card not in hand', () => {
    const card1 = CardFactory.createNumberCard('red', '5', 1);
    expect(() => HandManager.removeCard([card1], 'non_existent_card')).toThrow();
  });

  it('accurately identifies single card remaining and empty hand', () => {
    const card1 = CardFactory.createNumberCard('red', '5', 1);
    const card2 = CardFactory.createNumberCard('blue', '7', 1);

    expect(HandManager.hasOneCard([card1, card2])).toBe(false);
    expect(HandManager.isHandEmpty([card1, card2])).toBe(false);

    expect(HandManager.hasOneCard([card1])).toBe(true);
    expect(HandManager.isHandEmpty([card1])).toBe(false);

    expect(HandManager.hasOneCard([])).toBe(false);
    expect(HandManager.isHandEmpty([])).toBe(true);
  });

  it('accurately detects whether player holds matching active color (for +4 legality)', () => {
    const redCard = CardFactory.createNumberCard('red', '3', 1);
    const blueCard = CardFactory.createActionCard('blue', 'skip', 1);
    const wildCard = CardFactory.createWildCard('wild', 1);

    const hand = [redCard, blueCard, wildCard];

    expect(HandManager.hasMatchingColor(hand, 'red')).toBe(true);
    expect(HandManager.hasMatchingColor(hand, 'blue')).toBe(true);
    expect(HandManager.hasMatchingColor(hand, 'green')).toBe(false);
    expect(HandManager.hasMatchingColor(hand, 'yellow')).toBe(false);
  });

  it('calculates official Mattel hand score correctly', () => {
    // Numbers: 0-9 face value
    const c0 = CardFactory.createNumberCard('red', '0', 1); // 0 pts
    const c7 = CardFactory.createNumberCard('green', '7', 1); // 7 pts
    // Actions: 20 pts each
    const cSkip = CardFactory.createActionCard('blue', 'skip', 1); // 20 pts
    const cDrawTwo = CardFactory.createActionCard('yellow', 'draw_two', 1); // 20 pts
    // Wilds: 50 pts each
    const cWild = CardFactory.createWildCard('wild', 1); // 50 pts
    const cWildFour = CardFactory.createWildCard('wild_draw_four', 1); // 50 pts

    const hand = [c0, c7, cSkip, cDrawTwo, cWild, cWildFour];
    // Expected total: 0 + 7 + 20 + 20 + 50 + 50 = 147 points
    expect(HandManager.calculateHandScore(hand)).toBe(147);
  });
});
