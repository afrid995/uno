import { GameState } from '../../game/game.types';
import { UNO_ATTACK_RULES, ATTACK_LAUNCHER_CONFIG } from './attack.constants';

export class AttackInvariantViolationError extends Error {
  constructor(message: string) {
    super(`[ATTACK_INVARIANT_VIOLATION] ${message}`);
    this.name = 'AttackInvariantViolationError';
  }
}

export function assertValidAttackGameState(state: GameState): void {
  if (state.variant !== 'uno_attack') {
    throw new AttackInvariantViolationError(
      `Invalid variant "${state.variant}". Expected "uno_attack".`
    );
  }

  // 1. Player bounds (2-10 players)
  const playerCount = state.players.length;
  if (
    playerCount < UNO_ATTACK_RULES.MIN_PLAYERS ||
    playerCount > UNO_ATTACK_RULES.MAX_PLAYERS
  ) {
    throw new AttackInvariantViolationError(
      `Invalid player count ${playerCount}. UNO Attack supports 2 to 10 players.`
    );
  }

  // 2. Current player index valid
  if (state.currentPlayerIndex < 0 || state.currentPlayerIndex >= playerCount) {
    throw new AttackInvariantViolationError(
      `currentPlayerIndex ${state.currentPlayerIndex} is out of bounds [0, ${playerCount - 1}].`
    );
  }

  // 3. Discard pile not empty
  if (state.discardPile.length === 0) {
    throw new AttackInvariantViolationError('Discard pile cannot be empty.');
  }

  const topCardInPile = state.discardPile[state.discardPile.length - 1];
  if (state.topDiscardCard.id !== topCardInPile.id) {
    throw new AttackInvariantViolationError(
      `topDiscardCard "${state.topDiscardCard.id}" does not match last card in discard pile "${topCardInPile.id}".`
    );
  }

  // 4. Launcher tension level in valid bounds [0, 4]
  if (state.attackLauncherState) {
    const tension = state.attackLauncherState.tension;
    if (tension < 0 || tension > ATTACK_LAUNCHER_CONFIG.MAX_TENSION_LEVEL) {
      throw new AttackInvariantViolationError(
        `Launcher tension ${tension} is out of bounds [0, ${ATTACK_LAUNCHER_CONFIG.MAX_TENSION_LEVEL}].`
      );
    }
  }

  // 5. Total card conservation across draw pile, discard pile, and hands (109 base + 1..3 customizable cards)
  const allCardIds = new Set<string>();
  let totalCards = 0;
  let customizableCount = 0;

  for (const card of state.drawPile) {
    if (allCardIds.has(card.id)) {
      throw new AttackInvariantViolationError(`Duplicate card ID detected: "${card.id}" in draw pile.`);
    }
    allCardIds.add(card.id);
    if (card.value === 'wild_customizable') {
      customizableCount++;
    }
    totalCards++;
  }

  for (const card of state.discardPile) {
    if (allCardIds.has(card.id)) {
      throw new AttackInvariantViolationError(`Duplicate card ID detected: "${card.id}" in discard pile.`);
    }
    allCardIds.add(card.id);
    if (card.value === 'wild_customizable') {
      customizableCount++;
    }
    totalCards++;
  }

  for (const player of state.players) {
    for (const card of player.hand) {
      if (allCardIds.has(card.id)) {
        throw new AttackInvariantViolationError(
          `Duplicate card ID detected: "${card.id}" in hand of player "${player.id}".`
        );
      }
      allCardIds.add(card.id);
      if (card.value === 'wild_customizable') {
        customizableCount++;
      }
      totalCards++;
    }
  }

  if (
    customizableCount < UNO_ATTACK_RULES.MIN_CUSTOMIZABLE_CARDS_COUNT ||
    customizableCount > UNO_ATTACK_RULES.MAX_CUSTOMIZABLE_CARDS_COUNT
  ) {
    throw new AttackInvariantViolationError(
      `Invalid Wild Customizable card count ${customizableCount}. Expected between ${UNO_ATTACK_RULES.MIN_CUSTOMIZABLE_CARDS_COUNT} and ${UNO_ATTACK_RULES.MAX_CUSTOMIZABLE_CARDS_COUNT}.`
    );
  }

  if (
    state.attackCustomizableCount !== undefined &&
    customizableCount !== state.attackCustomizableCount
  ) {
    throw new AttackInvariantViolationError(
      `Wild Customizable card count ${customizableCount} does not match configured count ${state.attackCustomizableCount}.`
    );
  }

  const expectedTotalCards = UNO_ATTACK_RULES.BASE_CARDS_COUNT + customizableCount;
  if (totalCards !== expectedTotalCards) {
    throw new AttackInvariantViolationError(
      `Total card conservation violated: found ${totalCards} cards, expected ${expectedTotalCards} (${UNO_ATTACK_RULES.BASE_CARDS_COUNT} base + ${customizableCount} customizable).`
    );
  }
}

export function validateAttackGameStateInvariants(
  state: GameState
): { valid: boolean; totalCards: number; errors: string[] } {
  const errors: string[] = [];
  let totalCards = 0;
  try {
    totalCards =
      state.drawPile.length +
      state.discardPile.length +
      state.players.reduce((sum, p) => sum + p.hand.length, 0);
    assertValidAttackGameState(state);
    return { valid: true, totalCards, errors: [] };
  } catch (err: unknown) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { valid: false, totalCards, errors };
  }
}
