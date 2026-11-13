import { UnoVariant, VariantRegistry } from '../variant.types';
import { DeckFactory } from '../../deck/deck.factory';
import { HandManager } from '../../players/hand.manager';

export const classicUnoVariant: UnoVariant = {
  id: 'classic',
  name: 'Classic UNO',
  description: 'Official Mattel Classic UNO rules with a 108-card deck.',
  minPlayers: 2,
  maxPlayers: 10,
  cardsPerHand: 7,
  createDeck: () => DeckFactory.createClassicDeck('classic'),
  calculateScore: (loserHands) =>
    loserHands.reduce((acc, hand) => acc + HandManager.calculateHandScore(hand), 0),
};

// Register classic as default variant
VariantRegistry.register(classicUnoVariant);
