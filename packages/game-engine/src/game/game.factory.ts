import { Card, CardColor } from '../cards/card.types';
import { GameConfig, GameState } from './game.types';
import { Player } from '../players/player.types';
import { DeckFactory } from '../deck/deck.factory';
import { DeckManager } from '../deck/deck.manager';
import { HandManager } from '../players/hand.manager';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../deck/deck.shuffle';
import { TurnDirection } from '../turns/turn.direction';
import { TurnManager } from '../turns/turn.manager';
import { VariantRegistry } from '../variants/variant.types';

export interface DealerDrawRecord {
  readonly candidateIndex: number;
  readonly card: Card;
  readonly score: number;
}

export interface DealerDeterminationRound {
  readonly round: number;
  readonly draws: readonly DealerDrawRecord[];
  readonly highestScore: number;
  readonly remainingCandidates: readonly number[];
}

export interface DealerDeterminationResult {
  readonly dealerIndex: number;
  readonly tieRounds: number;
  readonly resolvedByFallback: boolean;
  readonly roundHistory: readonly DealerDeterminationRound[];
}

export class GameFactory {
  static readonly DEFAULT_MAX_TIE_ROUNDS = 20;

  /**
   * Official Mattel 42001 dealer determination with documented application-level tie-resolution policy.
   *
   * 1. Official Mattel 42001 rule:
   *    - Setup section: "Each player picks a card. The player with the highest point value deals."
   *    - Scoring section card values:
   *        * Number cards (0-9): Face value (0 to 9 points).
   *        * Action cards (Draw Two, Reverse, Skip): 20 points each.
   *        * Wild cards (Wild, Wild Draw Four): 50 points each.
   *    - Note: Mattel 42001 does NOT specify that symbol cards count as zero; the 20-point and
   *      50-point values are directly from the 42001 instruction sheet's official scoring table.
   *
   * 2. Application-Level Tie-Resolution Policy (Explicit Design Decision):
   *    - The 42001 sheet states that highest point value deals, but does not define an automated
   *      tie-break procedure when multiple players draw equal maximum scores.
   *    - Candidate redraws between tied players are an application-level policy.
   *    - Shuffling a fresh 108-card deck whenever fewer cards remain than candidates is an application policy.
   *    - The safety ceiling of maxTieRounds (default 20) is an application-level policy to prevent infinite loops.
   *    - The deterministic fallback selecting the lowest remaining seat index (Math.min(...candidates))
   *      is an application-level policy, NOT an official Mattel rule.
   */
  static determineDealerDetailed(
    playerCount: number,
    rng: RandomNumberGenerator = defaultCryptoRng,
    maxTieRounds: number = GameFactory.DEFAULT_MAX_TIE_ROUNDS
  ): DealerDeterminationResult {
    if (playerCount <= 1) {
      return {
        dealerIndex: 0,
        tieRounds: 0,
        resolvedByFallback: false,
        roundHistory: [],
      };
    }

    let candidates = Array.from({ length: playerCount }, (_, i) => i);
    let deck: Card[] = [];
    let tieRounds = 0;
    const roundHistory: DealerDeterminationRound[] = [];

    while (candidates.length > 1 && tieRounds < maxTieRounds) {
      tieRounds++;

      // Ensure we have enough cards in the draw pile for all remaining candidates
      if (deck.length < candidates.length) {
        deck = shuffleDeck(DeckFactory.createClassicDeck('classic'), rng);
      }

      // Draw one card for each candidate
      const draws: DealerDrawRecord[] = [];
      for (const candidate of candidates) {
        const card = deck.pop()!;
        draws.push({
          candidateIndex: candidate,
          card,
          score: card.scoreValue,
        });
      }

      // Find the highest score drawn this round
      const highestScore = Math.max(...draws.map((d) => d.score));

      // Filter candidates to only those who tied for highest score
      candidates = draws
        .filter((d) => d.score === highestScore)
        .map((d) => d.candidateIndex);

      roundHistory.push({
        round: tieRounds,
        draws,
        highestScore,
        remainingCandidates: [...candidates],
      });
    }

    const resolvedByFallback = candidates.length > 1;
    // Deterministic application-level tie-breaker: lowest seat index among remaining tied candidates
    const dealerIndex = resolvedByFallback ? Math.min(...candidates) : candidates[0];

    return {
      dealerIndex,
      tieRounds,
      resolvedByFallback,
      roundHistory,
    };
  }

  static determineDealer(
    playerCount: number,
    rng: RandomNumberGenerator = defaultCryptoRng,
    maxTieRounds: number = GameFactory.DEFAULT_MAX_TIE_ROUNDS
  ): number {
    return this.determineDealerDetailed(playerCount, rng, maxTieRounds).dealerIndex;
  }

  /**
   * Initializes a new GameState from a game configuration.
   * Delegates to the registered variant adapter (e.g. Classic UNO or UNO Flip).
   */
  static createGame(config: GameConfig, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
    const variant = config.variant ?? 'classic';
    if (variant === 'classic') {
      return this.createClassicGame(config, rng);
    }
    const adapter = VariantRegistry.get(variant);
    return adapter.createGame(config, rng);
  }

  /**
   * Internal classic Mattel 42001 game creation.
   */
  static createClassicGame(config: GameConfig, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
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
      cumulativeScore: p.cumulativeScore ?? p.initialScore ?? 0,
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
      // Per Mattel 42001: The player to the dealer's right plays first and play proceeds to the right (counter-clockwise)
      turnDirection = 'counter_clockwise';
      currentPlayerIndex = TurnManager.getNextPlayerIndex(dealerIndex, playerCount, 'counter_clockwise', 1);
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
   * Delegates to the registered variant adapter.
   */
  static startNextRound(state: GameState, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
    const variant = state.variant ?? 'classic';
    if (variant === 'classic') {
      return this.startClassicNextRound(state, rng);
    }
    const adapter = VariantRegistry.get(variant);
    return adapter.startNextRound(state, rng);
  }

  /**
   * Internal classic Mattel 42001 next round initialization.
   */
  static startClassicNextRound(state: GameState, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
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
      cumulativeScore: p.cumulativeScore ?? p.score,
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
      // Per Mattel 42001: The player to the dealer's right plays first and play proceeds to the right (counter-clockwise)
      turnDirection = 'counter_clockwise';
      currentPlayerIndex = TurnManager.getNextPlayerIndex(newDealerIndex, playerCount, 'counter_clockwise', 1);
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
