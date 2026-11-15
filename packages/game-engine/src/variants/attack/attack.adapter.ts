import { Card, CardColor, FlipSide } from '../../cards/card.types';
import { GameConfig, GameState, PendingActionState } from '../../game/game.types';
import { GameAction } from '../../actions/action.types';
import { ActionProcessResult } from '../../actions/action.processor';
import { ValidationResult } from '../../validation/move.validator';
import { DealerDeterminationResult } from '../../game/game.factory';
import { Player } from '../../players/player.types';
import { TurnDirection } from '../../turns/turn.direction';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../../deck/deck.shuffle';
import { GameVariantAdapter, VariantRegistry } from '../variant.types';
import { AttackDeckFactory } from './attack.deck';
import { AttackDealerSelector } from './attack.dealer';
import { AttackMoveValidator } from './attack.validator';
import { AttackActionProcessor } from './attack.actions';
import { AttackLauncher } from './attack.launcher';
import { UNO_ATTACK_RULES, ATTACK_LAUNCHER_CONFIG } from './attack.constants';
import { assertValidAttackGameState } from './attack.invariants';
import { HandManager } from '../../players/hand.manager';
import { DeckManager } from '../../deck/deck.manager';

export class UnoAttackAdapter implements GameVariantAdapter {
  readonly id = 'uno_attack';
  readonly name = 'UNO Attack';
  readonly description =
    'Official Mattel UNO Attack® (Model GTX66) 112-card motorized launcher edition with Discard All, Hit 2, Wild Hit 4, and Wild Attack-Attack!';
  readonly minPlayers = UNO_ATTACK_RULES.MIN_PLAYERS;
  readonly maxPlayers = UNO_ATTACK_RULES.MAX_PLAYERS;
  readonly cardsPerHand = UNO_ATTACK_RULES.INITIAL_HAND_SIZE;
  readonly targetScore = UNO_ATTACK_RULES.TARGET_WIN_SCORE;
  readonly missedUnoPenaltyCards = UNO_ATTACK_RULES.MISSED_UNO_PENALTY_PRESSES;

  createDeck(_rng: RandomNumberGenerator = defaultCryptoRng): Card[] {
    return AttackDeckFactory.createDeck();
  }

  determineDealerDetailed(
    playerCount: number,
    rng: RandomNumberGenerator = defaultCryptoRng,
    maxTieRounds: number = AttackDealerSelector.DEFAULT_MAX_TIE_ROUNDS
  ): DealerDeterminationResult {
    return AttackDealerSelector.determineDealerDetailed(playerCount, rng, maxTieRounds);
  }

