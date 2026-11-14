import { GameState, GameConfig } from '../../game/game.types';
import { Card, AllWildCardValue } from '../../cards/card.types';
import { assertValidAllWildGameState } from './all-wild.invariants';
import { VariantRegistry } from '../variant.types';

export interface AllWildFixtureOptions {
  matchId?: string;
  roomId?: string;
  players?: { id: string; username: string }[];
  dealerIndex?: number;
}

export class AllWildFixtureBuilder {
  /**
   * Constructs a canonical, valid 112-card UNO All Wild GameState fixture.
   */
  static createInitialGameFixture(options: AllWildFixtureOptions = {}): GameState {
    const roomId = options.roomId ?? 'fixture_all_wild_room_1';
    const players = options.players ?? [
      { id: 'p1', username: 'Alice' },
      { id: 'p2', username: 'Bob' },
    ];
    const dealerIndex = options.dealerIndex ?? 0;

    const config: GameConfig = {
      matchId: options.matchId,
      roomId,
      players,
      variant: 'uno_all_wild',
      dealerIndex,
    };

    const adapter = VariantRegistry.get('uno_all_wild');
    const state = adapter.createGame(config);

    assertValidAllWildGameState(state);
    return state;
  }

  /**
   * Safely swaps a card matching the predicate into the target player's hand
   * while strictly maintaining physical card conservation and unique card identities.
   */
  static swapCardIntoHand(
    state: GameState,
    targetPlayerId: string,
    predicate: (card: Card) => boolean
  ): { nextState: GameState; card: Card } {
    assertValidAllWildGameState(state);

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

    assertValidAllWildGameState(nextState);
    return { nextState, card: cardToInject };
  }

  /**
   * Injects a card with specific value into target player's hand.
   */
  static injectPlayableCard(
    state: GameState,
    targetPlayerId: string,
    value: AllWildCardValue
  ): { nextState: GameState; card: Card } {
    return this.swapCardIntoHand(state, targetPlayerId, (c) => c.value === value);
  }

  /**
   * Adjusts target player's hand size to exact count for UNO/victory testing.
   * Transfers cards between drawPile and player's hand while maintaining 112-card conservation.
   */
  static setHandSize(
    state: GameState,
    targetPlayerId: string,
    targetCount: number
  ): GameState {
    assertValidAllWildGameState(state);

    if (targetCount < 1) {
      throw new Error(`Invalid targetCount ${targetCount}. Must be at least 1.`);
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

    assertValidAllWildGameState(nextState);
    return nextState;
  }
}
