import { GameState, GameConfig } from '../../game/game.types';
import { Card, CardColor } from '../../cards/card.types';
import { assertValidTeamsGameState } from './teams.invariants';
import { VariantRegistry } from '../variant.types';
import { TeamsDeckFactory } from './teams.deck';
import './teams.adapter';

export interface TeamsFixtureOptions {
  matchId?: string;
  roomId?: string;
  players?: { id: string; username: string }[];
  dealerIndex?: number;
}

export class TeamsFixtureBuilder {
  static createInitialGameFixture(options: TeamsFixtureOptions = {}): GameState {
    const roomId = options.roomId ?? 'fixture_teams_room_1';
    const players = options.players ?? [
      { id: 'p1', username: 'Alice' }, // Team 1
      { id: 'p2', username: 'Bob' },   // Team 2
      { id: 'p3', username: 'Charlie' }, // Team 1 (Alice partner)
      { id: 'p4', username: 'Dave' },  // Team 2 (Bob partner)
    ];
    // Default dealer is last player so player 0 (Alice) goes first
    const dealerIndex = options.dealerIndex ?? players.length - 1;

    const config: GameConfig = {
      matchId: options.matchId,
      roomId,
      players,
      variant: 'uno_teams',
      dealerIndex,
    };

    const adapter = VariantRegistry.get('uno_teams');
    const state = adapter.createGame(config);

    assertValidTeamsGameState(state);
    return state;
  }

  /**
   * Helper that completes the initial card pass for all players, transitioning
   * state from AWAITING_TEAM_INITIAL_PASS to active IN_PROGRESS gameplay.
   */
  static completeInitialPass(state: GameState): GameState {
    if (!state.pendingActionState || state.pendingActionState.type !== 'AWAITING_TEAM_INITIAL_PASS') {
      return state;
    }

    const adapter = VariantRegistry.get('uno_teams');
    let currentState = state;

    for (const player of currentState.players) {
      const cardToPass = player.hand[0];
      const res = adapter.processAction(currentState, {
        type: 'TEAM_INITIAL_PASS',
        playerId: player.id,
        cardId: cardToPass.id,
      });
      currentState = res.nextState;
    }

    return currentState;
  }

  /**
   * Constructs a custom state with specified hands and top card, preserving
   * exact 112-card conservation by drawing remainder cards from canonical deck.
   */
  static setCustomState(
    state: GameState,
    hands: Record<string, Card[]>,
    topDiscardCard: Card,
    activeColor?: CardColor
  ): GameState {
    const fullDeck = TeamsDeckFactory.createDeck();
    const usedCardIds = new Set<string>();

    usedCardIds.add(topDiscardCard.id);
    for (const playerId in hands) {
      for (const card of hands[playerId]) {
        if (usedCardIds.has(card.id)) {
          throw new Error(`Duplicate card ${card.id} in fixture setup.`);
        }
        usedCardIds.add(card.id);
      }
    }

    // Remainder forms draw pile
    const remainingCards = fullDeck.filter((c) => !usedCardIds.has(c.id));

    const updatedPlayers = state.players.map((p) => {
      const customHand = hands[p.id] ?? [];
      return {
        ...p,
        hand: customHand,
        hasDeclaredUno: customHand.length === 1,
        hasDrawnThisTurn: false,
        drawnCardId: null,
        isOut: customHand.length === 0,
      };
    });

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      drawPile: remainingCards,
      discardPile: [topDiscardCard],
      topDiscardCard,
      activeColor: activeColor ?? topDiscardCard.color,
      pendingActionState: null,
      unoVulnerablePlayerId: null,
    };

    assertValidTeamsGameState(nextState);
    return nextState;
  }
}
