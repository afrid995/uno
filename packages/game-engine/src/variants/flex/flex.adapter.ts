import { Card } from '../../cards/card.types';
import { GameConfig, GameState } from '../../game/game.types';
import { GameAction } from '../../actions/action.types';
import { ActionProcessResult } from '../../actions/action.processor';
import { ValidationResult } from '../../validation/move.validator';
import { DealerDeterminationResult } from '../../game/game.factory';
import { Player, PowerCardStatus } from '../../players/player.types';
import { TurnDirection } from '../../turns/turn.direction';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../../deck/deck.shuffle';
import { GameVariantAdapter, VariantRegistry } from '../variant.types';
import { FlexDeckFactory } from './flex.deck';
import { FlexDealerSelector } from './flex.dealer';
import { FlexMoveValidator } from './flex.validator';
import { FlexActionProcessor } from './flex.actions';
import { UNO_FLEX_RULES } from './flex.constants';
import { assertValidFlexGameState } from './flex.invariants';
import { HandManager } from '../../players/hand.manager';

export class UnoFlexAdapter implements GameVariantAdapter {
  readonly id = 'uno_flex';
  readonly name = 'UNO Flex';
  readonly description =
    'Official Mattel UNO Flex (Product HNB00 / HMY99) 112-card edition. Double-sided Flex cards with Green Check / Red X Power Cards!';
  readonly minPlayers = UNO_FLEX_RULES.MIN_PLAYERS;
  readonly maxPlayers = UNO_FLEX_RULES.MAX_PLAYERS;
  readonly cardsPerHand = UNO_FLEX_RULES.INITIAL_HAND_SIZE;
  readonly targetScore = UNO_FLEX_RULES.TARGET_WIN_SCORE;
  readonly missedUnoPenaltyCards = UNO_FLEX_RULES.MISSED_UNO_PENALTY_CARDS;

  createDeck(_rng: RandomNumberGenerator = defaultCryptoRng): Card[] {
    return FlexDeckFactory.createDeck();
  }

  determineDealerDetailed(
    playerCount: number,
    rng: RandomNumberGenerator = defaultCryptoRng,
    maxTieRounds: number = FlexDealerSelector.DEFAULT_MAX_TIE_ROUNDS
  ): DealerDeterminationResult {
    return FlexDealerSelector.determineDealerDetailed(playerCount, rng, maxTieRounds);
  }

  createGame(config: GameConfig, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
    const minPlayers = this.minPlayers;
    const maxPlayers = this.maxPlayers;
    const playerCount = config.players.length;

    if (playerCount < minPlayers || playerCount > maxPlayers) {
      throw new Error(
        `Invalid player count ${playerCount}. UNO Flex supports between ${minPlayers} and ${maxPlayers} players.`
      );
    }

    const cardsPerHand = config.cardsPerHand ?? this.cardsPerHand;
    const targetScore = config.targetScore ?? this.targetScore;

    // 1. Build and shuffle 104-card Flex deck
    const deck = shuffleDeck(FlexDeckFactory.createDeck(), rng);

    // 2. Determine dealer
    const dealerIndex =
      config.dealerIndex !== undefined
        ? config.dealerIndex
        : FlexDealerSelector.determineDealer(playerCount, rng);

    // 3. Deal 7 cards to each player
    const playerIds = config.players.map((p) => p.id);
    const { hands, remainingDeck } = HandManager.dealInitialHands(deck, playerIds, cardsPerHand);

    const drawPile = [...remainingDeck];

    // 4. Reveal top card to start discard pile.
    // Mattel Product HNB00 Setup Rule 7:
    // "Flip over the top card of the DRAW PILE and place it FACEUP to form the DISCARD PILE.
    // If this card is an Action Card, ignore it and flip over the next card."
    // All Action Cards (Classic & Flex) and Wild Cards are ignored; keep flipping until a Number Card is reached.
    const discardPile: Card[] = [];
    let topCard = drawPile.pop()!;
    while (topCard.type !== 'number') {
      discardPile.push(topCard);
      topCard = drawPile.pop()!;
    }
    discardPile.push(topCard);

    const startingPlayerIndex = (dealerIndex + 1) % playerCount;
    const turnDirection: TurnDirection = 'clockwise';

    // 5. Each player begins with their Power Card on the green "✓" side
    const initialPlayers: Player[] = config.players.map((p) => ({
      id: p.id,
      username: p.username,
      hand: hands.get(p.id)!,
      hasDeclaredUno: false,
      hasDrawnThisTurn: false,
      drawnCardId: null,
      score: 0,
      powerCardStatus: 'green_check' as PowerCardStatus,
    }));

    const timestamp = new Date().toISOString();
    const matchId = config.matchId ?? `match_${Date.now()}`;

    const state: GameState = {
      id: matchId,
      roomId: config.roomId,
      variant: 'uno_flex',
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
      activeColor: topCard.color,
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

    assertValidFlexGameState(state);
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
    return FlexMoveValidator.validate(state, action);
  }

  processAction(
    state: GameState,
    action: GameAction,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): ActionProcessResult {
    return FlexActionProcessor.process(state, action, rng);
  }

  calculateScore(loserHands: readonly (readonly Card[])[]): number {
    return loserHands.reduce((acc, hand) => {
      return acc + hand.reduce((handSum, card) => handSum + card.scoreValue, 0);
    }, 0);
  }
}

export const unoFlexAdapter = new UnoFlexAdapter();
VariantRegistry.register(unoFlexAdapter);
