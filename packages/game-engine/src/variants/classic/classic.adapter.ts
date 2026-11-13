import { Card } from '../../cards/card.types';
import { GameConfig, GameState } from '../../game/game.types';
import { GameAction } from '../../actions/action.types';
import { ActionProcessResult } from '../../actions/action.processor';
import { ValidationResult } from '../../validation/move.validator';
import { DealerDeterminationResult, GameFactory } from '../../game/game.factory';
import { DeckFactory } from '../../deck/deck.factory';
import { HandManager } from '../../players/hand.manager';
import { RandomNumberGenerator, defaultCryptoRng } from '../../deck/deck.shuffle';
import { GameVariantAdapter, VariantRegistry } from '../variant.types';
import { CLASSIC_UNO_RULES } from './classic.rules';
import { MoveValidator } from '../../validation/move.validator';
import { ActionProcessor } from '../../actions/action.processor';

export class ClassicUnoAdapter implements GameVariantAdapter {
  readonly id = 'classic';
  readonly name = 'Classic UNO';
  readonly description = 'Official Mattel Classic UNO (42001) rules with canonical 108-card deck.';
  readonly minPlayers = CLASSIC_UNO_RULES.MIN_PLAYERS;
  readonly maxPlayers = CLASSIC_UNO_RULES.MAX_PLAYERS;
  readonly cardsPerHand = CLASSIC_UNO_RULES.INITIAL_HAND_SIZE;
  readonly targetScore = CLASSIC_UNO_RULES.TARGET_WIN_SCORE;
  readonly missedUnoPenaltyCards = 4; // Official Mattel 42001: 4 cards

  createDeck(_rng: RandomNumberGenerator = defaultCryptoRng): Card[] {
    return DeckFactory.createClassicDeck('classic');
  }

  determineDealerDetailed(
    playerCount: number,
    rng: RandomNumberGenerator = defaultCryptoRng,
    maxTieRounds?: number
  ): DealerDeterminationResult {
    return GameFactory.determineDealerDetailed(playerCount, rng, maxTieRounds);
  }

  createGame(config: GameConfig, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
    return GameFactory.createClassicGame(config, rng);
  }

  startNextRound(state: GameState, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
    return GameFactory.startClassicNextRound(state, rng);
  }

  validateMove(state: GameState, action: GameAction): ValidationResult {
    return MoveValidator.validateClassic(state, action);
  }

  processAction(
    state: GameState,
    action: GameAction,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): ActionProcessResult {
    return ActionProcessor.processClassic(state, action, rng);
  }

  calculateScore(loserHands: readonly (readonly Card[])[]): number {
    return loserHands.reduce((acc, hand) => acc + HandManager.calculateHandScore(hand), 0);
  }
}

export const classicUnoAdapter = new ClassicUnoAdapter();
VariantRegistry.register(classicUnoAdapter);
