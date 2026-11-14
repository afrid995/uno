import { GameState, GameConfig } from '../../game/game.types';
import { Card, FlipSide, CardColor } from '../../cards/card.types';
import { FlipDeckFactory } from './flip.deck';
import { assertValidFlipGameState } from './flip.invariants';
import { VariantRegistry } from '../variant.types';

export interface FlipFixtureOptions {
  matchId?: string;
  roomId?: string;
  players?: { id: string; username: string }[];
  dealerIndex?: number;
  activeSide?: FlipSide;
}

export class FlipFixtureBuilder {
  /**
   * Constructs a canonical, valid 112-card UNO Flip GameState fixture.
   */
  static createInitialGameFixture(options: FlipFixtureOptions = {}): GameState {
    const roomId = options.roomId ?? 'fixture_room_1';
    const players = options.players ?? [
      { id: 'p1', username: 'Alice' },
      { id: 'p2', username: 'Bob' },
    ];
    const dealerIndex = options.dealerIndex ?? 0;
    const activeSide = options.activeSide ?? 'LIGHT';

    const config: GameConfig = {
      matchId: options.matchId,
      roomId,
      players,
      variant: 'uno_flip',
      dealerIndex,
    };

    const adapter = VariantRegistry.get('uno_flip');
    let state = adapter.createGame(config);

    if (activeSide === 'LIGHT' && state.activeSide === 'DARK') {
      // If createGame turned up a Flip card and started on DARK, but fixture requested LIGHT,
      // flip back to LIGHT side canonically
      state = {
        ...state,
        activeSide: 'LIGHT',
        topDiscardCard: FlipDeckFactory.flipCard(state.topDiscardCard, 'LIGHT'),
        discardPile: state.discardPile.map((c) => FlipDeckFactory.flipCard(c, 'LIGHT')),
        drawPile: state.drawPile.map((c) => FlipDeckFactory.flipCard(c, 'LIGHT')),
        players: state.players.map((p) => ({
          ...p,
          hand: p.hand.map((c) => FlipDeckFactory.flipCard(c, 'LIGHT')),
        })),
        activeColor: state.topDiscardCard.lightFace?.color ?? 'blue',
      };
    } else if (activeSide === 'DARK' && state.activeSide === 'LIGHT') {
      // Transition to DARK side canonically
      state = {
        ...state,
        activeSide: 'DARK',
        topDiscardCard: FlipDeckFactory.flipCard(state.topDiscardCard, 'DARK'),
        discardPile: state.discardPile.map((c) => FlipDeckFactory.flipCard(c, 'DARK')),
        drawPile: state.drawPile.map((c) => FlipDeckFactory.flipCard(c, 'DARK')),
        players: state.players.map((p) => ({
          ...p,
          hand: p.hand.map((c) => FlipDeckFactory.flipCard(c, 'DARK')),
        })),
        activeColor: state.topDiscardCard.darkFace?.color ?? 'teal',
        pendingActionState: null,
      };
    }

    if (state.pendingActionState?.type === 'AWAITING_STARTING_WILD_COLOR_SELECTION') {
      const defaultColor = state.activeSide === 'DARK' ? 'teal' : 'blue';
      state = {
        ...state,
        activeColor: defaultColor,
        pendingActionState: null,
      };
    }

    assertValidFlipGameState(state);
    return state;
  }

