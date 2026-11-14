import { GameState, GameConfig } from '../../game/game.types';
import { Card, CardColor } from '../../cards/card.types';
import { PowerCardStatus } from '../../players/player.types';
import { assertValidFlexGameState } from './flex.invariants';
import { VariantRegistry } from '../variant.types';
import './flex.adapter';

export interface FlexFixtureOptions {
  matchId?: string;
  roomId?: string;
  players?: { id: string; username: string }[];
  dealerIndex?: number;
}

export class FlexFixtureBuilder {
  /**
   * Constructs a canonical, valid 104-card playing deck UNO Flex GameState fixture.
   */
  static createInitialGameFixture(options: FlexFixtureOptions = {}): GameState {
    const roomId = options.roomId ?? 'fixture_flex_room_1';
    const players = options.players ?? [
      { id: 'p1', username: 'Alice' },
      { id: 'p2', username: 'Bob' },
    ];
    // Default dealer is last player so player 0 (Alice) goes first
    const dealerIndex = options.dealerIndex ?? players.length - 1;

    const config: GameConfig = {
      matchId: options.matchId,
      roomId,
      players,
      variant: 'uno_flex',
      dealerIndex,
    };

    const adapter = VariantRegistry.get('uno_flex');
    const state = adapter.createGame(config);

    assertValidFlexGameState(state);
    return state;
  }

  /**
   * Updates Power Card status for a given player while keeping state valid.
   */
  static setPowerCardStatus(
    state: GameState,
    playerId: string,
    status: PowerCardStatus
  ): GameState {
    const nextPlayers = state.players.map((p) =>
      p.id === playerId ? { ...p, powerCardStatus: status } : p
    );
    const nextState: GameState = {
      ...state,
      players: nextPlayers,
    };
    assertValidFlexGameState(nextState);
    return nextState;
  }

  /**
   * Safely swaps a card matching the predicate into the target player's hand
   * while strictly maintaining physical 104-card conservation.
   */
  static swapCardIntoHand(
    state: GameState,
    targetPlayerId: string,
    predicate: (card: Card) => boolean,
    cardToEvictId?: string
  ): { nextState: GameState; card: Card } {
    assertValidFlexGameState(state);

    const playerIndex = state.players.findIndex((p) => p.id === targetPlayerId);
    if (playerIndex === -1) {
      throw new Error(`Player ${targetPlayerId} not found in state.`);
    }

    const player = state.players[playerIndex];

    // Check if player already holds matching card
    const existing = player.hand.find(predicate);
    if (existing) {
      return { nextState: state, card: existing };
    }

    if (!player.hand || player.hand.length === 0) {
      throw new Error(`Player ${targetPlayerId} has no cards to swap.`);
    }

    const evictIdx = cardToEvictId
      ? player.hand.findIndex((c) => c.id === cardToEvictId)
      : 0;
    const resolvedEvictIdx = evictIdx !== -1 ? evictIdx : 0;
    const cardToEvict = player.hand[resolvedEvictIdx];
    let cardToInject: Card | null = null;
    const nextDrawPile = [...state.drawPile];
    const nextDiscardPile = [...state.discardPile];
    const nextPlayers = state.players.map((p) => ({ ...p, hand: [...p.hand] }));

    // Search draw pile first
    const drawCardIndex = state.drawPile.findIndex(predicate);
    if (drawCardIndex !== -1) {
      cardToInject = state.drawPile[drawCardIndex];
      nextDrawPile[drawCardIndex] = cardToEvict;
    } else {
      // Search opponents' hands
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
        // Search deep discard pile (excluding top discard card)
        const discIdx = state.discardPile
          .slice(0, state.discardPile.length - 1)
          .findIndex(predicate);
        if (discIdx !== -1) {
          cardToInject = state.discardPile[discIdx];
          nextDiscardPile[discIdx] = cardToEvict;
        }
      }
    }

