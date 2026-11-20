import { Card } from '../../cards/card.types';
import { GameConfig, GameState } from '../../game/game.types';
import { GameAction } from '../../actions/action.types';
import { ActionProcessResult } from '../../actions/action.processor';
import { ValidationResult } from '../../validation/move.validator';
import { DealerDeterminationResult } from '../../game/game.factory';
import { Player } from '../../players/player.types';
import { TurnDirection } from '../../turns/turn.direction';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../../deck/deck.shuffle';
import { GameVariantAdapter, VariantRegistry } from '../variant.types';
import { AllWildDeckFactory } from './all-wild.deck';
import { AllWildDealerSelector } from './all-wild.dealer';
import { AllWildMoveValidator } from './all-wild.validator';
import { AllWildActionProcessor } from './all-wild.actions';
import { UNO_ALL_WILD_RULES } from './all-wild.constants';
import { assertValidAllWildGameState } from './all-wild.invariants';
import { HandManager } from '../../players/hand.manager';

export class UnoAllWildAdapter implements GameVariantAdapter {
  readonly id = 'uno_all_wild';
  readonly name = 'UNO All Wild';
  readonly description = 'Official Mattel UNO All Wild (HHL33) 112-card edition. Every card is wild!';
  readonly minPlayers = UNO_ALL_WILD_RULES.MIN_PLAYERS;
  readonly maxPlayers = UNO_ALL_WILD_RULES.MAX_PLAYERS;
  readonly cardsPerHand = UNO_ALL_WILD_RULES.INITIAL_HAND_SIZE;
  readonly targetScore = UNO_ALL_WILD_RULES.TARGET_WIN_SCORE;
  readonly missedUnoPenaltyCards = UNO_ALL_WILD_RULES.MISSED_UNO_PENALTY_CARDS;

  createDeck(_rng: RandomNumberGenerator = defaultCryptoRng): Card[] {
    return AllWildDeckFactory.createDeck();
  }

  determineDealerDetailed(
    playerCount: number,
    rng: RandomNumberGenerator = defaultCryptoRng,
    maxTieRounds: number = AllWildDealerSelector.DEFAULT_MAX_TIE_ROUNDS
  ): DealerDeterminationResult {
    return AllWildDealerSelector.determineDealerDetailed(playerCount, rng, maxTieRounds);
  }

  createGame(config: GameConfig, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
    const minPlayers = this.minPlayers;
    const maxPlayers = this.maxPlayers;
    const playerCount = config.players.length;

    if (playerCount < minPlayers || playerCount > maxPlayers) {
      throw new Error(
        `Invalid player count ${playerCount}. UNO All Wild supports between ${minPlayers} and ${maxPlayers} players.`
      );
    }

    const cardsPerHand = config.cardsPerHand ?? this.cardsPerHand;
    const targetScore = config.targetScore ?? this.targetScore;

    // 1. Create and shuffle 112-card All Wild deck
    const deck: Card[] = shuffleDeck(AllWildDeckFactory.createDeck(), rng);

    // 2. Determine dealer
    const dealerIndex =
      config.dealerIndex !== undefined
        ? config.dealerIndex
        : AllWildDealerSelector.determineDealer(playerCount, rng);

    // 3. Deal 7 cards to each player
    const playerIds = config.players.map((p) => p.id);
    const { hands, remainingDeck } = HandManager.dealInitialHands(deck, playerIds, cardsPerHand);

    const drawPile = [...remainingDeck];

    // 4. Reveal top card to start discard pile.
    // Official Mattel HHL33 Setup: If the opening card is a Wild Action Card, ignore its action.
    const topCard = drawPile.pop();
    if (!topCard) {
      throw new Error('Not enough cards in deck to establish discard pile.');
    }
    const discardPile: Card[] = [topCard];

    const startingPlayerIndex = (dealerIndex + 1) % playerCount;
    const turnDirection: TurnDirection = 'clockwise';

    const initialPlayers: Player[] = config.players.map((p) => ({
      id: p.id,
      username: p.username,
      hand: hands.get(p.id)!,
      hasDeclaredUno: false,
      hasDrawnThisTurn: false,
      drawnCardId: null,
      score: 0,
      cumulativeScore: p.cumulativeScore ?? (p as any).initialScore ?? 0,
      isEliminated: false,
    }));

    const timestamp = new Date().toISOString();
    const matchId = config.matchId ?? `match_${Date.now()}`;

    const state: GameState = {
      id: matchId,
      roomId: config.roomId,
      variant: 'uno_all_wild',
      status: 'IN_PROGRESS',
      roundNumber: 1,
      dealerIndex,
      targetScore,
      players: initialPlayers,
      playerOrder: playerIds,
      currentPlayerIndex: startingPlayerIndex,
      turnDirection,
      drawPile,
      discardPile,
      topDiscardCard: topCard,
      activeColor: null, // No color matching in UNO All Wild
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

    assertValidAllWildGameState(state);
    return state;
  }

  startNextRound(state: GameState, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
    const action: GameAction = {
      type: 'START_NEXT_ROUND',
      triggeredByPlayerId: state.players[0].id,
    };
    return this.processAction(state, action, rng).nextState;
  }

  validateMove(state: GameState, action: GameAction): ValidationResult {
    return AllWildMoveValidator.validate(state, action);
  }

  processAction(
    state: GameState,
    action: GameAction,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): ActionProcessResult {
    return AllWildActionProcessor.process(state, action, rng);
  }

  calculateScore(loserHands: readonly (readonly Card[])[]): number {
    return loserHands.reduce((acc, hand) => {
      return acc + hand.reduce((handSum, card) => handSum + card.scoreValue, 0);
    }, 0);
  }
}

export const unoAllWildAdapter = new UnoAllWildAdapter();
VariantRegistry.register(unoAllWildAdapter);
