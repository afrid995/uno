import { GameState } from '../../game/game.types';
import { Card } from '../../cards/card.types';
import { FlipDeckFactory } from './flip.deck';
import { FLIP_LIGHT_COLORS, FLIP_DARK_COLORS, UNO_FLIP_RULES } from './flip.constants';

export interface FlipInvariantValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Pure invariant validator for UNO Flip game states.
 * Enforces strict physical card conservation (112 cards), ID uniqueness,
 * dual-face integrity, active-side face consistency, and discard/pending invariants.
 */
export function validateFlipGameStateInvariants(state: GameState): FlipInvariantValidationResult {
  const errors: string[] = [];

  // 1. Variant check
  if (state.variant !== 'uno_flip') {
    errors.push(`Variant must be 'uno_flip', received '${state.variant}'`);
  }

  // 2. Active side check
  const activeSide = state.activeSide;
  if (activeSide !== 'LIGHT' && activeSide !== 'DARK') {
    errors.push(`Active side must be 'LIGHT' or 'DARK', received '${String(activeSide)}'`);
  }

  // 3. Card collection & physical card count
  const allCards: Card[] = [];
  if (
    !Array.isArray(state.players) ||
    state.players.length < UNO_FLIP_RULES.MIN_PLAYERS ||
    state.players.length > UNO_FLIP_RULES.MAX_PLAYERS
  ) {
    errors.push(
      `Player count must be between ${UNO_FLIP_RULES.MIN_PLAYERS} and ${UNO_FLIP_RULES.MAX_PLAYERS}`
    );
  } else {
    for (const player of state.players) {
      if (!Array.isArray(player.hand)) {
        errors.push(`Player ${player.id} has an invalid hand`);
      } else {
        allCards.push(...player.hand);
      }
    }
  }

  if (!Array.isArray(state.drawPile)) {
    errors.push('Draw pile must be an array');
  } else {
    allCards.push(...state.drawPile);
  }

  if (!Array.isArray(state.discardPile)) {
    errors.push('Discard pile must be an array');
  } else {
    allCards.push(...state.discardPile);
  }

  // Exact 112 physical card conservation
  if (allCards.length !== 112) {
    errors.push(
      `Card conservation violation: expected exactly 112 cards in total (hands + drawPile + discardPile), found ${allCards.length}`
    );
  }

  // 4. Physical card uniqueness
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const card of allCards) {
    if (!card || typeof card.id !== 'string') {
      errors.push('Encountered null or invalid card object');
      continue;
    }
    if (seenIds.has(card.id)) {
      duplicateIds.add(card.id);
    }
    seenIds.add(card.id);
  }
  if (duplicateIds.size > 0) {
    errors.push(`Duplicate physical card IDs detected: ${Array.from(duplicateIds).join(', ')}`);
  }
  if (seenIds.size !== 112 && allCards.length === 112) {
    errors.push(`Expected 112 unique card IDs, found ${seenIds.size}`);
  }

  // 5. Canonical card face comparison
  const canonicalDeck = FlipDeckFactory.createFlipDeck();
  const canonicalMap = new Map(canonicalDeck.map((c) => [c.id, c]));

  for (const card of allCards) {
    const canonical = canonicalMap.get(card.id);
    if (!canonical) {
      errors.push(`Card ${card.id} does not match any canonical physical card ID in UNO Flip`);
      continue;
    }

    if (!card.lightFace || !card.darkFace) {
      errors.push(`Card ${card.id} is missing lightFace or darkFace definition`);
      continue;
    }

    if (
      card.lightFace.color !== canonical.lightFace.color ||
      card.lightFace.value !== canonical.lightFace.value ||
      card.lightFace.type !== canonical.lightFace.type ||
      card.lightFace.scoreValue !== canonical.lightFace.scoreValue
    ) {
      errors.push(`Card ${card.id} lightFace does not match canonical face`);
    }

    if (
      card.darkFace.color !== canonical.darkFace.color ||
      card.darkFace.value !== canonical.darkFace.value ||
      card.darkFace.type !== canonical.darkFace.type ||
      card.darkFace.scoreValue !== canonical.darkFace.scoreValue
    ) {
      errors.push(`Card ${card.id} darkFace does not match canonical face`);
    }

    // 6. Active face representation alignment
    if (activeSide === 'LIGHT') {
      if (
        card.color !== card.lightFace.color ||
        card.value !== card.lightFace.value ||
        card.type !== card.lightFace.type ||
        card.scoreValue !== card.lightFace.scoreValue ||
        (card.currentSide && card.currentSide !== 'LIGHT')
      ) {
        errors.push(`Card ${card.id} does not expose correct LIGHT face representation`);
      }
    } else if (activeSide === 'DARK') {
      if (
        card.color !== card.darkFace.color ||
        card.value !== card.darkFace.value ||
        card.type !== card.darkFace.type ||
        card.scoreValue !== card.darkFace.scoreValue ||
        card.currentSide !== 'DARK'
      ) {
        errors.push(`Card ${card.id} does not expose correct DARK face representation`);
      }
    }
  }

  // 7. Discard pile and top discard card consistency
  if (state.discardPile.length === 0) {
    errors.push('Discard pile cannot be empty');
  } else {
    const topCardInPile = state.discardPile[state.discardPile.length - 1];
    if (!state.topDiscardCard) {
      errors.push('topDiscardCard must be defined');
    } else {
      if (state.topDiscardCard.id !== topCardInPile.id) {
        errors.push(
          `topDiscardCard ID (${state.topDiscardCard.id}) does not match last card in discard pile (${topCardInPile.id})`
        );
      }
      if (
        state.topDiscardCard.value !== topCardInPile.value ||
        state.topDiscardCard.color !== topCardInPile.color
      ) {
        errors.push('topDiscardCard attributes do not match last card in discard pile');
      }
    }
  }

  // 8. Active color consistency
  const isAwaitingWild = state.pendingActionState?.type === 'AWAITING_STARTING_WILD_COLOR_SELECTION';
  if (isAwaitingWild) {
    if (state.activeColor !== null) {
      errors.push(
        `activeColor must be null while awaiting starting Wild color selection, received '${String(state.activeColor)}'`
      );
    }
  } else {
    if (state.topDiscardCard) {
      if (state.topDiscardCard.type !== 'wild') {
        if (state.activeColor !== state.topDiscardCard.color) {
          errors.push(
            `activeColor (${String(state.activeColor)}) must match topDiscardCard color (${String(state.topDiscardCard.color)})`
          );
        }
      } else {
        if (!state.activeColor) {
          errors.push('activeColor must be set when top card is Wild and not awaiting starting selection');
        } else {
          const validColors = (activeSide === 'LIGHT' ? FLIP_LIGHT_COLORS : FLIP_DARK_COLORS) as readonly string[];
          if (!validColors.includes(state.activeColor)) {
            errors.push(`activeColor '${state.activeColor}' is invalid for ${activeSide} side`);
          }
        }
      }
    }
  }

  // 9. Starting Wild pending state consistency
  if (isAwaitingWild) {
    if (state.activeSide !== 'LIGHT') {
      errors.push('Starting Wild state can only occur on LIGHT side');
    }
    if (state.topDiscardCard?.value !== 'wild') {
      errors.push(
        `Starting Wild state requires topDiscardCard to be 'wild', found '${state.topDiscardCard?.value}'`
      );
    }
    const expectedDesignatedPlayer = state.players[(state.dealerIndex + 1) % state.players.length]?.id;
    if (state.pendingActionState?.designatedPlayerId !== expectedDesignatedPlayer) {
      errors.push(
        `Starting Wild designated chooser must be player to dealer left (${expectedDesignatedPlayer}), found '${state.pendingActionState?.designatedPlayerId}'`
      );
    }
    if (state.currentPlayerIndex !== (state.dealerIndex + 1) % state.players.length) {
      errors.push('Starting Wild currentPlayerIndex must be set to the designated chooser');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Asserts that a GameState satisfies all UNO Flip invariants:
 * exactly 112 physical cards, unique IDs, dual-face integrity, active-side representation,
 * discard consistency, and valid starting Wild state.
 * Throws an Error with detailed bulleted violation reasons if any invariant fails.
 */
export function assertValidFlipGameState(state: GameState): void {
  const result = validateFlipGameStateInvariants(state);
  if (!result.valid) {
    throw new Error(`Flip Game State Invariant Violation:\n - ${result.errors.join('\n - ')}`);
  }
}
