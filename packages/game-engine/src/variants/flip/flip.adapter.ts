import { Card, CardColor, FlipSide } from '../../cards/card.types';
import { GameConfig, GameState, PendingActionState } from '../../game/game.types';
import { GameAction } from '../../actions/action.types';
import { ActionProcessResult } from '../../actions/action.processor';
import { ValidationResult } from '../../validation/move.validator';
import { DealerDeterminationResult } from '../../game/game.factory';
import { Player } from '../../players/player.types';
import { HandManager } from '../../players/hand.manager';
import { TurnDirection } from '../../turns/turn.direction';
import { TurnManager } from '../../turns/turn.manager';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../../deck/deck.shuffle';
import { GameVariantAdapter, VariantRegistry } from '../variant.types';
import { FlipDeckFactory } from './flip.deck';
import { FlipDealerSelector } from './flip.dealer';
import { FlipMoveValidator } from './flip.validator';
import { FlipActionProcessor } from './flip.actions';
import { UNO_FLIP_RULES } from './flip.constants';

export class UnoFlipAdapter implements GameVariantAdapter {
  readonly id = 'uno_flip';
  readonly name = 'UNO Flip';
  readonly description = 'Official Mattel UNO Flip (GDR44) 112 double-sided cards edition.';
  readonly minPlayers = UNO_FLIP_RULES.MIN_PLAYERS;
  readonly maxPlayers = UNO_FLIP_RULES.MAX_PLAYERS;
  readonly cardsPerHand = UNO_FLIP_RULES.INITIAL_HAND_SIZE;
  readonly targetScore = UNO_FLIP_RULES.TARGET_WIN_SCORE;
  readonly missedUnoPenaltyCards = UNO_FLIP_RULES.MISSED_UNO_PENALTY_CARDS;

  createDeck(_rng: RandomNumberGenerator = defaultCryptoRng): Card[] {
    return FlipDeckFactory.createFlipDeck();
  }

  determineDealerDetailed(
    playerCount: number,
    rng: RandomNumberGenerator = defaultCryptoRng,
    maxTieRounds: number = FlipDealerSelector.DEFAULT_MAX_TIE_ROUNDS
  ): DealerDeterminationResult {
    return FlipDealerSelector.determineDealerDetailed(playerCount, rng, maxTieRounds);
  }

