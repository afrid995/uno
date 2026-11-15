import { GameState } from '../../game/game.types';
import { UNO_TEAMS_RULES } from './teams.constants';

export class TeamsInvariantViolationError extends Error {
  constructor(message: string) {
    super(`[TEAMS_INVARIANT_VIOLATION] ${message}`);
    this.name = 'TeamsInvariantViolationError';
  }
}

export function assertValidTeamsGameState(state: GameState): void {
  if (state.variant !== 'uno_teams') {
    throw new TeamsInvariantViolationError(
      `Invalid variant "${state.variant}". Expected "uno_teams".`
    );
  }

  // 1. Player bounds (4-8 players, even number for teams of 2)
  const playerCount = state.players.length;
  if (
    playerCount < UNO_TEAMS_RULES.MIN_PLAYERS ||
    playerCount > UNO_TEAMS_RULES.MAX_PLAYERS ||
    playerCount % 2 !== 0
  ) {
    throw new TeamsInvariantViolationError(
      `Invalid player count ${playerCount}. UNO Teams supports 4, 6, or 8 players (teams of 2).`
    );
  }

  // 2. Current player index valid
  if (state.currentPlayerIndex < 0 || state.currentPlayerIndex >= playerCount) {
    throw new TeamsInvariantViolationError(
      `currentPlayerIndex ${state.currentPlayerIndex} is out of bounds [0, ${playerCount - 1}].`
    );
  }

  // 3. Team assignments: each player must have a valid teamId
  for (const player of state.players) {
    if (!player.teamId) {
      throw new TeamsInvariantViolationError(`Player "${player.id}" is missing teamId.`);
    }
  }

  // 4. Discard pile not empty
  if (state.discardPile.length === 0) {
    throw new TeamsInvariantViolationError('Discard pile cannot be empty.');
  }

  const topCardInPile = state.discardPile[state.discardPile.length - 1];
  if (state.topDiscardCard.id !== topCardInPile.id) {
    throw new TeamsInvariantViolationError(
      `topDiscardCard "${state.topDiscardCard.id}" does not match last card in discard pile "${topCardInPile.id}".`
    );
  }

  // 5. Total 112-card conservation
  const allCardIds = new Set<string>();
  let totalCards = 0;

  for (const card of state.drawPile) {
    if (allCardIds.has(card.id)) {
      throw new TeamsInvariantViolationError(`Duplicate card ID detected: "${card.id}" in draw pile.`);
    }
    allCardIds.add(card.id);
    totalCards++;
  }

  for (const card of state.discardPile) {
    if (allCardIds.has(card.id)) {
      throw new TeamsInvariantViolationError(`Duplicate card ID detected: "${card.id}" in discard pile.`);
    }
    allCardIds.add(card.id);
    totalCards++;
  }

  for (const player of state.players) {
    for (const card of player.hand) {
      if (allCardIds.has(card.id)) {
        throw new TeamsInvariantViolationError(`Duplicate card ID detected: "${card.id}" in hand of player "${player.id}".`);
      }
      allCardIds.add(card.id);
      totalCards++;
    }
  }

  if (totalCards !== UNO_TEAMS_RULES.TOTAL_CARDS_IN_DECK) {
    throw new TeamsInvariantViolationError(
      `Total card conservation violated: found ${totalCards} cards, expected ${UNO_TEAMS_RULES.TOTAL_CARDS_IN_DECK}.`
    );
  }
}

export function validateTeamsGameStateInvariants(
  state: GameState
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  try {
    assertValidTeamsGameState(state);
  } catch (err: unknown) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  return { valid: errors.length === 0, errors };
}
