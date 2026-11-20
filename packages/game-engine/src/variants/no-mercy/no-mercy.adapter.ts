import { Card } from '../../cards/card.types';
import { GameConfig, GameState } from '../../game/game.types';
import { GameAction } from '../../actions/action.types';
import { ActionProcessResult } from '../../actions/action.processor';
import { ValidationResult } from '../../validation/move.validator';
import { DealerDeterminationResult } from '../../game/game.factory';
import { Player } from '../../players/player.types';
import { HandManager } from '../../players/hand.manager';
import { TurnDirection } from '../../turns/turn.direction';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../../deck/deck.shuffle';
import { GameVariantAdapter, VariantRegistry } from '../variant.types';
import { NoMercyDeckFactory } from './no-mercy.deck';
import { NoMercyDealerSelector } from './no-mercy.dealer';
import { NoMercyMoveValidator } from './no-mercy.validator';
import { NoMercyActionProcessor } from './no-mercy.actions';
import { UNO_NO_MERCY_RULES } from './no-mercy.constants';

export class UnoShowEmNoMercyAdapter implements GameVariantAdapter {
  readonly id = 'uno_show_em_no_mercy';
  readonly name = "UNO Show 'em No Mercy";
  readonly description = "Official Mattel UNO Show 'em No Mercy (HWV18) 168-card edition.";
  readonly minPlayers = UNO_NO_MERCY_RULES.MIN_PLAYERS;
  readonly maxPlayers = UNO_NO_MERCY_RULES.MAX_PLAYERS;
  readonly cardsPerHand = UNO_NO_MERCY_RULES.INITIAL_HAND_SIZE;
  readonly targetScore = UNO_NO_MERCY_RULES.TARGET_WIN_SCORE;
  readonly missedUnoPenaltyCards = UNO_NO_MERCY_RULES.MISSED_UNO_PENALTY_CARDS;

  createDeck(_rng: RandomNumberGenerator = defaultCryptoRng): Card[] {
    return NoMercyDeckFactory.createDeck();
  }

  determineDealerDetailed(
    playerCount: number,
    rng: RandomNumberGenerator = defaultCryptoRng,
    maxTieRounds: number = NoMercyDealerSelector.DEFAULT_MAX_TIE_ROUNDS
  ): DealerDeterminationResult {
    return NoMercyDealerSelector.determineDealerDetailed(playerCount, rng, maxTieRounds);
  }

  createGame(config: GameConfig, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
    const minPlayers = this.minPlayers;
    const maxPlayers = this.maxPlayers;
    const playerCount = config.players.length;

    if (playerCount < minPlayers || playerCount > maxPlayers) {
      throw new Error(
        `Invalid player count ${playerCount}. UNO Show 'em No Mercy supports between ${minPlayers} and ${maxPlayers} players.`
      );
    }

    const cardsPerHand = config.cardsPerHand ?? this.cardsPerHand;
    const targetScore = config.targetScore ?? this.targetScore;

    // 1. Create and shuffle 168-card deck
    const deck: Card[] = shuffleDeck(NoMercyDeckFactory.createDeck(), rng);

    // 2. Determine dealer
    const dealerIndex =
      config.dealerIndex !== undefined
        ? config.dealerIndex
        : NoMercyDealerSelector.determineDealer(playerCount, rng);

    // 3. Deal 7 cards to each player
    const playerIds = config.players.map((p) => p.id);
    const { hands, remainingDeck } = HandManager.dealInitialHands(deck, playerIds, cardsPerHand);

    const drawPile = [...remainingDeck];
    const discardPile: Card[] = [];

    // 4. Reveal top card. Per HWV18 Section 5:
    // If the revealed card is an Action Card, ignore it and reveal the next card until a number card appears.
    let topDiscard: Card | undefined;
    while (!topDiscard || topDiscard.type !== 'number') {
      const card = drawPile.pop();
      if (!card) {
        throw new Error('Not enough cards in deck to establish discard pile.');
      }
      discardPile.push(card);
      topDiscard = card;
    }

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
      eliminationOrder: undefined,
    }));

    const timestamp = new Date().toISOString();
    const matchId = config.matchId ?? `match_${Date.now()}`;

    return {
      id: matchId,
      roomId: config.roomId,
      variant: 'uno_show_em_no_mercy',
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
      topDiscardCard: topDiscard,
      activeColor: topDiscard.color,
      turnNumber: 1,
      sequenceNumber: 0,
      unoVulnerablePlayerId: null,
      pendingActionState: null,
      inspectionHand: null,
      roundWinner: null,
      winner: null,
      setAsideCards: [],
      eliminatedPlayerIds: [],
      eliminatedBonusCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  startNextRound(state: GameState, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
    const result = NoMercyActionProcessor.process(
      state,
      { type: 'START_NEXT_ROUND', triggeredByPlayerId: state.players[0].id },
      rng
    );
    return result.nextState;
  }

  validateMove(state: GameState, action: GameAction): ValidationResult {
    return NoMercyMoveValidator.validate(state, action);
  }

  processAction(
    state: GameState,
    action: GameAction,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): ActionProcessResult {
    return NoMercyActionProcessor.process(state, action, rng);
  }

  calculateScore(loserHands: readonly (readonly Card[])[]): number {
    let score = 0;
    for (const hand of loserHands) {
      for (const card of hand) {
        if (card.type === 'number') {
          score += Number(card.value);
        } else if (card.type === 'action') {
          score += UNO_NO_MERCY_RULES.COLORED_ACTION_POINTS;
        } else if (card.type === 'wild') {
          score += UNO_NO_MERCY_RULES.WILD_ACTION_POINTS;
        }
      }
    }
    return score;
  }
}

export const unoShowEmNoMercyAdapter = new UnoShowEmNoMercyAdapter();
VariantRegistry.register(unoShowEmNoMercyAdapter);
