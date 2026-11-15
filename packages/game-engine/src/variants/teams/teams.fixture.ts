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

  /**
   * Sets up an active game state right before round victory:
   * Current player (partner A of target team) has 1 playable card matching top discard,
   * Partner B of target team has 0 cards (isOut = true),
   * Opponents have hands, and 112-card conservation is maintained.
   */
  static setupRoundEndState(state: GameState, targetTeamId: string = 'team_1'): GameState {
    const fullDeck = TeamsDeckFactory.createDeck();
    const teamPlayers = state.players.filter((p) => p.teamId === targetTeamId);
    if (teamPlayers.length !== 2) {
      throw new Error(`Team ${targetTeamId} does not have exactly 2 players.`);
    }
    const [partnerA, partnerB] = teamPlayers;

    // Pick a red 5 for top discard, red 7 for partner A's hand
    const topCard = fullDeck.find((c) => c.color === 'red' && c.value === '5')!;
    const winningCard = fullDeck.find((c) => c.color === 'red' && c.value === '7')!;

    const hands: Record<string, Card[]> = {};
    hands[partnerA.id] = [winningCard];
    hands[partnerB.id] = [];

    const opponents = state.players.filter((p) => p.teamId !== targetTeamId);
    let cardIdx = 0;
    const opponentCardsPool = fullDeck.filter(
      (c) => c.id !== topCard.id && c.id !== winningCard.id && c.type === 'number'
    );

    for (const opp of opponents) {
      hands[opp.id] = [opponentCardsPool[cardIdx++], opponentCardsPool[cardIdx++]];
    }

    const customState = this.setCustomState(state, hands, topCard, 'red');

    // Partner A is current player
    const partnerAIndex = customState.players.findIndex((p) => p.id === partnerA.id);
    const finalState: GameState = {
      ...customState,
      currentPlayerIndex: partnerAIndex,
      pendingActionState: null,
      status: 'IN_PROGRESS',
    };

    assertValidTeamsGameState(finalState);
    return finalState;
  }
}
