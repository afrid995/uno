import { GameState } from '../../game/game.types';
import { UNO_FLEX_RULES } from './flex.constants';

export class FlexInvariantViolationError extends Error {
  constructor(message: string) {
    super(`[FLEX_INVARIANT_VIOLATION] ${message}`);
    this.name = 'FlexInvariantViolationError';
  }
}

/**
 * Validates the strict invariants of an UNO Flex match state (Mattel HNB00).
 */
export function assertValidFlexGameState(state: GameState): void {
  if (state.variant !== 'uno_flex') {
    throw new FlexInvariantViolationError(
      `Invalid variant "${state.variant}". Expected "uno_flex".`
    );
  }

  // 1. Player bounds (2-8 players per official Mattel box)
  const playerCount = state.players.length;
  if (
    playerCount < UNO_FLEX_RULES.MIN_PLAYERS ||
    playerCount > UNO_FLEX_RULES.MAX_PLAYERS
  ) {
    throw new FlexInvariantViolationError(
      `Invalid player count ${playerCount}. UNO Flex supports between ${UNO_FLEX_RULES.MIN_PLAYERS} and ${UNO_FLEX_RULES.MAX_PLAYERS} players.`
    );
  }

  // 2. Active player index valid
  if (
    state.currentPlayerIndex < 0 ||
    state.currentPlayerIndex >= playerCount
  ) {
    throw new FlexInvariantViolationError(
      `currentPlayerIndex ${state.currentPlayerIndex} is out of bounds [0, ${playerCount - 1}].`
    );
  }

  // 3. Power Card status invariant: every player must have a valid Power Card ('green_check' or 'red_x')
  for (const player of state.players) {
    if (
      player.powerCardStatus !== 'green_check' &&
      player.powerCardStatus !== 'red_x'
    ) {
      throw new FlexInvariantViolationError(
        `Player "${player.id}" has invalid powerCardStatus "${player.powerCardStatus}". Must be "green_check" or "red_x".`
      );
    }
  }

  // 4. Discard pile not empty
  if (state.discardPile.length === 0) {
    throw new FlexInvariantViolationError('Discard pile cannot be empty.');
  }

  const topCardInPile = state.discardPile[state.discardPile.length - 1];
  if (state.topDiscardCard.id !== topCardInPile.id) {
    throw new FlexInvariantViolationError(
      `topDiscardCard "${state.topDiscardCard.id}" does not match last card in discard pile "${topCardInPile.id}".`
    );
  }

  // 5. Total 104-card conservation
  const allCardIds = new Set<string>();
  let totalCards = 0;

  for (const card of state.drawPile) {
    if (allCardIds.has(card.id)) {
      throw new FlexInvariantViolationError(`Duplicate card ID detected: "${card.id}" in draw pile.`);
    }
    allCardIds.add(card.id);
    totalCards++;
  }

  for (const card of state.discardPile) {
    if (allCardIds.has(card.id)) {
      throw new FlexInvariantViolationError(`Duplicate card ID detected: "${card.id}" in discard pile.`);
    }
    allCardIds.add(card.id);
    totalCards++;
  }

  for (const player of state.players) {
    for (const card of player.hand) {
      if (allCardIds.has(card.id)) {
        throw new FlexInvariantViolationError(`Duplicate card ID detected: "${card.id}" in hand of player "${player.id}".`);
      }
      allCardIds.add(card.id);
      totalCards++;
    }
  }

  if (totalCards !== UNO_FLEX_RULES.PLAYING_CARDS) {
    throw new FlexInvariantViolationError(
      `Total card conservation violated: found ${totalCards} cards, expected ${UNO_FLEX_RULES.PLAYING_CARDS}.`
    );
  }
}

/**
 * Non-throwing invariant validator for testing & diagnostics.
 */
export function validateFlexGameStateInvariants(
  state: GameState
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  try {
    assertValidFlexGameState(state);
  } catch (err: unknown) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  return { valid: errors.length === 0, errors };
}
