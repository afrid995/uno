import { GameState } from '../../game/game.types';
import { Card } from '../../cards/card.types';
import { UNO_NO_MERCY_RULES } from './no-mercy.constants';

export interface NoMercyInvariantValidationResult {
  readonly valid: boolean;
  readonly totalCards: number;
  readonly errors: readonly string[];
}

/**
 * Authoritative invariant validator for UNO Show 'em No Mercy (HWV18).
 * Strictly checks:
 * 1. Physical 168-card conservation across drawPile, discardPile, hands, and setAsideCards.
 * 2. Uniqueness of every card ID.
 * 3. Mercy Rule compliance: active players must hold < 25 cards; eliminated players hold 0 cards.
 * 4. Turn order integrity: current active player must be non-eliminated.
 * 5. Pending states internal consistency (Stacking, 7s Swap, Color Roulette).
 */
export function validateNoMercyGameStateInvariants(
  state: GameState
): NoMercyInvariantValidationResult {
  const errors: string[] = [];

  if (state.variant !== 'uno_show_em_no_mercy') {
    errors.push(`Invalid variant "${state.variant}"; expected "uno_show_em_no_mercy".`);
  }

  // 1. Collect all physical cards across zones
  const allCards: Card[] = [
    ...state.drawPile,
    ...state.discardPile,
    ...state.players.flatMap((p) => p.hand),
    ...(state.setAsideCards ?? []),
  ];

  const totalCards = allCards.length;

  // Exact 168-card conservation
  if (totalCards !== UNO_NO_MERCY_RULES.DECK_SIZE) {
    errors.push(
      `Card conservation violated: expected exactly ${UNO_NO_MERCY_RULES.DECK_SIZE} cards in existence, found ${totalCards}.`
    );
  }

  // 2. Strict ID uniqueness (no lost or duplicated physical cards)
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();

  for (const card of allCards) {
    if (!card || !card.id) {
      errors.push('Found card instance with missing or invalid ID.');
      continue;
    }
    if (seenIds.has(card.id)) {
      duplicateIds.add(card.id);
    }
    seenIds.add(card.id);
  }

  if (duplicateIds.size > 0) {
    errors.push(`Duplicate card IDs detected: ${Array.from(duplicateIds).join(', ')}`);
  }

  // Discard pile must not be empty
  if (state.discardPile.length === 0) {
    errors.push('Discard pile is empty.');
  } else {
    const topCard = state.discardPile[state.discardPile.length - 1];
    if (state.topDiscardCard.id !== topCard.id) {
      errors.push(
        `Top discard card mismatch: state.topDiscardCard (${state.topDiscardCard.id}) does not match top of discard pile (${topCard.id}).`
      );
    }
  }

  // 3. Mercy Rule invariants
  const eliminatedSet = new Set<string>(state.eliminatedPlayerIds ?? []);
  const activePlayers = state.players.filter((p) => !p.isEliminated && !eliminatedSet.has(p.id));

  for (const player of state.players) {
    const isEliminated = player.isEliminated || eliminatedSet.has(player.id);
    if (isEliminated) {
      if (player.hand.length !== 0) {
        errors.push(
          `Eliminated player ${player.id} (${player.username}) still holds ${player.hand.length} cards; eliminated cards must be set aside.`
        );
      }
    } else {
      if (player.hand.length >= UNO_NO_MERCY_RULES.MERCY_HAND_LIMIT) {
        errors.push(
          `Mercy Rule violation: Active player ${player.id} (${player.username}) holds ${player.hand.length} cards (>= ${UNO_NO_MERCY_RULES.MERCY_HAND_LIMIT}) without being eliminated.`
        );
      }
    }
  }

  // 4. Turn order integrity (only when match is actively in progress)
  if (state.status === 'IN_PROGRESS' && activePlayers.length > 0) {
    const currentPlayer = state.players[state.currentPlayerIndex];
    if (!currentPlayer) {
      errors.push(`Current player index ${state.currentPlayerIndex} is out of bounds.`);
    } else if (currentPlayer.isEliminated || eliminatedSet.has(currentPlayer.id)) {
      errors.push(
        `Current player index points to eliminated player ${currentPlayer.id} (${currentPlayer.username}).`
      );
    }
  }

  // 5. Pending state consistency
  if (state.pendingActionState) {
    const pending = state.pendingActionState;
    if (pending.type === 'AWAITING_STACK_RESOLUTION') {
      if (pending.accumulatedPenalty < 2) {
        errors.push(`Invalid stack penalty accumulated: ${pending.accumulatedPenalty}; expected >= 2.`);
      }
      if (![2, 4, 6, 10].includes(pending.lastStackedValue)) {
        errors.push(`Invalid lastStackedValue: ${pending.lastStackedValue}; expected 2, 4, 6, or 10.`);
      }
      const target = state.players.find((p) => p.id === pending.targetPlayerId);
      if (!target || target.isEliminated || eliminatedSet.has(target.id)) {
        errors.push(`Stack target player ${pending.targetPlayerId} is invalid or eliminated.`);
      }
    } else if (pending.type === 'AWAITING_7S_SWAP_SELECTION') {
      const source = state.players.find((p) => p.id === pending.sourcePlayerId);
      if (!source || source.isEliminated || eliminatedSet.has(source.id)) {
        errors.push(`7s Swap source player ${pending.sourcePlayerId} is invalid or eliminated.`);
      }
    } else if (pending.type === 'AWAITING_COLOR_ROULETTE_SELECTION') {
      const victim = state.players.find((p) => p.id === pending.victimPlayerId);
      if (!victim || victim.isEliminated || eliminatedSet.has(victim.id)) {
        errors.push(`Color Roulette victim player ${pending.victimPlayerId} is invalid or eliminated.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    totalCards,
    errors,
  };
}

export function assertValidNoMercyGameState(state: GameState): void {
  const result = validateNoMercyGameStateInvariants(state);
  if (!result.valid) {
    throw new Error(
      `UNO Show 'em No Mercy state invariant violation(s):\n- ${result.errors.join('\n- ')}`
    );
  }
}