  createGame(config: GameConfig, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
    const minPlayers = this.minPlayers;
    const maxPlayers = this.maxPlayers;
    const playerCount = config.players.length;

    if (playerCount < minPlayers || playerCount > maxPlayers) {
      throw new Error(
        `Invalid player count ${playerCount}. UNO Attack supports 2 to 10 players.`
      );
    }

    const cardsPerHand = config.cardsPerHand ?? this.cardsPerHand;
    const targetScore = config.targetScore ?? this.targetScore;

    // 1. Build and shuffle 112-card Attack deck
    const deck = shuffleDeck(AttackDeckFactory.createDeck(), rng);

    // 2. Determine dealer
    const dealerIndex =
      config.dealerIndex !== undefined
        ? config.dealerIndex
        : AttackDealerSelector.determineDealer(playerCount, rng);

    // 3. Deal 7 cards to each player
    const playerIds = config.players.map((p) => p.id);
    const { hands, remainingDeck } = HandManager.dealInitialHands(deck, playerIds, cardsPerHand);

    let drawPile = [...remainingDeck];
    let discardPile: Card[] = [];

    // 4. Reveal top card to start discard pile.
    const topCard = drawPile.pop()!;
    discardPile.push(topCard);

    let turnDirection: TurnDirection = 'clockwise';
    let startingPlayerIndex = (dealerIndex + 1) % playerCount;
    let activeColor: CardColor | null = topCard.color;
    let pendingActionState: PendingActionState | null = null;
    let launcherTension = 0;

    let initialPlayers: Player[] = config.players.map((p) => ({
      id: p.id,
      username: p.username,
      hand: hands.get(p.id)!,
      hasDeclaredUno: false,
      hasDrawnThisTurn: false,
      drawnCardId: null,
      score: 0,
    }));

    // Opening card resolution per Mattel GTX66 Rules:
    if (topCard.value === 'reverse') {
      if (playerCount === 2) {
        // In 2-player game, dealer plays first
        startingPlayerIndex = dealerIndex;
      } else {
        turnDirection = 'counter_clockwise';
        startingPlayerIndex = dealerIndex;
      }
    } else if (topCard.value === 'skip') {
      if (playerCount === 2) {
        startingPlayerIndex = dealerIndex;
      } else {
        startingPlayerIndex = (dealerIndex + 2) % playerCount;
      }
    } else if (topCard.value === 'hit_2') {
      // Player to left of dealer must hit launcher twice, play begins with 2nd player to left
      const victim = initialPlayers[startingPlayerIndex];
      const evalResult = AttackLauncher.evaluatePresses(
        ATTACK_LAUNCHER_CONFIG.PRESSES.HIT_2,
        0,
        drawPile.length,
        rng
      );
      if (evalResult.totalCardsToDispense > 0) {
        const drawRes = DeckManager.drawCards(drawPile, discardPile, evalResult.totalCardsToDispense, rng);
        drawPile = [...drawRes.newDrawPile];
        discardPile = [...drawRes.newDiscardPile];
        initialPlayers = initialPlayers.map((p) =>
          p.id === victim.id ? { ...p, hand: [...p.hand, ...drawRes.drawnCards] } : p
        );
      }
      launcherTension = evalResult.finalTension;
      startingPlayerIndex = playerCount === 2 ? dealerIndex : (dealerIndex + 2) % playerCount;
    } else if (topCard.value === 'wild_hit_4') {
      // Player to left of dealer must hit launcher 4 times, play begins with 2nd player to left
      const victim = initialPlayers[startingPlayerIndex];
      const evalResult = AttackLauncher.evaluatePresses(
        ATTACK_LAUNCHER_CONFIG.PRESSES.WILD_HIT_4,
        0,
        drawPile.length,
        rng
      );
      if (evalResult.totalCardsToDispense > 0) {
        const drawRes = DeckManager.drawCards(drawPile, discardPile, evalResult.totalCardsToDispense, rng);
        drawPile = [...drawRes.newDrawPile];
        discardPile = [...drawRes.newDiscardPile];
        initialPlayers = initialPlayers.map((p) =>
          p.id === victim.id ? { ...p, hand: [...p.hand, ...drawRes.drawnCards] } : p
        );
      }
      launcherTension = evalResult.finalTension;
      startingPlayerIndex = playerCount === 2 ? dealerIndex : (dealerIndex + 2) % playerCount;
      activeColor = 'red'; // default starting color
    } else if (topCard.value === 'wild' || topCard.value === 'wild_customizable') {
      pendingActionState = {
        type: 'AWAITING_STARTING_WILD_COLOR_SELECTION',
        designatedPlayerId: initialPlayers[startingPlayerIndex].id,
      };
      activeColor = null;
    } else if (topCard.value === 'wild_attack_attack') {
      pendingActionState = {
        type: 'AWAITING_STARTING_ATTACK_SELECTION',
        designatedPlayerId: initialPlayers[startingPlayerIndex].id,
      };
      activeColor = null;
    }

    const state: GameState = {
      id: config.matchId ?? `match_attack_${Date.now()}`,
      roomId: config.roomId,
      variant: 'uno_attack',
      status: 'IN_PROGRESS',
      roundNumber: 1,
      dealerIndex,
      targetScore,
      players: initialPlayers,
      playerOrder: initialPlayers.map((p) => p.id),
      currentPlayerIndex: startingPlayerIndex,
      turnDirection,
      drawPile,
      discardPile,
      topDiscardCard: topCard,
      activeColor,
      turnNumber: 0,
      sequenceNumber: 0,
      unoVulnerablePlayerId: null,
      pendingActionState,
      inspectionHand: null,
      roundWinner: null,
      winner: null,
      attackLauncherState: { tension: launcherTension },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    assertValidAttackGameState(state);
    return state;
  }

  startNextRound(state: GameState, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
    const result = AttackActionProcessor.process(
      state,
      {
        type: 'START_NEXT_ROUND',
        triggeredByPlayerId: state.players[state.dealerIndex].id,
      },
      rng
    );
    return result.nextState;
  }

  validateMove(state: GameState, action: GameAction): ValidationResult {
    return AttackMoveValidator.validate(state, action);
  }

  processAction(
    state: GameState,
    action: GameAction,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): ActionProcessResult {
    return AttackActionProcessor.process(state, action, rng);
  }

  calculateScore(loserHands: readonly (readonly Card[])[], _activeSide?: FlipSide): number {
    let total = 0;
    for (const hand of loserHands) {
      for (const card of hand) {
        total += card.scoreValue;
      }
    }
    return total;
  }
}

export const unoAttackAdapter = new UnoAttackAdapter();
VariantRegistry.register(unoAttackAdapter);