    if (!cardToInject) {
      throw new Error('No card matching predicate found in inventory to swap.');
    }

    // Replace evicted card in player's hand
    nextPlayers[playerIndex].hand[resolvedEvictIdx] = cardToInject;

    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      drawPile: nextDrawPile,
      discardPile: nextDiscardPile,
    };

    assertValidFlexGameState(nextState);
    return { nextState, card: cardToInject };
  }

  /**
   * Safely swaps a card matching the predicate to become the top discard card
   * and sets activeColor accordingly while conserving 104 cards.
   */
  static setTopDiscard(
    state: GameState,
    predicate: (card: Card) => boolean,
    customActiveColor?: CardColor
  ): { nextState: GameState; topCard: Card } {
    assertValidFlexGameState(state);

    const currentTop = state.topDiscardCard;
    if (predicate(currentTop)) {
      return { nextState: state, topCard: currentTop };
    }

    // Find card from drawPile, deep discard, or other hands
    let cardToPromote: Card | null = null;
    const nextDrawPile = [...state.drawPile];
    const nextDiscardPile = [...state.discardPile];
    const nextPlayers = state.players.map((p) => ({ ...p, hand: [...p.hand] }));

    const drawIdx = state.drawPile.findIndex(predicate);
    if (drawIdx !== -1) {
      cardToPromote = state.drawPile[drawIdx];
      nextDrawPile[drawIdx] = currentTop;
    } else {
      // Check deep discard
      const discIdx = state.discardPile
        .slice(0, state.discardPile.length - 1)
        .findIndex(predicate);
      if (discIdx !== -1) {
        cardToPromote = state.discardPile[discIdx];
        nextDiscardPile[discIdx] = currentTop;
      } else {
        // Check players (non-active first, then player 0)
        let foundPlayerIdx = -1;
        let foundCardIdx = -1;
        for (let i = 1; i < state.players.length; i++) {
          const pIdx = state.players[i].hand.findIndex(predicate);
          if (pIdx !== -1) {
            foundPlayerIdx = i;
            foundCardIdx = pIdx;
            break;
          }
        }
        if (foundPlayerIdx === -1 && state.players.length > 0) {
          const pIdx = state.players[0].hand.findIndex(predicate);
          if (pIdx !== -1) {
            foundPlayerIdx = 0;
            foundCardIdx = pIdx;
          }
        }

        if (foundPlayerIdx !== -1) {
          cardToPromote = state.players[foundPlayerIdx].hand[foundCardIdx];
          nextPlayers[foundPlayerIdx].hand[foundCardIdx] = currentTop;
        }
      }
    }

    if (!cardToPromote) {
      throw new Error('No card matching predicate found in inventory to set as top discard.');
    }

    nextDiscardPile[nextDiscardPile.length - 1] = cardToPromote;

    const nextActiveColor =
      customActiveColor !== undefined ? customActiveColor : cardToPromote.color;

    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      drawPile: nextDrawPile,
      discardPile: nextDiscardPile,
      topDiscardCard: cardToPromote,
      activeColor: nextActiveColor,
    };

    assertValidFlexGameState(nextState);
    return { nextState, topCard: cardToPromote };
  }

  /**
   * Injects a card matching value and optional color into target player's hand.
   */
  static injectPlayableCard(
    state: GameState,
    targetPlayerId: string,
    value: string,
    color?: CardColor
  ): { nextState: GameState; card: Card } {
    return this.swapCardIntoHand(state, targetPlayerId, (c) =>
      c.value === value && (color === undefined || c.color === color)
    );
  }

  /**
   * Adjusts target player's hand size to exact count for UNO/victory testing.
   * Transfers cards between drawPile and player's hand while maintaining 104-card conservation.
   */
  static setHandSize(
    state: GameState,
    targetPlayerId: string,
    targetCount: number
  ): GameState {
    assertValidFlexGameState(state);

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

    assertValidFlexGameState(nextState);
    return nextState;
  }
}