  /**
   * Safely injects a playable Flip card into the active player's hand by swapping
   * with an existing card from within the game's existing physical inventory.
   *
   * Enforces:
   * - 112 physical cards strictly conserved.
   * - Unique card IDs preserved.
   * - No card created or destroyed.
   * - All other players' hands and sizes preserved.
   * - Discard pile preserved.
   * - Injected Flip card is guaranteed playable on the current top discard.
   */
  static injectPlayableFlipCard(
    state: GameState,
    targetPlayerId?: string
  ): { nextState: GameState; injectedCard: Card } {
    assertValidFlipGameState(state);

    const activeSide = state.activeSide ?? 'LIGHT';
    const targetPlayerIndex = targetPlayerId
      ? state.players.findIndex((p) => p.id === targetPlayerId)
      : state.currentPlayerIndex;

    if (targetPlayerIndex === -1) {
      throw new Error(`Target player ${targetPlayerId} not found in game state`);
    }

    const targetPlayer = state.players[targetPlayerIndex];

    // Determine target color for playability
    const targetColor: CardColor =
      state.activeColor ??
      state.topDiscardCard.color ??
      (activeSide === 'LIGHT' ? 'blue' : 'teal');

    // Check if target player already holds a matching Flip card
    const existingMatchingFlip = targetPlayer.hand.find(
      (c) => c.value === 'flip' && (c.color === targetColor || state.topDiscardCard.value === 'flip')
    );

    if (existingMatchingFlip) {
      // Re-order hand so the matching Flip card is at index 0 for easy UI interaction
      const reorderedHand = [
        existingMatchingFlip,
        ...targetPlayer.hand.filter((c) => c.id !== existingMatchingFlip.id),
      ];

      const resolvedActiveColor =
        state.pendingActionState?.type === 'AWAITING_STARTING_WILD_COLOR_SELECTION'
          ? (existingMatchingFlip.color as CardColor)
          : state.activeColor;

      const nextState: GameState = {
        ...state,
        activeColor: resolvedActiveColor,
        pendingActionState:
          state.pendingActionState?.type === 'AWAITING_STARTING_WILD_COLOR_SELECTION'
            ? null
            : state.pendingActionState,
        players: state.players.map((p, idx) =>
          idx === targetPlayerIndex ? { ...p, hand: reorderedHand } : p
        ),
      };

      assertValidFlipGameState(nextState);
      return { nextState, injectedCard: existingMatchingFlip };
    }

    // Locate a matching physical Flip card in the existing game state
    // Priority: drawPile -> other players -> deep in discardPile
    let flipCardLocation: 'drawPile' | 'opponent' | 'discardPile' | null = null;
    let flipCardIndex = -1;
    let opponentIndex = -1;
    let foundFlipCard: Card | null = null;

    // 1. Search drawPile
    for (let i = 0; i < state.drawPile.length; i++) {
      const c = state.drawPile[i];
      if (c.value === 'flip' && c.color === targetColor) {
        foundFlipCard = c;
        flipCardLocation = 'drawPile';
        flipCardIndex = i;
        break;
      }
    }

    // 2. Search opponents' hands
    if (!foundFlipCard) {
      for (let pIdx = 0; pIdx < state.players.length; pIdx++) {
        if (pIdx === targetPlayerIndex) continue;
        const hand = state.players[pIdx].hand;
        for (let i = 0; i < hand.length; i++) {
          const c = hand[i];
          if (c.value === 'flip' && c.color === targetColor) {
            foundFlipCard = c;
            flipCardLocation = 'opponent';
            opponentIndex = pIdx;
            flipCardIndex = i;
            break;
          }
        }
        if (foundFlipCard) break;
      }
    }

    // 3. Search deep discard pile (excluding the top visible discard card)
    if (!foundFlipCard && state.discardPile.length > 1) {
      for (let i = 0; i < state.discardPile.length - 1; i++) {
        const c = state.discardPile[i];
        if (c.value === 'flip' && c.color === targetColor) {
          foundFlipCard = c;
          flipCardLocation = 'discardPile';
          flipCardIndex = i;
          break;
        }
      }
    }

    // Fallback: If no Flip card of targetColor was found, find ANY Flip card in drawPile
    // and also find a number card of that Flip card's color in drawPile to swap into top discard
    let needsDiscardTopSwap = false;
    let discardReplacementCard: Card | null = null;

    if (!foundFlipCard) {
      for (let i = 0; i < state.drawPile.length; i++) {
        const c = state.drawPile[i];
        if (c.value === 'flip') {
          foundFlipCard = c;
          flipCardLocation = 'drawPile';
          flipCardIndex = i;
          break;
        }
      }

      if (foundFlipCard && foundFlipCard.color !== targetColor) {
        // Find a card in drawPile matching foundFlipCard.color to become the new top discard
        const flipColor = foundFlipCard.color;
        for (let i = 0; i < state.drawPile.length; i++) {
          if (i === flipCardIndex) continue;
          const c = state.drawPile[i];
          if (c.color === flipColor) {
            discardReplacementCard = c;
            needsDiscardTopSwap = true;
            break;
          }
        }
      }
    }

    if (!foundFlipCard) {
      throw new Error(
        `Unable to locate a physical Flip card within the existing game inventory for side ${activeSide}`
      );
    }

    // Pick a card from targetPlayer.hand to swap with foundFlipCard
    const swapOutCardIndex = targetPlayer.hand.findIndex((c) => c.value !== 'flip');
    const swapOutCard =
      swapOutCardIndex !== -1 ? targetPlayer.hand[swapOutCardIndex] : targetPlayer.hand[0];

    // Build next state with atomic card swap
    const newDrawPile = [...state.drawPile];
    const newDiscardPile = [...state.discardPile];
    const newPlayers = state.players.map((p) => ({ ...p, hand: [...p.hand] }));

    if (flipCardLocation === 'drawPile') {
      newDrawPile[flipCardIndex] = swapOutCard;
    } else if (flipCardLocation === 'opponent') {
      newPlayers[opponentIndex].hand[flipCardIndex] = swapOutCard;
    } else if (flipCardLocation === 'discardPile') {
      newDiscardPile[flipCardIndex] = swapOutCard;
    }

    // Place foundFlipCard at index 0 of targetPlayer.hand
    const targetNewHand = [
      foundFlipCard,
      ...targetPlayer.hand.filter((c) => c.id !== swapOutCard.id),
    ];
    newPlayers[targetPlayerIndex] = {
      ...targetPlayer,
      hand: targetNewHand,
    };

    let newTopDiscard = state.topDiscardCard;
    let newActiveColor = state.activeColor;

    if (needsDiscardTopSwap && discardReplacementCard) {
      // Swap old top discard into drawPile at discardReplacementCard's position
      const oldTopDiscard = state.topDiscardCard;
      const repIdx = newDrawPile.findIndex((c) => c.id === discardReplacementCard.id);
      if (repIdx !== -1) {
        newDrawPile[repIdx] = oldTopDiscard;
      }
      newDiscardPile[newDiscardPile.length - 1] = discardReplacementCard;
      newTopDiscard = discardReplacementCard;
      newActiveColor = discardReplacementCard.color;
    }

    const resolvedActiveColor =
      state.pendingActionState?.type === 'AWAITING_STARTING_WILD_COLOR_SELECTION'
        ? (foundFlipCard.color as CardColor)
        : newActiveColor;

    const nextState: GameState = {
      ...state,
      drawPile: newDrawPile,
      discardPile: newDiscardPile,
      topDiscardCard: newTopDiscard,
      activeColor: resolvedActiveColor,
      players: newPlayers,
      pendingActionState:
        state.pendingActionState?.type === 'AWAITING_STARTING_WILD_COLOR_SELECTION'
          ? null
          : needsDiscardTopSwap
          ? null
          : state.pendingActionState,
    };

    assertValidFlipGameState(nextState);
    return { nextState, injectedCard: foundFlipCard };
  }

