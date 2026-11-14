import { GameState } from '../../game/game.types';
import { Card } from '../../cards/card.types';
import { UNO_ALL_WILD_RULES } from './all-wild.constants';

export class AllWildInvariantError extends Error {
  constructor(message: string) {
    super(`[UNO All Wild Invariant Violation] ${message}`);
    this.name = 'AllWildInvariantError';
  }
}

/**
 * Asserts all official Mattel HHL33 physical card conservation and state invariants.
 *
 * Core mathematical invariants:
 * 1. Exactly 112 physical cards in circulation across hands, draw pile, and discard pile:
 *    sum(|hand_p|) + |drawPile| + |discardPile| === 112
 * 2. Absolute uniqueness of physical card IDs (no duplicate card objects or IDs anywhere in state).
 * 3. Variant tag must be 'uno_all_wild'.
 * 4. All cards must be valid UNO All Wild cards (type: 'wild', variant: 'uno_all_wild').
 * 5. Player count between 2 and 10.
 */
export function assertValidAllWildGameState(state: GameState): void {
  if (state.variant !== 'uno_all_wild') {
    throw new AllWildInvariantError(
      `Expected variant 'uno_all_wild', received '${state.variant}'.`
    );
  }

  const playerCount = state.players.length;
  if (playerCount < UNO_ALL_WILD_RULES.MIN_PLAYERS || playerCount > UNO_ALL_WILD_RULES.MAX_PLAYERS) {
    throw new AllWildInvariantError(
      `Player count ${playerCount} out of bounds [${UNO_ALL_WILD_RULES.MIN_PLAYERS}, ${UNO_ALL_WILD_RULES.MAX_PLAYERS}].`
    );
  }

  // Collect all physical cards across all zones
  const allCards: Card[] = [];

  for (const player of state.players) {
    allCards.push(...player.hand);
  }
  allCards.push(...state.drawPile);
  allCards.push(...state.discardPile);

  // 1. Total card count invariant
  if (allCards.length !== UNO_ALL_WILD_RULES.TOTAL_DECK_SIZE) {
    throw new AllWildInvariantError(
      `Physical card conservation violated: expected exactly ${UNO_ALL_WILD_RULES.TOTAL_DECK_SIZE} cards in existence, found ${allCards.length}.`
    );
  }

  // 2. ID uniqueness invariant
  const seenIds = new Set<string>();
  for (const card of allCards) {
    if (seenIds.has(card.id)) {
      throw new AllWildInvariantError(
        `Duplicate card instance detected: card ID '${card.id}' exists in multiple zones.`
      );
    }
    seenIds.add(card.id);

    // 3. Card property invariant
    if (card.variant !== 'uno_all_wild' || card.type !== 'wild') {
      throw new AllWildInvariantError(
        `Card '${card.id}' has invalid properties: variant=${card.variant}, type=${card.type}. Expected variant='uno_all_wild' and type='wild'.`
      );
    }
  }

  // 4. Discard pile must not be empty while match is in progress
  if (state.status === 'IN_PROGRESS' && state.discardPile.length === 0) {
    throw new AllWildInvariantError('Discard pile is empty while match is in progress.');
  }

  // 5. Current player index must be within bounds
  if (state.currentPlayerIndex < 0 || state.currentPlayerIndex >= playerCount) {
    throw new AllWildInvariantError(
      `Current player index ${state.currentPlayerIndex} is out of bounds for ${playerCount} players.`
    );
  }
}

export function validateAllWildGameStateInvariants(state: GameState): {
  valid: boolean;
  totalCards: number;
  errors: string[];
} {
  const errors: string[] = [];

  if (state.variant !== 'uno_all_wild') {
    errors.push(`Expected variant 'uno_all_wild', received '${state.variant}'.`);
  }

  const playerCount = state.players.length;
  if (playerCount < UNO_ALL_WILD_RULES.MIN_PLAYERS || playerCount > UNO_ALL_WILD_RULES.MAX_PLAYERS) {
    errors.push(
      `Player count ${playerCount} out of bounds [${UNO_ALL_WILD_RULES.MIN_PLAYERS}, ${UNO_ALL_WILD_RULES.MAX_PLAYERS}].`
    );
  }

  const allCards: Card[] = [];
  for (const player of state.players) {
    allCards.push(...player.hand);
  }
  allCards.push(...state.drawPile);
  allCards.push(...state.discardPile);

  const totalCards = allCards.length;
  if (totalCards !== UNO_ALL_WILD_RULES.TOTAL_DECK_SIZE) {
    errors.push(
      `Physical card conservation violated: expected exactly ${UNO_ALL_WILD_RULES.TOTAL_DECK_SIZE} cards in existence, found ${totalCards}.`
    );
  }

  const seenIds = new Set<string>();
  for (const card of allCards) {
    if (seenIds.has(card.id)) {
      errors.push(`Duplicate card instance detected: card ID '${card.id}' exists in multiple zones.`);
    }
    seenIds.add(card.id);

    if (card.variant !== 'uno_all_wild' || card.type !== 'wild') {
      errors.push(
        `Card '${card.id}' has invalid properties: variant=${card.variant}, type=${card.type}. Expected variant='uno_all_wild' and type='wild'.`
      );
    }
  }

  if (state.status === 'IN_PROGRESS' && state.discardPile.length === 0) {
    errors.push('Discard pile is empty while match is in progress.');
  }

  if (state.currentPlayerIndex < 0 || state.currentPlayerIndex >= playerCount) {
    errors.push(
      `Current player index ${state.currentPlayerIndex} is out of bounds for ${playerCount} players.`
    );
  }

  return {
    valid: errors.length === 0,
    totalCards,
    errors,
  };
}
