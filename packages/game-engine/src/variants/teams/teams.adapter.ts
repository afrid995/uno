import { Card } from '../../cards/card.types';
import { GameConfig, GameState } from '../../game/game.types';
import { GameAction } from '../../actions/action.types';
import { ActionProcessResult } from '../../actions/action.processor';
import { ValidationResult } from '../../validation/move.validator';
import { DealerDeterminationResult } from '../../game/game.factory';
import { Player } from '../../players/player.types';
import { TurnDirection } from '../../turns/turn.direction';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../../deck/deck.shuffle';
import { GameVariantAdapter, VariantRegistry } from '../variant.types';
import { TeamsDeckFactory } from './teams.deck';
import { TeamsDealerSelector } from './teams.dealer';
import { TeamsMoveValidator } from './teams.validator';
import { TeamsActionProcessor } from './teams.actions';
import { UNO_TEAMS_RULES } from './teams.constants';
import { getTeamIdForSeat } from './teams.types';
import { assertValidTeamsGameState } from './teams.invariants';
import { HandManager } from '../../players/hand.manager';

export class UnoTeamsAdapter implements GameVariantAdapter {
  readonly id = 'uno_teams';
  readonly name = 'UNO Teams';
  readonly description =
    'Official Mattel UNO Teams™ (Product HXT58 / JDM40) 112-card partnership edition with cooperative passing symbols and Team Wilds!';
  readonly minPlayers = UNO_TEAMS_RULES.MIN_PLAYERS;
  readonly maxPlayers = UNO_TEAMS_RULES.MAX_PLAYERS;
  readonly cardsPerHand = UNO_TEAMS_RULES.INITIAL_HAND_SIZE;
  readonly targetScore = UNO_TEAMS_RULES.TARGET_WIN_SCORE;
  readonly missedUnoPenaltyCards = UNO_TEAMS_RULES.MISSED_UNO_PENALTY_CARDS;

  createDeck(_rng: RandomNumberGenerator = defaultCryptoRng): Card[] {
    return TeamsDeckFactory.createDeck();
  }

  determineDealerDetailed(
    playerCount: number,
    rng: RandomNumberGenerator = defaultCryptoRng,
    maxTieRounds: number = TeamsDealerSelector.DEFAULT_MAX_TIE_ROUNDS
  ): DealerDeterminationResult {
    return TeamsDealerSelector.determineDealerDetailed(playerCount, rng, maxTieRounds);
  }

  createGame(config: GameConfig, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
    const minPlayers = this.minPlayers;
    const maxPlayers = this.maxPlayers;
    const playerCount = config.players.length;

    if (playerCount < minPlayers || playerCount > maxPlayers || playerCount % 2 !== 0) {
      throw new Error(
        `Invalid player count ${playerCount}. UNO Teams requires 4, 6, or 8 players (teams of 2).`
      );
    }

    const cardsPerHand = config.cardsPerHand ?? this.cardsPerHand;
    const targetScore = config.targetScore ?? this.targetScore;

    // 1. Build and shuffle 112-card Teams deck
    const deck = shuffleDeck(TeamsDeckFactory.createDeck(), rng);

    // 2. Determine dealer
    const dealerIndex =
      config.dealerIndex !== undefined
        ? config.dealerIndex
        : TeamsDealerSelector.determineDealer(playerCount, rng);

    // 3. Deal 7 cards to each player
    const playerIds = config.players.map((p) => p.id);
    const { hands, remainingDeck } = HandManager.dealInitialHands(deck, playerIds, cardsPerHand);

    const drawPile = [...remainingDeck];

    // 4. Reveal top card to start discard pile.
    // Mattel Product HXT58 Setup Rule 5:
    // "Flip over the top card of the DRAW PILE and place it FACEUP to form the DISCARD PILE.
    // If this card is an Action Card, ignore it and flip over the next card."
    // Keep flipping until a non-Action (Number) card is reached.
    const discardPile: Card[] = [];
    let topCard = drawPile.pop()!;
    while (topCard.type !== 'number') {
      discardPile.push(topCard);
      topCard = drawPile.pop()!;
    }
    discardPile.push(topCard);

    const startingPlayerIndex = (dealerIndex + 1) % playerCount;
    const turnDirection: TurnDirection = 'clockwise';

    // 5. Initialize players with alternating team assignments
    const initialPlayers: Player[] = config.players.map((p, idx) => ({
      id: p.id,
      username: p.username,
      hand: hands.get(p.id)!,
      hasDeclaredUno: false,
      hasDrawnThisTurn: false,
      drawnCardId: null,
      score: 0,
      cumulativeScore: p.cumulativeScore ?? (p as any).initialScore ?? 0,
      teamId: getTeamIdForSeat(idx, playerCount),
      isOut: false,
    }));

    const timestamp = new Date().toISOString();
    const matchId = config.matchId ?? `match_${Date.now()}`;

    // 6. Setup Step 6: Initial hand pass before turn 1
    const state: GameState = {
      id: matchId,
      roomId: config.roomId,
      variant: 'uno_teams',
      status: 'IN_PROGRESS',
      roundNumber: 1,
      dealerIndex,
      targetScore,
      players: initialPlayers,
      playerOrder: playerIds,
      currentPlayerIndex: startingPlayerIndex,
      turnDirection,
      drawPile,
      discardPile,
      topDiscardCard: topCard,
      activeColor: topCard.color,
      turnNumber: 1,
      sequenceNumber: 0,
      unoVulnerablePlayerId: null,
      pendingActionState: {
        type: 'AWAITING_TEAM_INITIAL_PASS',
        selections: {},
      },
      inspectionHand: null,
      roundWinner: null,
      winner: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    assertValidTeamsGameState(state);
    return state;
  }

  startNextRound(state: GameState, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
    const action: GameAction = {
      type: 'START_NEXT_ROUND',
      triggeredByPlayerId: state.players[0].id,
    };
    return this.processAction(state, action, rng).nextState;
  }

  validateMove(state: GameState, action: GameAction): ValidationResult {
    return TeamsMoveValidator.validate(state, action);
  }

  processAction(
    state: GameState,
    action: GameAction,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): ActionProcessResult {
    return TeamsActionProcessor.process(state, action, rng);
  }

  calculateScore(loserHands: readonly (readonly Card[])[]): number {
    return loserHands.reduce((acc, hand) => {
      return acc + hand.reduce((handSum, card) => handSum + card.scoreValue, 0);
    }, 0);
  }
}

export const unoTeamsAdapter = new UnoTeamsAdapter();
VariantRegistry.register(unoTeamsAdapter);
