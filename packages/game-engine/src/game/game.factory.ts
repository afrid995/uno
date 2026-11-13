import { Card, CardColor } from '../cards/card.types';
import { GameConfig, GameState } from './game.types';
import { Player } from '../players/player.types';
import { DeckFactory } from '../deck/deck.factory';
import { DeckManager } from '../deck/deck.manager';
import { HandManager } from '../players/hand.manager';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../deck/deck.shuffle';
import { TurnDirection } from '../turns/turn.direction';
import { TurnManager } from '../turns/turn.manager';

export class GameFactory {
  /**
   * Initializes a new GameState from a game configuration.
   * Follows official Mattel setup rules for deck composition, dealing,
   * and starting discard card behavior.
   */
  static createGame(config: GameConfig, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
    const minPlayers = 2;
    const maxPlayers = 10;
    const playerCount = config.players.length;

    if (playerCount < minPlayers || playerCount > maxPlayers) {
      throw new Error(`Invalid player count ${playerCount}. UNO supports between ${minPlayers} and ${maxPlayers} players.`);
    }

    const variant = config.variant ?? 'classic';
    const cardsPerHand = config.cardsPerHand ?? 7;

    // 1. Build and shuffle canonical 108-card deck
    let deck = DeckFactory.createClassicDeck(variant);
    deck = shuffleDeck(deck, rng);

    // 2. Deal 7 cards to each player
    const playerIds = config.players.map((p) => p.id);
    const { hands, remainingDeck } = HandManager.dealInitialHands(deck, playerIds, cardsPerHand);

    let drawPile = [...remainingDeck];
    let topDiscard: Card | undefined;

    // 3. Flip starting card per official Mattel rules:
    // If Wild Draw Four is turned up, return it to the deck, reshuffle, and turn over the next card.
    while (!topDiscard || topDiscard.value === 'wild_draw_four') {
      if (topDiscard && topDiscard.value === 'wild_draw_four') {
        // Return to deck and reshuffle
        drawPile = shuffleDeck([...drawPile, topDiscard], rng);
      }
      topDiscard = drawPile.pop();
      if (!topDiscard) {
        throw new Error('Not enough cards in deck to establish discard pile.');
      }
    }

    const discardPile: Card[] = [topDiscard];

    // Determine initial active color and turn progression based on starting card
    let activeColor: CardColor = topDiscard.color ?? 'red';
    let turnDirection: TurnDirection = 'clockwise';
    let currentPlayerIndex = 0;

    const initialPlayers: Player[] = config.players.map((p) => ({
      id: p.id,
      username: p.username,
      hand: hands.get(p.id)!,
      hasDeclaredUno: false,
      hasDrawnThisTurn: false,
      drawnCardId: null,
      score: 0,
    }));

    // Apply starting card effects per Mattel instructions
    if (topDiscard.value === 'wild') {
      // First player chooses color - defaults to first color until chosen
      activeColor = 'red';
    } else if (topDiscard.value === 'draw_two') {
      // First player draws 2 cards and skips turn
      const firstPlayer = initialPlayers[0];
      const drawResult = DeckManager.drawCards(drawPile, discardPile, 2, rng);
      drawPile = drawResult.newDrawPile;
      initialPlayers[0] = {
        ...firstPlayer,
        hand: [...firstPlayer.hand, ...drawResult.drawnCards],
      };
      // Next player starts
      currentPlayerIndex = TurnManager.getNextPlayerIndex(0, playerCount, turnDirection, 1);
    } else if (topDiscard.value === 'reverse') {
      // Play direction begins counter-clockwise
      turnDirection = 'counter_clockwise';
      if (playerCount === 2) {
        // In 2-player UNO, Reverse acts as a skip, so player 0 plays first
        currentPlayerIndex = 0;
      } else {
        // With 3+ players, dealer plays or first player rotation goes counter-clockwise
        currentPlayerIndex = 0;
      }
    } else if (topDiscard.value === 'skip') {
      // First player is skipped, next player starts
      currentPlayerIndex = TurnManager.getNextPlayerIndex(0, playerCount, turnDirection, 1);
    }

    const timestamp = new Date().toISOString();
    const matchId = config.matchId ?? `match_${Date.now()}`;

    return {
      id: matchId,
      roomId: config.roomId,
      variant,
      status: 'IN_PROGRESS',
      players: initialPlayers,
      playerOrder: playerIds,
      currentPlayerIndex,
      turnDirection,
      drawPile,
      discardPile,
      topDiscardCard: topDiscard,
      activeColor,
      turnNumber: 1,
      sequenceNumber: 0,
      pendingActionState: null,
      winner: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }
}
