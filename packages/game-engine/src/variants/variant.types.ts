import { Card, FlipSide } from '../cards/card.types';
import { GameConfig, GameState } from '../game/game.types';
import { GameAction } from '../actions/action.types';
import { ActionProcessResult } from '../actions/action.processor';
import { ValidationResult } from '../validation/move.validator';
import { DealerDeterminationResult } from '../game/game.factory';
import { RandomNumberGenerator } from '../deck/deck.shuffle';

export interface GameVariantAdapter {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly cardsPerHand: number;
  readonly targetScore: number;
  readonly missedUnoPenaltyCards: number;

  createDeck(rng?: RandomNumberGenerator): Card[];
  determineDealerDetailed(
    playerCount: number,
    rng?: RandomNumberGenerator,
    maxTieRounds?: number
  ): DealerDeterminationResult;
  createGame(config: GameConfig, rng?: RandomNumberGenerator): GameState;
  startNextRound(state: GameState, rng?: RandomNumberGenerator): GameState;
  validateMove(state: GameState, action: GameAction): ValidationResult;
  processAction(state: GameState, action: GameAction, rng?: RandomNumberGenerator): ActionProcessResult;
  calculateScore(loserHands: readonly (readonly Card[])[], activeSide?: FlipSide): number;
}

export type UnoVariant = GameVariantAdapter;

export class VariantRegistry {
  private static variants = new Map<string, GameVariantAdapter>();

  static register(variant: GameVariantAdapter): void {
    this.variants.set(variant.id, variant);
  }

  static get(id: string): GameVariantAdapter {
    const variant = this.variants.get(id);
    if (!variant) {
      throw new Error(`Variant "${id}" is not registered.`);
    }
    return variant;
  }

  static list(): readonly GameVariantAdapter[] {
    return Array.from(this.variants.values());
  }

  static has(id: string): boolean {
    return this.variants.has(id);
  }

  static getDefault(): GameVariantAdapter {
    return this.get('classic');
  }
}
