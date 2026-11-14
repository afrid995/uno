import { GameState, GameConfig } from '../../game/game.types';
import { Card, CardColor } from '../../cards/card.types';
import { assertValidNoMercyGameState } from './no-mercy.invariants';
import { VariantRegistry } from '../variant.types';

export interface NoMercyFixtureOptions {
  matchId?: string;
  roomId?: string;
  players?: { id: string; username: string }[];
  dealerIndex?: number;
}

export class NoMercyFixtureBuilder {
  /**
   * Constructs a canonical, valid 168-card UNO Show 'em No Mercy GameState fixture.
   */
  static createInitialGameFixture(options: NoMercyFixtureOptions = {}): GameState {
    const roomId = options.roomId ?? 'fixture_no_mercy_room_1';
    const players = options.players ?? [
      { id: 'p1', username: 'Alice' },
      { id: 'p2', username: 'Bob' },
    ];
    const dealerIndex = options.dealerIndex ?? 0;

    const config: GameConfig = {
      matchId: options.matchId,
      roomId,
      players,
      variant: 'uno_show_em_no_mercy',
      dealerIndex,
    };

    const adapter = VariantRegistry.get('uno_show_em_no_mercy');
    const state = adapter.createGame(config);

    assertValidNoMercyGameState(state);
    return state;
  }

  /**
   * Safely swaps a card matching the predicate from the draw pile into target player's hand.
   * Strictly maintains 168-card conservation without creating or destroying cards.
   */
  static swapCardIntoHand(
    state: GameState,
    targetPlayerId: string,
    predicate: (card: Card) => boolean
  ): { nextState: GameState; card: Card } {
    assertValidNoMercyGameState(state);

    const playerIndex = state.players.findIndex((p) => p.id === targetPlayerId);
    if (playerIndex === -1) {
      throw new Error(`Player ${targetPlayerId} not found in state.`);
    }

    const player = state.players[playerIndex];

    // Check if player already holds a matching card
    const existing = player.hand.find(predicate);
    if (existing) {
      return { nextState: state, card: existing };
    }

    if (!player.hand || player.hand.length === 0) {
      throw new Error(`Player ${targetPlayerId} has no cards to swap.`);
    }

    // Find matching card across existing inventory: drawPile -> opponents -> deep discard
    const drawCardIndex = state.drawPile.findIndex(predicate);
    let cardToInject: Card | null = null;
    const nextDrawPile = [...state.drawPile];
    const nextDiscardPile = [...state.discardPile];
    const nextPlayers = state.players.map((p) => ({ ...p, hand: [...p.hand] }));
    const cardToEvict = player.hand[0];

    if (drawCardIndex !== -1) {
      cardToInject = state.drawPile[drawCardIndex];
      nextDrawPile[drawCardIndex] = cardToEvict;
    } else {
      // Search in opponents' hands
      let foundOpponentIdx = -1;
      let foundCardIdx = -1;
      for (let i = 0; i < state.players.length; i++) {
        if (i === playerIndex) continue;
        const cIdx = state.players[i].hand.findIndex(predicate);
        if (cIdx !== -1) {
          foundOpponentIdx = i;
          foundCardIdx = cIdx;
          break;
        }
      }

      if (foundOpponentIdx !== -1) {
        cardToInject = state.players[foundOpponentIdx].hand[foundCardIdx];
        nextPlayers[foundOpponentIdx].hand[foundCardIdx] = cardToEvict;
      } else if (state.discardPile.length > 1) {
        // Search in deep discard pile (excluding top discard card)
        const discIdx = state.discardPile.slice(0, state.discardPile.length - 1).findIndex(predicate);
        if (discIdx !== -1) {
          cardToInject = state.discardPile[discIdx];
          nextDiscardPile[discIdx] = cardToEvict;
        }
      }
    }

    if (!cardToInject) {
      throw new Error('No matching card found in existing game inventory to swap.');
    }

    const nextHand = [cardToInject, ...player.hand.slice(1)];
    nextPlayers[playerIndex] = { ...player, hand: nextHand };

    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      drawPile: nextDrawPile,
      discardPile: nextDiscardPile,
    };

    assertValidNoMercyGameState(nextState);
    return { nextState, card: cardToInject };
  }

  /**
   * Injects a specific card into player's hand, ensuring it can be played on current discard.
   */
  static injectPlayableCard(
    state: GameState,
    targetPlayerId: string,
    value: string,
    color?: CardColor
  ): { nextState: GameState; card: Card } {
    const targetColor = color ?? state.activeColor;
    return this.swapCardIntoHand(state, targetPlayerId, (c) => {
      if (c.value !== value) return false;
      if (targetColor && c.color !== targetColor && c.color !== null) return false;
      return true;
    });
  }

  /**
   * Adjusts target player's hand size to exact count for Mercy rule testing.
   * Transfers cards between drawPile and player's hand while maintaining 168-card conservation.
   * Target count is capped below MERCY_HAND_LIMIT (25) to avoid creating impossible active-player states.
   */
  static setHandSize(
    state: GameState,
    targetPlayerId: string,
    targetCount: number
  ): GameState {
    assertValidNoMercyGameState(state);

    if (targetCount < 1 || targetCount >= 25) {
      throw new Error(`Invalid targetCount ${targetCount}. Must be between 1 and 24 to preserve active player validity.`);
    }

    const playerIndex = state.players.findIndex((p) => p.id === targetPlayerId);
    if (playerIndex === -1) {
      throw new Error(`Player ${targetPlayerId} not found.`);
    }

    const player = state.players[playerIndex];
    const currentCount = player.hand.length;

    const nextDrawPile = [...state.drawPile];
    const nextHand = [...player.hand];

    if (targetCount > currentCount) {
      const needed = targetCount - currentCount;
      if (nextDrawPile.length < needed) {
        throw new Error(`Not enough cards in draw pile (${nextDrawPile.length}) to expand hand to ${targetCount}.`);
      }
      const drawn = nextDrawPile.splice(nextDrawPile.length - needed, needed);
      nextHand.push(...drawn);
    } else if (targetCount < currentCount) {
      const excess = currentCount - targetCount;
      const returned = nextHand.splice(nextHand.length - excess, excess);
      nextDrawPile.push(...returned);
    }

    const nextPlayers = state.players.map((p, idx) =>
      idx === playerIndex ? { ...p, hand: nextHand } : p
    );

    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      drawPile: nextDrawPile,
    };

    assertValidNoMercyGameState(nextState);
    return nextState;
  }
}