  createGame(config: GameConfig, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
    const minPlayers = this.minPlayers;
    const maxPlayers = this.maxPlayers;
    const playerCount = config.players.length;

    if (playerCount < minPlayers || playerCount > maxPlayers) {
      throw new Error(
        `Invalid player count ${playerCount}. UNO Flip supports between ${minPlayers} and ${maxPlayers} players.`
      );
    }

    const cardsPerHand = config.cardsPerHand ?? this.cardsPerHand;
    const targetScore = config.targetScore ?? this.targetScore;

    // 1. Create and shuffle 112-card double-sided deck
    const deck: Card[] = shuffleDeck(FlipDeckFactory.createFlipDeck(), rng);

    // 2. Determine dealer under Mattel GDR44 rules (highest number, symbols=0)
    const dealerIndex =
      config.dealerIndex !== undefined
        ? config.dealerIndex
        : FlipDealerSelector.determineDealer(playerCount, rng);

    // 3. Deal 7 cards to each player (Light Side active)
    const playerIds = config.players.map((p) => p.id);
    const { hands, remainingDeck } = HandManager.dealInitialHands(deck, playerIds, cardsPerHand);

    let drawPile = [...remainingDeck];
    let topDiscard: Card | undefined;

    // 4. Reveal top card. Per GDR44:
    // If Wild Draw Two is turned up, return it to the deck, reshuffle, and turn up another card.
    while (!topDiscard || topDiscard.value === 'wild_draw_two') {
      if (topDiscard && topDiscard.value === 'wild_draw_two') {
        drawPile = shuffleDeck([...drawPile, topDiscard], rng);
      }
      topDiscard = drawPile.pop();
      if (!topDiscard) {
        throw new Error('Not enough cards in deck to establish discard pile.');
      }
    }

    let activeSide: FlipSide = 'LIGHT';
    let discardPile: Card[] = [topDiscard];
    let turnDirection: TurnDirection = 'clockwise';
    const startingPlayerIndex = (dealerIndex + 1) % playerCount;
    let currentPlayerIndex = startingPlayerIndex;
    let pendingActionState: PendingActionState | null = null;
    let activeColor: CardColor | null = topDiscard.color;

    const initialPlayers: Player[] = config.players.map((p) => ({
      id: p.id,
      username: p.username,
      hand: hands.get(p.id)!,
      hasDeclaredUno: false,
      hasDrawnThisTurn: false,
      drawnCardId: null,
      score: 0,
    }));

    // Apply starting card effects per Mattel GDR44 instructions
    if (topDiscard.value === 'flip') {
      // Per GDR44: "Flip — the dealer flips the deck; play starts on the Dark Side."
      activeSide = 'DARK';

      // Discard card flipped to Dark Side
      topDiscard = FlipDeckFactory.flipCard(topDiscard, 'DARK');
      discardPile = [topDiscard];

      // Draw pile flipped to Dark Side
      drawPile = drawPile.reverse().map((c) => FlipDeckFactory.flipCard(c, 'DARK'));

      // Player hands flipped to Dark Side
      for (let i = 0; i < initialPlayers.length; i++) {
        initialPlayers[i] = {
          ...initialPlayers[i],
          hand: initialPlayers[i].hand.map((c) => FlipDeckFactory.flipCard(c, 'DARK')),
        };
      }

      // Check if the Dark Side face exposed is an action card
      if (topDiscard.value === 'draw_five') {
        const victim = initialPlayers[startingPlayerIndex];
        const drawRes = FlipActionProcessor.drawCards(drawPile, discardPile, 5, 'DARK', rng);
        drawPile = drawRes.newDrawPile;
        initialPlayers[startingPlayerIndex] = {
          ...victim,
          hand: [...victim.hand, ...drawRes.drawnCards],
        };
        currentPlayerIndex = TurnManager.getNextPlayerIndex(startingPlayerIndex, playerCount, turnDirection, 1);
      } else if (topDiscard.value === 'reverse') {
        turnDirection = 'counter_clockwise';
        currentPlayerIndex = dealerIndex; // Dealer plays first
      } else if (topDiscard.value === 'skip_everyone') {
        currentPlayerIndex = dealerIndex; // Dealer plays again
      }
    } else if (topDiscard.value === 'draw_one') {
      // Light Side: Draw One starting card — player to dealer's left draws 1 and loses turn
      const victim = initialPlayers[startingPlayerIndex];
      const drawRes = FlipActionProcessor.drawCards(drawPile, discardPile, 1, 'LIGHT', rng);
      drawPile = drawRes.newDrawPile;
      initialPlayers[startingPlayerIndex] = {
        ...victim,
        hand: [...victim.hand, ...drawRes.drawnCards],
      };
      currentPlayerIndex = TurnManager.getNextPlayerIndex(startingPlayerIndex, playerCount, turnDirection, 1);
    } else if (topDiscard.value === 'reverse') {
      // Per GDR44: "Reverse — Dealer plays first, then play moves to the right instead of left."
      turnDirection = 'counter_clockwise';
      currentPlayerIndex = dealerIndex;
    } else if (topDiscard.value === 'skip') {
      // Light Side: Skip starting card — player to dealer's left is skipped
      currentPlayerIndex = TurnManager.getNextPlayerIndex(startingPlayerIndex, playerCount, turnDirection, 1);
    } else if (topDiscard.value === 'wild') {
      // Per GDR44: "Wild — The person to the left of the dealer chooses the color that continues play and plays the first card."
      activeColor = null;
      pendingActionState = {
        type: 'AWAITING_STARTING_WILD_COLOR_SELECTION',
        designatedPlayerId: initialPlayers[startingPlayerIndex].id,
      };
      currentPlayerIndex = startingPlayerIndex;
    }

    const timestamp = new Date().toISOString();
    const matchId = config.matchId ?? `match_${Date.now()}`;

    return {
      id: matchId,
      roomId: config.roomId,
      variant: 'uno_flip',
      status: 'IN_PROGRESS',
      roundNumber: 1,
      dealerIndex,
      targetScore,
      players: initialPlayers,
      playerOrder: playerIds,
      currentPlayerIndex,
      turnDirection,
      drawPile,
      discardPile,
      topDiscardCard: topDiscard,
      activeColor,
      activeSide,
      turnNumber: 1,
      sequenceNumber: 0,
      unoVulnerablePlayerId: null,
      pendingActionState,
      inspectionHand: null,
      roundWinner: null,
      winner: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  startNextRound(state: GameState, rng: RandomNumberGenerator = defaultCryptoRng): GameState {
    if (state.status !== 'ROUND_OVER') {
      throw new Error(`Cannot start next round when game status is ${state.status}`);
    }

    const playerCount = state.players.length;
    const newDealerIndex = (state.dealerIndex + 1) % playerCount;

    // Fresh 112-card double-sided deck for next round
    const deck = shuffleDeck(FlipDeckFactory.createFlipDeck(), rng);

    // Deal 7 cards to each player (always starts on Light Side per GDR44)
    const playerIds = state.players.map((p) => p.id);
    const { hands, remainingDeck } = HandManager.dealInitialHands(deck, playerIds, this.cardsPerHand);

    let drawPile = [...remainingDeck];
    let topDiscard: Card | undefined;

    while (!topDiscard || topDiscard.value === 'wild_draw_two') {
      if (topDiscard && topDiscard.value === 'wild_draw_two') {
        drawPile = shuffleDeck([...drawPile, topDiscard], rng);
      }
      topDiscard = drawPile.pop();
      if (!topDiscard) {
        throw new Error('Not enough cards in deck to establish discard pile.');
      }
    }

    let activeSide: FlipSide = 'LIGHT';
    let discardPile: Card[] = [topDiscard];
    let turnDirection: TurnDirection = 'clockwise';
    const startingPlayerIndex = (newDealerIndex + 1) % playerCount;
    let currentPlayerIndex = startingPlayerIndex;
    let pendingActionState: PendingActionState | null = null;
    let activeColor: CardColor | null = topDiscard.color;

    const initialPlayers: Player[] = state.players.map((p) => ({
      id: p.id,
      username: p.username,
      hand: hands.get(p.id)!,
      hasDeclaredUno: false,
      hasDrawnThisTurn: false,
      drawnCardId: null,
      score: p.score, // Preserves cumulative score across rounds!
    }));

    if (topDiscard.value === 'flip') {
      activeSide = 'DARK';
      topDiscard = FlipDeckFactory.flipCard(topDiscard, 'DARK');
      discardPile = [topDiscard];
      drawPile = drawPile.reverse().map((c) => FlipDeckFactory.flipCard(c, 'DARK'));
      for (let i = 0; i < initialPlayers.length; i++) {
        initialPlayers[i] = {
          ...initialPlayers[i],
          hand: initialPlayers[i].hand.map((c) => FlipDeckFactory.flipCard(c, 'DARK')),
        };
      }
    } else if (topDiscard.value === 'draw_one') {
      const victim = initialPlayers[startingPlayerIndex];
      const drawRes = FlipActionProcessor.drawCards(drawPile, discardPile, 1, 'LIGHT', rng);
      drawPile = drawRes.newDrawPile;
      initialPlayers[startingPlayerIndex] = {
        ...victim,
        hand: [...victim.hand, ...drawRes.drawnCards],
      };
      currentPlayerIndex = TurnManager.getNextPlayerIndex(startingPlayerIndex, playerCount, turnDirection, 1);
    } else if (topDiscard.value === 'reverse') {
      turnDirection = 'counter_clockwise';
      currentPlayerIndex = newDealerIndex; // Dealer plays first in UNO Flip
    } else if (topDiscard.value === 'skip') {
      currentPlayerIndex = TurnManager.getNextPlayerIndex(startingPlayerIndex, playerCount, turnDirection, 1);
    } else if (topDiscard.value === 'wild') {
      // Per GDR44: "Wild — The person to the left of the dealer chooses the color that continues play and plays the first card."
      activeColor = null;
      pendingActionState = {
        type: 'AWAITING_STARTING_WILD_COLOR_SELECTION',
        designatedPlayerId: initialPlayers[startingPlayerIndex].id,
      };
      currentPlayerIndex = startingPlayerIndex;
    }

    const timestamp = new Date().toISOString();

    return {
      ...state,
      status: 'IN_PROGRESS',
      roundNumber: state.roundNumber + 1,
      dealerIndex: newDealerIndex,
      players: initialPlayers,
      currentPlayerIndex,
      turnDirection,
      drawPile,
      discardPile,
      topDiscardCard: topDiscard,
      activeColor,
      activeSide,
      turnNumber: 1,
      sequenceNumber: state.sequenceNumber + 1,
      unoVulnerablePlayerId: null,
      pendingActionState,
      inspectionHand: null,
      roundWinner: null,
      updatedAt: timestamp,
    };
  }

  validateMove(state: GameState, action: GameAction): ValidationResult {
    return FlipMoveValidator.validate(state, action);
  }

  processAction(
    state: GameState,
    action: GameAction,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): ActionProcessResult {
    return FlipActionProcessor.process(state, action, rng);
  }

  calculateScore(loserHands: readonly (readonly Card[])[], activeSide: FlipSide = 'LIGHT'): number {
    return FlipActionProcessor.calculateRoundScore(loserHands, activeSide);
  }
}

export const unoFlipAdapter = new UnoFlipAdapter();
VariantRegistry.register(unoFlipAdapter);
