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
   * Official Mattel 42001 dealer determination:
   * Players draw cards. Highest point value becomes dealer. Action/Wild cards count as 0.
   */
  static determineDealer(playerCount: number, rng: RandomNumberGenerator = defaultCryptoRng): number {
    const cardValues: number[] = [];
    for (let i = 0; i < playerCount; i++) {
      // Draw simulated value from 108-card distribution (numbers 0-9 face value, actions/wilds = 0)
      const roll = Math.floor(rng() * 108);
      // Roughly 76/108 cards are numbers (0-9)
      const cardVal = roll < 76 ? Math.floor(rng() * 10) : 0;
      cardValues.push(cardVal);
    }

    let highest = -1;
    let highestIndices: number[] = [];
    for (let i = 0; i < playerCount; i++) {
      if (cardValues[i] > highest) {
        highest = cardValues[i];
        highestIndices = [i];
      } else if (cardValues[i] === highest) {
        highestIndices.push(i);
      }
    }

    if (highestIndices.length === 1) {
      return highestIndices[0];
    }
    // Tie-breaker
    const tiePick = Math.floor(rng() * highestIndices.length);
    return highestIndices[tiePick];
  }

  /**
   * Initializes a new GameState from a game configuration.
   * Strictly follows official Mattel 42001 setup rules.
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
    const targetScore = config.targetScore ?? 500;

    // 1. Build and shuffle canonical 108-card deck
    let deck = DeckFactory.createClassicDeck(variant);
    deck = shuffleDeck(deck, rng);

    // 2. Determine dealer (official Mattel 42001 rule)
    const dealerIndex = config.dealerIndex !== undefined
      ? config.dealerIndex
      : this.determineDealer(playerCount, rng);

    // 3. Deal 7 cards to each player
    const playerIds = config.players.map((p) => p.id);
    const { hands, remainingDeck } = HandManager.dealInitialHands(deck, playerIds, cardsPerHand);

    let drawPile = [...remainingDeck];
    let topDiscard: Card | undefined;

    // 4. Flip starting card per official Mattel 42001 rules:
    // If Wild or Wild Draw Four is turned up, return it to the deck, reshuffle, and turn over the next card.
    while (!topDiscard || topDiscard.type === 'wild') {
      if (topDiscard && topDiscard.type === 'wild') {
        drawPile = shuffleDeck([...drawPile, topDiscard], rng);
      }
      topDiscard = drawPile.pop();
      if (!topDiscard) {
        throw new Error('Not enough cards in deck to establish discard pile.');
      }
    }

    const discardPile: Card[] = [topDiscard];

    // Play begins to the left of the dealer
    const startingPlayerIndex = (dealerIndex + 1) % playerCount;

    const activeColor: CardColor = topDiscard.color ?? 'red';
    let turnDirection: TurnDirection = 'clockwise';
    let currentPlayerIndex = startingPlayerIndex;

    const initialPlayers: Player[] = config.players.map((p) => ({
      id: p.id,
      username: p.username,
      hand: hands.get(p.id)!,
      hasDeclaredUno: false,
      hasDrawnThisTurn: false,
      drawnCardId: null,
      score: 0,
    }));

    // Apply starting card effects per Mattel 42001 instructions
    if (topDiscard.value === 'draw_two') {
      // Person to the left of the dealer draws two cards and is skipped
      const targetPlayer = initialPlayers[startingPlayerIndex];
      const drawResult = DeckManager.drawCards(drawPile, discardPile, 2, rng);
      drawPile = drawResult.newDrawPile;
      initialPlayers[startingPlayerIndex] = {
        ...targetPlayer,
        hand: [...targetPlayer.hand, ...drawResult.drawnCards],
      };
      // Next player starts
      currentPlayerIndex = TurnManager.getNextPlayerIndex(startingPlayerIndex, playerCount, turnDirection, 1);
    } else if (topDiscard.value === 'reverse') {
      // Play direction begins counter-clockwise
      turnDirection = 'counter_clockwise';
      if (playerCount === 2) {
        // In 2-player UNO, Reverse acts as a skip, so starting player plays first
        currentPlayerIndex = startingPlayerIndex;
      } else {
        // Play goes to the right (dealer plays first)
        currentPlayerIndex = dealerIndex;
      }
    } else if (topDiscard.value === 'skip') {
      // Person to the left of the dealer is skipped; player to their left begins
      currentPlayerIndex = TurnManager.getNextPlayerIndex(startingPlayerIndex, playerCount, turnDirection, 1);
    }

    const timestamp = new Date().toISOString();
    const matchId = config.matchId ?? `match_${Date.now()}`;

    return {
      id: matchId,
      roomId: config.roomId,
      variant,
      status: 'IN_PROGRESS',
      roundNumber: 1,
      dealerIndex,
      targetScore,
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
      unoVulnerablePlayerId: null,
      pendingActionState: null,
      inspectionHand: null,
      roundWinner: null,
      winner: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  /**
   * Initializes the next round for a multi-round match.
   * Preserves cumulative scores and players, rotates the dealer,
   * deals fresh 7-card hands, and flips a new starting card.
   */
  static startNextRound(state: GameState, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
    if (state.status !== 'ROUND_OVER') {
      throw new Error(`Cannot start next round when game status is ${state.status}`);
    }

    const playerCount = state.players.length;
    const newDealerIndex = (state.dealerIndex + 1) % playerCount;
    const startingPlayerIndex = (newDealerIndex + 1) % playerCount;

    // 1. Build and shuffle fresh canonical 108-card deck
    let deck = DeckFactory.createClassicDeck(state.variant);
    deck = shuffleDeck(deck, rng);

    // 2. Deal 7 cards per player
    const playerIds = state.players.map((p) => p.id);
    const { hands, remainingDeck } = HandManager.dealInitialHands(deck, playerIds, 7);

    let drawPile = [...remainingDeck];
    let topDiscard: Card | undefined;

    // 3. Flip starting card (must not be Wild or Wild Draw Four)
    while (!topDiscard || topDiscard.type === 'wild') {
      if (topDiscard && topDiscard.type === 'wild') {
        drawPile = shuffleDeck([...drawPile, topDiscard], rng);
      }
      topDiscard = drawPile.pop();
      if (!topDiscard) {
        throw new Error('Not enough cards in deck to establish discard pile.');
      }
    }

    const discardPile: Card[] = [topDiscard];

    const activeColor: CardColor = topDiscard.color ?? 'red';
    let turnDirection: TurnDirection = 'clockwise';
    let currentPlayerIndex = startingPlayerIndex;

    const newPlayers: Player[] = state.players.map((p) => ({
      id: p.id,
      username: p.username,
      hand: hands.get(p.id)!,
      hasDeclaredUno: false,
      hasDrawnThisTurn: false,
      drawnCardId: null,
      score: p.score, // PRESERVE CUMULATIVE SCORE!
    }));

    // Apply start card effects
    if (topDiscard.value === 'draw_two') {
      const targetPlayer = newPlayers[startingPlayerIndex];
      const drawResult = DeckManager.drawCards(drawPile, discardPile, 2, rng);
      drawPile = drawResult.newDrawPile;
      newPlayers[startingPlayerIndex] = {
        ...targetPlayer,
        hand: [...targetPlayer.hand, ...drawResult.drawnCards],
      };
      currentPlayerIndex = TurnManager.getNextPlayerIndex(startingPlayerIndex, playerCount, turnDirection, 1);
    } else if (topDiscard.value === 'reverse') {
      turnDirection = 'counter_clockwise';
      if (playerCount === 2) {
        currentPlayerIndex = startingPlayerIndex;
      } else {
        currentPlayerIndex = newDealerIndex;
      }
    } else if (topDiscard.value === 'skip') {
      currentPlayerIndex = TurnManager.getNextPlayerIndex(startingPlayerIndex, playerCount, turnDirection, 1);
    }

    const timestamp = new Date().toISOString();

    return {
      ...state,
      status: 'IN_PROGRESS',
      roundNumber: state.roundNumber + 1,
      dealerIndex: newDealerIndex,
      players: newPlayers,
      currentPlayerIndex,
      turnDirection,
      drawPile,
      discardPile,
      topDiscardCard: topDiscard,
      activeColor,
      turnNumber: 1,
      sequenceNumber: state.sequenceNumber + 1,
      unoVulnerablePlayerId: null,
      pendingActionState: null,
      inspectionHand: null,
      roundWinner: null,
      updatedAt: timestamp,
    };
  }
}