  /**
   * Safely injects an opening Starting Wild state by swapping a physical Wild card
   * from the existing draw pile onto the discard pile, preserving all 112 cards.
   *
   * Enforces:
   * - Canonical physical Wild card from within the game.
   * - Old discard card safely placed into the draw pile.
   * - 112 physical cards strictly conserved.
   * - activeColor set to null.
   * - pendingActionState set to AWAITING_STARTING_WILD_COLOR_SELECTION.
   * - Designated chooser set to player to dealer's left.
   * - Active side remains LIGHT.
   */
  static injectStartingWild(state: GameState): { nextState: GameState; wildCard: Card } {
    assertValidFlipGameState(state);

    if (state.activeSide !== 'LIGHT') {
      throw new Error('Starting Wild state can only be established on the LIGHT side.');
    }

    // If topDiscardCard is already Wild and awaiting color, return as is
    if (
      state.topDiscardCard.value === 'wild' &&
      state.pendingActionState?.type === 'AWAITING_STARTING_WILD_COLOR_SELECTION'
    ) {
      return { nextState: state, wildCard: state.topDiscardCard };
    }

    // Locate a physical Wild card in the game's existing drawPile
    const wildIndex = state.drawPile.findIndex((c) => c.lightFace?.value === 'wild');
    let wildCard: Card;
    const newDrawPile = [...state.drawPile];
    const newPlayers = state.players.map((p) => ({ ...p, hand: [...p.hand] }));

    if (wildIndex !== -1) {
      wildCard = state.drawPile[wildIndex];
      // Put the current top discard card into the drawPile at wildIndex
      const oldTopDiscard = state.topDiscardCard;
      newDrawPile[wildIndex] = oldTopDiscard;
    } else {
      // Search in players' hands
      let foundPlayerIdx = -1;
      let foundCardIdx = -1;
      for (let pIdx = 0; pIdx < state.players.length; pIdx++) {
        const hand = state.players[pIdx].hand;
        for (let cIdx = 0; cIdx < hand.length; cIdx++) {
          if (hand[cIdx]?.lightFace?.value === 'wild') {
            foundPlayerIdx = pIdx;
            foundCardIdx = cIdx;
            break;
          }
        }
        if (foundPlayerIdx !== -1) break;
      }

      if (foundPlayerIdx === -1) {
        throw new Error('No physical Wild card found in existing game inventory.');
      }

      wildCard = newPlayers[foundPlayerIdx].hand[foundCardIdx];
      // Swap wildCard with old top discard, and old top discard goes to player's hand
      newPlayers[foundPlayerIdx].hand[foundCardIdx] = state.topDiscardCard;
    }

    const activeWild = FlipDeckFactory.flipCard(wildCard, 'LIGHT');
    const newDiscardPile = [activeWild];

    const dealerIdx = state.dealerIndex;
    const designatedIdx = (dealerIdx + 1) % state.players.length;
    const designatedPlayerId = state.players[designatedIdx].id;

    const nextState: GameState = {
      ...state,
      topDiscardCard: activeWild,
      discardPile: newDiscardPile,
      drawPile: newDrawPile,
      players: newPlayers,
      activeColor: null,
      activeSide: 'LIGHT',
      currentPlayerIndex: designatedIdx,
      pendingActionState: {
        type: 'AWAITING_STARTING_WILD_COLOR_SELECTION',
        designatedPlayerId,
      },
    };

    assertValidFlipGameState(nextState);
    return { nextState, wildCard: activeWild };
  }
}
