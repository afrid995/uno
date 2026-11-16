import { GameState, GameWinner, PendingActionState } from '../../game/game.types';
import { GameAction, GameEventRecord } from '../../actions/action.types';
import { Card, CardColor, CardValue } from '../../cards/card.types';
import { isWildCard } from '../../cards/card.validation';
import { Player } from '../../players/player.types';
import { TurnManager } from '../../turns/turn.manager';
import { reverseDirection } from '../../turns/turn.direction';
import { ActionProcessResult } from '../../actions/action.processor';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../../deck/deck.shuffle';
import { NoMercyMoveValidator } from './no-mercy.validator';
import { getNoMercyDrawPenalty, getNoMercyStackCardValue, UNO_NO_MERCY_RULES } from './no-mercy.constants';
import { HandManager } from '../../players/hand.manager';
import { NoMercyDeckFactory } from './no-mercy.deck';
import { assertValidNoMercyGameState } from './no-mercy.invariants';

interface ActionContext {
  readonly events: GameEventRecord[];
  readonly addEvent: (type: string, playerId: string | undefined, payload: Record<string, unknown>) => void;
  readonly getSeq: () => number;
  readonly timestamp: string;
}

export class NoMercyActionProcessor {
  /**
   * Reshuffles recyclable cards into the draw pile when draw pile is exhausted.
   *
   * Per official Mattel HWV18 Mercy Rule:
   * "If a player ever has 25 or more cards in their hand, they are out of the game.
   *  Set aside their hand of cards until the deck runs out and needs to be reshuffled."
   *
   * Recycling lifecycle:
   * 1. Preserves the current top discard card.
   * 2. Collects recyclable discard cards beneath the top card.
   * 3. Collects all cards in setAsideCards.
   * 4. Combines and shuffles them with the provided RNG.
   * 5. Rebuilds draw pile.
   * 6. Clears setAsideCards only after cards have been successfully moved into the new draw pile.
   * 7. If no recyclable cards exist, safely returns without infinite loops.
   */
  static reshuffleRecyclableCards(
    drawPile: readonly Card[],
    discardPile: readonly Card[],
    setAsideCards: readonly Card[] = [],
    rng: RandomNumberGenerator = defaultCryptoRng
  ): {
    newDrawPile: Card[];
    newDiscardPile: Card[];
    newSetAsideCards: Card[];
    reshuffled: boolean;
  } {
    if (drawPile.length > 0) {
      return {
        newDrawPile: [...drawPile],
        newDiscardPile: [...discardPile],
        newSetAsideCards: [...setAsideCards],
        reshuffled: false,
      };
    }

    const topCard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;
    const discardBeneath = discardPile.length > 1 ? discardPile.slice(0, -1) : [];
    const pool = [...discardBeneath, ...setAsideCards];

    if (pool.length === 0) {
      return {
        newDrawPile: [],
        newDiscardPile: topCard ? [topCard] : [],
        newSetAsideCards: [...setAsideCards],
        reshuffled: false,
      };
    }

    const shuffled = shuffleDeck(pool, rng);

    return {
      newDrawPile: shuffled,
      newDiscardPile: topCard ? [topCard] : [],
      newSetAsideCards: [],
      reshuffled: true,
    };
  }

  /**
   * Helper to draw `count` cards from draw pile, recycling discard pile (preserving top)
   * and setAsideCards from eliminated players if draw pile runs out.
   */
  static drawCards(
    drawPile: readonly Card[],
    discardPile: readonly Card[],
    count: number,
    setAsideCards: readonly Card[] = [],
    rng: RandomNumberGenerator = defaultCryptoRng
  ): {
    drawnCards: Card[];
    newDrawPile: Card[];
    newDiscardPile: Card[];
    newSetAsideCards: Card[];
  } {
    let currentDraw = [...drawPile];
    let currentDiscard = [...discardPile];
    let currentSetAside = [...setAsideCards];
    const drawn: Card[] = [];

    for (let i = 0; i < count; i++) {
      if (currentDraw.length === 0) {
        const reshuffleResult = this.reshuffleRecyclableCards(
          currentDraw,
          currentDiscard,
          currentSetAside,
          rng
        );
        currentDraw = reshuffleResult.newDrawPile;
        currentDiscard = reshuffleResult.newDiscardPile;
        currentSetAside = reshuffleResult.newSetAsideCards;
      }

      if (currentDraw.length > 0) {
        drawn.push(currentDraw.pop()!);
      } else {
        // Deck completely exhausted and no recyclable cards exist
        break;
      }
    }

    return {
      drawnCards: drawn,
      newDrawPile: currentDraw,
      newDiscardPile: currentDiscard,
      newSetAsideCards: currentSetAside,
    };
  }

  /**
   * Wild Color Roulette draw helper.
   * Draws cards one by one from the draw pile until a card matching targetColor is revealed.
   * Official rule: Wild cards do not count as a matching color.
   */
  static drawUntilColor(
    drawPile: readonly Card[],
    discardPile: readonly Card[],
    targetColor: CardColor,
    setAsideCards: readonly Card[] = [],
    rng: RandomNumberGenerator = defaultCryptoRng
  ): {
    drawnCards: Card[];
    newDrawPile: Card[];
    newDiscardPile: Card[];
    newSetAsideCards: Card[];
  } {
    let currentDraw = [...drawPile];
    let currentDiscard = [...discardPile];
    let currentSetAside = [...setAsideCards];
    const drawn: Card[] = [];
    let found = false;

    // Safety loop: maximum draws bounded by total deck size (168)
    const maxDraws = UNO_NO_MERCY_RULES.DECK_SIZE;
    let iterations = 0;

    while (!found && iterations < maxDraws) {
      iterations++;

      if (currentDraw.length === 0) {
        const reshuffleResult = this.reshuffleRecyclableCards(
          currentDraw,
          currentDiscard,
          currentSetAside,
          rng
        );
        currentDraw = reshuffleResult.newDrawPile;
        currentDiscard = reshuffleResult.newDiscardPile;
        currentSetAside = reshuffleResult.newSetAsideCards;
      }

      if (currentDraw.length === 0) {
        break;
      }

      const card = currentDraw.pop()!;
      drawn.push(card);

      // Must be non-wild and match chosen color
      if (!isWildCard(card) && card.color === targetColor) {
        found = true;
      }
    }

    return {
      drawnCards: drawn,
      newDrawPile: currentDraw,
      newDiscardPile: currentDiscard,
      newSetAsideCards: currentSetAside,
    };
  }

  /**
   * Draw-until-playable helper.
   * Draws cards one by one until a card that matches the active discard is drawn.
   */
  static drawUntilPlayable(
    drawPile: readonly Card[],
    discardPile: readonly Card[],
    topDiscard: Card,
    activeColor: CardColor | null,
    setAsideCards: readonly Card[] = [],
    rng: RandomNumberGenerator = defaultCryptoRng
  ): {
    drawnCards: Card[];
    playableCard: Card | null;
    newDrawPile: Card[];
    newDiscardPile: Card[];
    newSetAsideCards: Card[];
  } {
    let currentDraw = [...drawPile];
    let currentDiscard = [...discardPile];
    let currentSetAside = [...setAsideCards];
    const drawn: Card[] = [];
    let playableCard: Card | null = null;

    const maxDraws = UNO_NO_MERCY_RULES.DECK_SIZE;
    let iterations = 0;

    while (!playableCard && iterations < maxDraws) {
      iterations++;

      if (currentDraw.length === 0) {
        const reshuffleResult = this.reshuffleRecyclableCards(
          currentDraw,
          currentDiscard,
          currentSetAside,
          rng
        );
        currentDraw = reshuffleResult.newDrawPile;
        currentDiscard = reshuffleResult.newDiscardPile;
        currentSetAside = reshuffleResult.newSetAsideCards;
      }

      if (currentDraw.length === 0) {
        break;
      }

      const card = currentDraw.pop()!;
      drawn.push(card);

      if (NoMercyMoveValidator.isCardMatch(card, activeColor, topDiscard)) {
        playableCard = card;
      }
    }

    return {
      drawnCards: drawn,
      playableCard,
      newDrawPile: currentDraw,
      newDiscardPile: currentDiscard,
      newSetAsideCards: currentSetAside,
    };
  }

  /**
   * Returns index of the next active (non-eliminated) player.
   */
  static getNextActivePlayerIndex(
    currentIndex: number,
    players: readonly Player[],
    direction: 'clockwise' | 'counter_clockwise',
    steps: number = 1
  ): number {
    const total = players.length;
    let index = currentIndex;
    let advanced = 0;

    for (let i = 0; i < total * 2 && advanced < steps; i++) {
      index = TurnManager.getNextPlayerIndex(index, total, direction, 1);
      if (!players[index].isEliminated) {
        advanced++;
      }
    }

    return index;
  }

  /**
   * Returns list of non-eliminated players.
   */
  static getActivePlayers(players: readonly Player[]): Player[] {
    return players.filter((p) => !p.isEliminated);
  }

  /**
   * Calculates score awarded to the round winner under Mattel HWV18 rules.
   * Eliminated players' hands are ignored.
   * Plus 250 points per player eliminated during the round.
   */
  static calculateRoundScore(
    players: readonly Player[],
    winnerId: string,
    eliminatedBonusCount: number = 0
  ): number {
    let score = 0;

    for (const player of players) {
      if (player.id === winnerId || player.isEliminated) {
        continue;
      }

      for (const card of player.hand) {
        if (card.type === 'number') {
          score += Number(card.value);
        } else if (card.type === 'action') {
          score += UNO_NO_MERCY_RULES.COLORED_ACTION_POINTS;
        } else if (card.type === 'wild') {
          score += UNO_NO_MERCY_RULES.WILD_ACTION_POINTS;
        }
      }
    }

    score += eliminatedBonusCount * UNO_NO_MERCY_RULES.ELIMINATION_BONUS_POINTS;
    return score;
  }

  /**
   * Main entry point for processing No Mercy actions.
   */
  static process(
    state: GameState,
    action: GameAction,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): ActionProcessResult {
    const validation = NoMercyMoveValidator.validate(state, action);
    if (!validation.valid) {
      throw new Error(`[${validation.code}] ${validation.message}`);
    }

    const events: GameEventRecord[] = [];
    const timestamp = new Date().toISOString();
    let currentSeq = state.sequenceNumber;

    const addEvent = (type: string, playerId: string | undefined, payload: Record<string, unknown>) => {
      currentSeq += 1;
      events.push({
        sequenceNumber: currentSeq,
        type,
        playerId,
        payload,
        timestamp,
      });
    };

    const ctx: ActionContext = {
      events,
      addEvent,
      getSeq: () => currentSeq,
      timestamp,
    };

    if (action.type === 'START_NEXT_ROUND') {
      return this.processStartNextRound(state, rng, ctx);
    }

    if (state.pendingActionState) {
      return this.processPendingAction(state, action, rng, ctx);
    }

    switch (action.type) {
      case 'PLAY_CARD':
        return this.processPlayCard(state, action, rng, ctx);
      case 'DRAW_CARD':
        return this.processDrawCard(state, action, rng, ctx);
      case 'PASS_TURN':
        return this.processPassTurn(state, action.playerId, ctx);
      case 'CALL_UNO':
        return this.processCallUno(state, action, ctx);
      case 'CHALLENGE_UNO_FAILURE':
        return this.processChallengeUno(state, action, rng, ctx);
      default:
        throw new Error(`Unsupported action type ${action.type} for UNO Show 'em No Mercy.`);
    }
  }

  private static processStartNextRound(
    state: GameState,
    rng: RandomNumberGenerator,
    ctx: ActionContext
  ): ActionProcessResult {
    const playerCount = state.players.length;
    const newDealerIndex = (state.dealerIndex + 1) % playerCount;

    // Fresh 168-card deck
    const deck = shuffleDeck(NoMercyDeckFactory.createDeck(), rng);
    const playerIds = state.players.map((p) => p.id);
    const { hands, remainingDeck } = HandManager.dealInitialHands(
      deck,
      playerIds,
      UNO_NO_MERCY_RULES.INITIAL_HAND_SIZE
    );

    const drawPile = [...remainingDeck];
    const discardPile: Card[] = [];

    // Per HWV18: reveal until a number card appears. Any action card is ignored.
    let topDiscard: Card | undefined;
    while (!topDiscard || topDiscard.type !== 'number') {
      const card = drawPile.pop();
      if (!card) {
        throw new Error('Not enough cards in deck to establish discard pile.');
      }
      discardPile.push(card);
      topDiscard = card;
    }

    const startingPlayerIndex = (newDealerIndex + 1) % playerCount;

    const initialPlayers: Player[] = state.players.map((p) => ({
      id: p.id,
      username: p.username,
      hand: hands.get(p.id)!,
      hasDeclaredUno: false,
      hasDrawnThisTurn: false,
      drawnCardId: null,
      score: p.score,
      isEliminated: false,
      eliminationOrder: undefined,
    }));

    ctx.addEvent('ROUND_STARTED', undefined, {
      roundNumber: state.roundNumber + 1,
      dealerIndex: newDealerIndex,
      startingPlayerIndex,
      topDiscardCard: topDiscard,
    });

    const nextState: GameState = {
      ...state,
      status: 'IN_PROGRESS',
      roundNumber: state.roundNumber + 1,
      dealerIndex: newDealerIndex,
      players: initialPlayers,
      currentPlayerIndex: startingPlayerIndex,
      turnDirection: 'clockwise',
      drawPile,
      discardPile,
      topDiscardCard: topDiscard,
      activeColor: topDiscard.color,
      turnNumber: 1,
      sequenceNumber: ctx.getSeq(),
      unoVulnerablePlayerId: null,
      pendingActionState: null,
      inspectionHand: null,
      roundWinner: null,
      setAsideCards: [],
      eliminatedPlayerIds: [],
      eliminatedBonusCount: 0,
      updatedAt: ctx.timestamp,
    };

    return { nextState, events: ctx.events };
  }

  private static processPlayCard(
    state: GameState,
    action: { playerId: string; cardId: string; chosenColor?: CardColor },
    rng: RandomNumberGenerator,
    ctx: ActionContext
  ): ActionProcessResult {
    const playerIndex = state.currentPlayerIndex;
    const player = state.players[playerIndex];
    const card = player.hand.find((c) => c.id === action.cardId)!;

    // Remove played card from hand
    let remainingHand = player.hand.filter((c) => c.id !== action.cardId);

    // Active color determination
    let activeColor: CardColor | null = card.color;
    if (card.type === 'wild') {
      if (card.value === 'wild_color_roulette') {
        activeColor = state.activeColor;
      } else {
        activeColor = action.chosenColor!;
      }
    }

    const newDiscardPile = [...state.discardPile];

    // Discard All: Discard all cards matching color beneath top Discard All card
    if (card.value === 'discard_all') {
      const matchingCards = remainingHand.filter((c) => c.color === card.color);
      remainingHand = remainingHand.filter((c) => c.color !== card.color);

      // Place matching cards into discard pile beneath the Discard All card
      newDiscardPile.push(...matchingCards);
      newDiscardPile.push(card);

      ctx.addEvent('CARDS_DISCARDED', player.id, {
        cardId: card.id,
        discardedBeneathCount: matchingCards.length,
        discardedCardIds: matchingCards.map((c) => c.id),
      });
    } else {
      newDiscardPile.push(card);
    }

    ctx.addEvent('CARD_PLAYED', player.id, {
      cardId: card.id,
      card,
      chosenColor: activeColor,
    });

    // UNO vulnerability & declarations check
    let unoVulnerablePlayerId: string | null = null;
    let hasDeclaredUno = player.hasDeclaredUno;

    if (remainingHand.length === 1) {
      if (hasDeclaredUno) {
        unoVulnerablePlayerId = null;
      } else {
        unoVulnerablePlayerId = player.id;
      }
    } else {
      hasDeclaredUno = false;
      unoVulnerablePlayerId = null;
    }

    let updatedPlayers = state.players.map((p, idx) =>
      idx === playerIndex
        ? {
            ...p,
            hand: remainingHand,
            hasDeclaredUno,
            hasDrawnThisTurn: false,
            drawnCardId: null,
          }
        : p
    );

    // Win condition check (hand emptied)
    if (remainingHand.length === 0) {
      return this.resolveRoundWin(
        state,
        updatedPlayers,
        player,
        newDiscardPile,
        card,
        activeColor,
        ctx
      );
    }

    // Resolve card effects
    const activePlayers = this.getActivePlayers(updatedPlayers);
    const activeCount = activePlayers.length;
    let turnDirection = state.turnDirection;
    let nextPlayerIndex = playerIndex;
    let pendingActionState: PendingActionState | null = null;

    if (card.type === 'number') {
      if (card.value === '0') {
        // 0's Pass: Atomic snapshot hand transfer in turnDirection
        updatedPlayers = this.apply0sPass(updatedPlayers, turnDirection, ctx);
        nextPlayerIndex = this.getNextActivePlayerIndex(playerIndex, updatedPlayers, turnDirection, 1);
      } else if (card.value === '7') {
        // 7's Swap: Mandatory swap with another active player
        pendingActionState = {
          type: 'AWAITING_7S_SWAP_SELECTION',
          sourcePlayerId: player.id,
        };
        ctx.addEvent('PENDING_7S_SWAP', player.id, { sourcePlayerId: player.id });
      } else {
        nextPlayerIndex = this.getNextActivePlayerIndex(playerIndex, updatedPlayers, turnDirection, 1);
      }
    } else if (card.type === 'action') {
      if (card.value === 'skip') {
        if (activeCount === 2) {
          nextPlayerIndex = playerIndex;
        } else {
          nextPlayerIndex = this.getNextActivePlayerIndex(playerIndex, updatedPlayers, turnDirection, 2);
        }
        ctx.addEvent('PLAYER_SKIPPED', undefined, { skippedBy: player.id, nextPlayerIndex });
      } else if (card.value === 'reverse') {
        if (activeCount === 2) {
          nextPlayerIndex = playerIndex;
        } else {
          turnDirection = reverseDirection(turnDirection);
          nextPlayerIndex = this.getNextActivePlayerIndex(playerIndex, updatedPlayers, turnDirection, 1);
        }
        ctx.addEvent('DIRECTION_REVERSED', player.id, { turnDirection });
      } else if (card.value === 'skip_everyone') {
        nextPlayerIndex = playerIndex;
        ctx.addEvent('SKIP_EVERYONE', player.id, {});
      } else if (card.value === 'draw_two' || card.value === 'draw_four') {
        const penalty = getNoMercyDrawPenalty(card.value)!;
        const targetIndex = this.getNextActivePlayerIndex(playerIndex, updatedPlayers, turnDirection, 1);
        const targetPlayer = updatedPlayers[targetIndex];

        pendingActionState = {
          type: 'AWAITING_STACK_RESOLUTION',
          targetPlayerId: targetPlayer.id,
          playedByPlayerId: player.id,
          accumulatedPenalty: penalty,
          lastStackedValue: penalty,
          lastCardValue: card.value,
        };
        nextPlayerIndex = targetIndex;
        ctx.addEvent('STACK_PENALTY_PENDING', targetPlayer.id, {
          targetPlayerId: targetPlayer.id,
          accumulatedPenalty: penalty,
          lastStackedValue: penalty,
        });
      } else if (card.value === 'discard_all') {
        nextPlayerIndex = this.getNextActivePlayerIndex(playerIndex, updatedPlayers, turnDirection, 1);
      }
    } else if (card.type === 'wild') {
      if (card.value === 'wild_reverse_draw_four') {
        turnDirection = reverseDirection(turnDirection);
        ctx.addEvent('DIRECTION_REVERSED', player.id, { turnDirection });

        let targetIndex: number;
        if (activeCount === 2) {
          targetIndex = playerIndex;
        } else {
          targetIndex = this.getNextActivePlayerIndex(playerIndex, updatedPlayers, turnDirection, 1);
        }

        const targetPlayer = updatedPlayers[targetIndex];
        pendingActionState = {
          type: 'AWAITING_STACK_RESOLUTION',
          targetPlayerId: targetPlayer.id,
          playedByPlayerId: player.id,
          accumulatedPenalty: 4,
          lastStackedValue: 4,
          lastCardValue: 'wild_reverse_draw_four',
        };
        nextPlayerIndex = targetIndex;
        ctx.addEvent('STACK_PENALTY_PENDING', targetPlayer.id, {
          targetPlayerId: targetPlayer.id,
          accumulatedPenalty: 4,
          lastStackedValue: 4,
        });
      } else if (card.value === 'wild_draw_six' || card.value === 'wild_draw_ten') {
        const penalty = getNoMercyDrawPenalty(card.value)!;
        const targetIndex = this.getNextActivePlayerIndex(playerIndex, updatedPlayers, turnDirection, 1);
        const targetPlayer = updatedPlayers[targetIndex];

        pendingActionState = {
          type: 'AWAITING_STACK_RESOLUTION',
          targetPlayerId: targetPlayer.id,
          playedByPlayerId: player.id,
          accumulatedPenalty: penalty,
          lastStackedValue: penalty,
          lastCardValue: card.value,
        };
        nextPlayerIndex = targetIndex;
        ctx.addEvent('STACK_PENALTY_PENDING', targetPlayer.id, {
          targetPlayerId: targetPlayer.id,
          accumulatedPenalty: penalty,
          lastStackedValue: penalty,
        });
      } else if (card.value === 'wild_color_roulette') {
        const targetIndex = this.getNextActivePlayerIndex(playerIndex, updatedPlayers, turnDirection, 1);
        const targetPlayer = updatedPlayers[targetIndex];

        pendingActionState = {
          type: 'AWAITING_COLOR_ROULETTE_SELECTION',
          victimPlayerId: targetPlayer.id,
          playedByPlayerId: player.id,
        };
        nextPlayerIndex = targetIndex;
        ctx.addEvent('PENDING_COLOR_ROULETTE', targetPlayer.id, {
          victimPlayerId: targetPlayer.id,
          playedByPlayerId: player.id,
        });
      }
    }

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      currentPlayerIndex: nextPlayerIndex,
      turnDirection,
      discardPile: newDiscardPile,
      topDiscardCard: card,
      activeColor,
      turnNumber: state.turnNumber + 1,
      sequenceNumber: ctx.getSeq(),
      unoVulnerablePlayerId,
      pendingActionState,
      updatedAt: ctx.timestamp,
    };

    return { nextState, events: ctx.events };
  }

  private static processPendingAction(
    state: GameState,
    action: GameAction,
    rng: RandomNumberGenerator,
    ctx: ActionContext
  ): ActionProcessResult {
    const pending = state.pendingActionState!;

    if (pending.type === 'AWAITING_STACK_RESOLUTION') {
      if (action.type === 'PLAY_CARD') {
        return this.processStackPlay(state, action, rng, ctx);
      }
      if (action.type === 'ACCEPT_STACK_PENALTY' || action.type === 'DRAW_CARD') {
        return this.processStackAccept(state, rng, ctx);
      }
    }

    if (pending.type === 'AWAITING_7S_SWAP_SELECTION') {
      if (action.type === 'CHOOSE_7S_SWAP_TARGET') {
        return this.process7sSwapTarget(state, action, ctx);
      }
    }

    if (pending.type === 'AWAITING_COLOR_ROULETTE_SELECTION') {
      if (action.type === 'CHOOSE_COLOR_ROULETTE_COLOR') {
        return this.processColorRouletteSelection(state, action, rng, ctx);
      }
    }

    throw new Error(`Invalid action ${action.type} for pending state ${pending.type}.`);
  }

  private static processStackPlay(
    state: GameState,
    action: { playerId: string; cardId: string; chosenColor?: CardColor },
    rng: RandomNumberGenerator,
    ctx: ActionContext
  ): ActionProcessResult {
    const pending = state.pendingActionState as {
      type: 'AWAITING_STACK_RESOLUTION';
      targetPlayerId: string;
      playedByPlayerId: string;
      accumulatedPenalty: number;
      lastStackedValue: number;
      lastCardValue: CardValue;
    };

    const playerIndex = state.currentPlayerIndex;
    const player = state.players[playerIndex];
    const card = player.hand.find((c) => c.id === action.cardId)!;
    const penalty = getNoMercyStackCardValue(card.value)!;

    const remainingHand = player.hand.filter((c) => c.id !== action.cardId);
    const newDiscardPile = [...state.discardPile, card];

    let activeColor: CardColor | null = card.color;
    if (card.type === 'wild') {
      activeColor = action.chosenColor!;
    }

    ctx.addEvent('CARD_PLAYED', player.id, {
      cardId: card.id,
      card,
      chosenColor: activeColor,
      stackedOn: pending.lastCardValue,
    });

    const accumulatedPenalty = pending.accumulatedPenalty + penalty;

    // Check win condition
    if (remainingHand.length === 0) {
      const updatedPlayers = state.players.map((p, idx) =>
        idx === playerIndex ? { ...p, hand: remainingHand } : p
      );
      return this.resolveRoundWin(
        state,
        updatedPlayers,
        player,
        newDiscardPile,
        card,
        activeColor,
        ctx
      );
    }

    let turnDirection = state.turnDirection;
    if (card.value === 'wild_reverse_draw_four') {
      turnDirection = reverseDirection(turnDirection);
      ctx.addEvent('DIRECTION_REVERSED', player.id, { turnDirection });
    }

    const nextTargetIndex = this.getNextActivePlayerIndex(playerIndex, state.players, turnDirection, 1);
    const nextTargetPlayer = state.players[nextTargetIndex];

    const updatedPlayers = state.players.map((p, idx) =>
      idx === playerIndex
        ? {
            ...p,
            hand: remainingHand,
            hasDeclaredUno: remainingHand.length === 1 ? p.hasDeclaredUno : false,
          }
        : p
    );

    const nextPendingState: PendingActionState = {
      type: 'AWAITING_STACK_RESOLUTION',
      targetPlayerId: nextTargetPlayer.id,
      playedByPlayerId: player.id,
      accumulatedPenalty,
      lastStackedValue: penalty,
      lastCardValue: card.value,
    };

    ctx.addEvent('STACK_PENALTY_PENDING', nextTargetPlayer.id, {
      targetPlayerId: nextTargetPlayer.id,
      accumulatedPenalty,
      lastStackedValue: penalty,
    });

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      currentPlayerIndex: nextTargetIndex,
      turnDirection,
      discardPile: newDiscardPile,
      topDiscardCard: card,
      activeColor,
      turnNumber: state.turnNumber + 1,
      sequenceNumber: ctx.getSeq(),
      pendingActionState: nextPendingState,
      updatedAt: ctx.timestamp,
    };

    return { nextState, events: ctx.events };
  }

  private static processStackAccept(
    state: GameState,
    rng: RandomNumberGenerator,
    ctx: ActionContext
  ): ActionProcessResult {
    const pending = state.pendingActionState as {
      type: 'AWAITING_STACK_RESOLUTION';
      targetPlayerId: string;
      playedByPlayerId: string;
      accumulatedPenalty: number;
      lastStackedValue: number;
      lastCardValue: CardValue;
    };

    const targetIdx = state.players.findIndex((p) => p.id === pending.targetPlayerId);
    const playerIndex = targetIdx !== -1 ? targetIdx : state.currentPlayerIndex;
    const player = state.players[playerIndex];

    const { drawnCards, newDrawPile, newDiscardPile, newSetAsideCards } = this.drawCards(
      state.drawPile,
      state.discardPile,
      pending.accumulatedPenalty,
      state.setAsideCards || [],
      rng
    );

    const newHand = [...player.hand, ...drawnCards];

    ctx.addEvent('STACK_PENALTY_RESOLVED', player.id, {
      targetPlayerId: player.id,
      drawnCount: drawnCards.length,
      drawnCards,
    });

    // Check Mercy Rule (>= 25 cards in hand)
    if (newHand.length >= UNO_NO_MERCY_RULES.MERCY_HAND_LIMIT) {
      return this.applyMercyElimination(
        state,
        playerIndex,
        newHand,
        newDrawPile,
        newDiscardPile,
        ctx,
        undefined,
        newSetAsideCards
      );
    }

    // Normal penalty resolution: player draws cards and loses turn
    const updatedPlayers = state.players.map((p, idx) =>
      idx === playerIndex
        ? {
            ...p,
            hand: newHand,
            hasDeclaredUno: false,
            hasDrawnThisTurn: false,
          }
        : p
    );

    const nextPlayerIndex = this.getNextActivePlayerIndex(
      playerIndex,
      updatedPlayers,
      state.turnDirection,
      1
    );

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      currentPlayerIndex: nextPlayerIndex,
      drawPile: newDrawPile,
      discardPile: newDiscardPile,
      setAsideCards: newSetAsideCards,
      turnNumber: state.turnNumber + 1,
      sequenceNumber: ctx.getSeq(),
      pendingActionState: null,
      updatedAt: ctx.timestamp,
    };

    return { nextState, events: ctx.events };
  }

  private static process7sSwapTarget(
    state: GameState,
    action: { playerId: string; targetPlayerId: string },
    ctx: ActionContext
  ): ActionProcessResult {
    const pending = state.pendingActionState as { type: string; sourcePlayerId?: string } | null;
    const sourcePlayerId = pending?.sourcePlayerId || action.playerId;
    if (action.playerId !== sourcePlayerId) {
      throw new Error('Only the player who played the 7 card can choose a swap target.');
    }

    const sourceIndex = state.players.findIndex((p) => p.id === sourcePlayerId);
    if (sourceIndex === -1) {
      throw new Error(`Source player ${sourcePlayerId} not found in game.`);
    }
    const sourcePlayer = state.players[sourceIndex];

    const targetIndex = state.players.findIndex((p) => p.id === action.targetPlayerId);
    if (targetIndex === -1) {
      throw new Error(`Target player ${action.targetPlayerId} not found in game.`);
    }
    const targetPlayer = state.players[targetIndex];

    if (sourcePlayer.id === targetPlayer.id) {
      throw new Error('Cannot swap hands with yourself.');
    }
    if (targetPlayer.isEliminated) {
      throw new Error('Cannot swap hands with an eliminated player.');
    }

    const sourceHand = [...sourcePlayer.hand];
    const targetHand = [...targetPlayer.hand];

    const updatedPlayers = state.players.map((p, idx) => {
      if (idx === sourceIndex) {
        return {
          ...p,
          hand: targetHand,
          hasDeclaredUno: targetHand.length === 1 ? false : p.hasDeclaredUno,
        };
      }
      if (idx === targetIndex) {
        return {
          ...p,
          hand: sourceHand,
          hasDeclaredUno: sourceHand.length === 1 ? false : p.hasDeclaredUno,
        };
      }
      return p;
    });

    ctx.addEvent('HANDS_SWAPPED_7S', sourcePlayer.id, {
      sourcePlayerId: sourcePlayer.id,
      targetPlayerId: targetPlayer.id,
      sourceHandSize: targetHand.length,
      targetHandSize: sourceHand.length,
    });

    const nextPlayerIndex = this.getNextActivePlayerIndex(
      sourceIndex,
      updatedPlayers,
      state.turnDirection,
      1
    );

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      currentPlayerIndex: nextPlayerIndex,
      turnNumber: state.turnNumber + 1,
      sequenceNumber: ctx.getSeq(),
      pendingActionState: null,
      updatedAt: ctx.timestamp,
    };

    return { nextState, events: ctx.events };
  }

  private static processColorRouletteSelection(
    state: GameState,
    action: { playerId: string; chosenColor: CardColor },
    rng: RandomNumberGenerator,
    ctx: ActionContext
  ): ActionProcessResult {
    const victimIndex = state.currentPlayerIndex;
    const victim = state.players[victimIndex];

    const { drawnCards, newDrawPile, newDiscardPile, newSetAsideCards } = this.drawUntilColor(
      state.drawPile,
      state.discardPile,
      action.chosenColor,
      state.setAsideCards || [],
      rng
    );

    const newHand = [...victim.hand, ...drawnCards];

    ctx.addEvent('ROULETTE_RESOLVED', victim.id, {
      victimPlayerId: victim.id,
      chosenColor: action.chosenColor,
      drawnCount: drawnCards.length,
      drawnCards,
    });

    // Check Mercy Rule on victim
    if (newHand.length >= UNO_NO_MERCY_RULES.MERCY_HAND_LIMIT) {
      return this.applyMercyElimination(
        state,
        victimIndex,
        newHand,
        newDrawPile,
        newDiscardPile,
        ctx,
        action.chosenColor,
        newSetAsideCards
      );
    }

    const updatedPlayers = state.players.map((p, idx) =>
      idx === victimIndex
        ? {
            ...p,
            hand: newHand,
            hasDeclaredUno: false,
          }
        : p
    );

    // Victim loses their turn: turn passes to active player after victim
    const nextPlayerIndex = this.getNextActivePlayerIndex(
      victimIndex,
      updatedPlayers,
      state.turnDirection,
      1
    );

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      currentPlayerIndex: nextPlayerIndex,
      drawPile: newDrawPile,
      discardPile: newDiscardPile,
      setAsideCards: newSetAsideCards,
      activeColor: action.chosenColor,
      turnNumber: state.turnNumber + 1,
      sequenceNumber: ctx.getSeq(),
      pendingActionState: null,
      updatedAt: ctx.timestamp,
    };

    return { nextState, events: ctx.events };
  }

  private static processDrawCard(
    state: GameState,
    action: { playerId: string; chosenColor?: CardColor },
    rng: RandomNumberGenerator,
    ctx: ActionContext
  ): ActionProcessResult {
    const playerIndex = state.currentPlayerIndex;
    const player = state.players[playerIndex];

    // Custom Rule for UNO No Mercy: Normal draw draws exactly ONE card
    const { drawnCards, newDrawPile, newDiscardPile, newSetAsideCards } = this.drawCards(
      state.drawPile,
      state.discardPile,
      1,
      state.setAsideCards || [],
      rng
    );

    const drawnCard = drawnCards[0];
    const newHand: Card[] = drawnCard ? [...player.hand, drawnCard] : [...player.hand];

    // Check Mercy Rule during drawing
    if (newHand.length >= UNO_NO_MERCY_RULES.MERCY_HAND_LIMIT) {
      return this.applyMercyElimination(
        state,
        playerIndex,
        newHand,
        newDrawPile,
        newDiscardPile,
        ctx,
        undefined,
        newSetAsideCards
      );
    }

    const isPlayable = drawnCard
      ? NoMercyMoveValidator.isCardMatch(drawnCard, state.activeColor, state.topDiscardCard)
      : false;

    ctx.addEvent('CARD_DRAWN', player.id, {
      count: drawnCards.length,
      drawnCards,
      isPlayable,
    });

    // If a playable card was drawn, keep turn with player so they can explicitly play it or keep it (pass)
    if (isPlayable && drawnCard) {
      const updatedPlayers = state.players.map((p, idx) =>
        idx === playerIndex
          ? {
              ...p,
              hand: newHand,
              hasDrawnThisTurn: true,
              drawnCardId: drawnCard.id,
              hasDeclaredUno: false,
            }
          : p
      );

      const nextState: GameState = {
        ...state,
        players: updatedPlayers,
        drawPile: newDrawPile,
        discardPile: newDiscardPile,
        setAsideCards: newSetAsideCards,
        unoVulnerablePlayerId: null,
        sequenceNumber: ctx.getSeq(),
        updatedAt: ctx.timestamp,
      };

      assertValidNoMercyGameState(nextState);
      return { nextState, events: ctx.events };
    }

    // Unplayable card drawn: automatically advance turn to next active player
    const updatedPlayers = state.players.map((p, idx) =>
      idx === playerIndex
        ? {
            ...p,
            hand: newHand,
            hasDrawnThisTurn: false,
            drawnCardId: null,
            hasDeclaredUno: false,
          }
        : p
    );

    const nextPlayerIndex = this.getNextActivePlayerIndex(
      playerIndex,
      updatedPlayers,
      state.turnDirection,
      1
    );

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      currentPlayerIndex: nextPlayerIndex,
      drawPile: newDrawPile,
      discardPile: newDiscardPile,
      setAsideCards: newSetAsideCards,
      turnNumber: state.turnNumber + 1,
      sequenceNumber: ctx.getSeq(),
      updatedAt: ctx.timestamp,
    };

    assertValidNoMercyGameState(nextState);
    return { nextState, events: ctx.events };
  }

  private static processPassTurn(
    state: GameState,
    playerId: string,
    ctx: ActionContext
  ): ActionProcessResult {
    const playerIndex = state.currentPlayerIndex;

    const updatedPlayers = state.players.map((p, idx) =>
      idx === playerIndex
        ? {
            ...p,
            hasDrawnThisTurn: false,
            drawnCardId: null,
          }
        : p
    );

    const nextPlayerIndex = this.getNextActivePlayerIndex(
      playerIndex,
      updatedPlayers,
      state.turnDirection,
      1
    );

    ctx.addEvent('TURN_PASSED', playerId, { nextPlayerIndex });

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      currentPlayerIndex: nextPlayerIndex,
      unoVulnerablePlayerId: null,
      sequenceNumber: ctx.getSeq(),
      turnNumber: state.turnNumber + 1,
      updatedAt: ctx.timestamp,
    };

    assertValidNoMercyGameState(nextState);
    return { nextState, events: ctx.events };
  }

  private static processCallUno(
    state: GameState,
    action: { playerId: string },
    ctx: ActionContext
  ): ActionProcessResult {
    const playerIndex = state.players.findIndex((p) => p.id === action.playerId);
    const updatedPlayers = state.players.map((p, idx) =>
      idx === playerIndex ? { ...p, hasDeclaredUno: true } : p
    );

    ctx.addEvent('UNO_CALLED', action.playerId, {});

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      unoVulnerablePlayerId: null,
      sequenceNumber: ctx.getSeq(),
      updatedAt: ctx.timestamp,
    };

    return { nextState, events: ctx.events };
  }

  private static processChallengeUno(
    state: GameState,
    action: { challengerPlayerId: string; targetPlayerId: string },
    rng: RandomNumberGenerator,
    ctx: ActionContext
  ): ActionProcessResult {
    const targetIndex = state.players.findIndex((p) => p.id === action.targetPlayerId);
    const targetPlayer = state.players[targetIndex];

    const { drawnCards, newDrawPile, newDiscardPile, newSetAsideCards } = this.drawCards(
      state.drawPile,
      state.discardPile,
      UNO_NO_MERCY_RULES.MISSED_UNO_PENALTY_CARDS,
      state.setAsideCards || [],
      rng
    );

    const newHand = [...targetPlayer.hand, ...drawnCards];

    ctx.addEvent('UNO_CHALLENGED', action.challengerPlayerId, {
      challengerPlayerId: action.challengerPlayerId,
      targetPlayerId: targetPlayer.id,
      penaltyCards: drawnCards.length,
    });

    // Check Mercy Rule on penalized player
    if (newHand.length >= UNO_NO_MERCY_RULES.MERCY_HAND_LIMIT) {
      return this.applyMercyElimination(
        state,
        targetIndex,
        newHand,
        newDrawPile,
        newDiscardPile,
        ctx,
        undefined,
        newSetAsideCards
      );
    }

    const updatedPlayers = state.players.map((p, idx) =>
      idx === targetIndex
        ? {
            ...p,
            hand: newHand,
            hasDeclaredUno: false,
          }
        : p
    );

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      drawPile: newDrawPile,
      discardPile: newDiscardPile,
      setAsideCards: newSetAsideCards,
      unoVulnerablePlayerId: null,
      sequenceNumber: ctx.getSeq(),
      updatedAt: ctx.timestamp,
    };

    return { nextState, events: ctx.events };
  }

  /**
   * Applies the Mercy Rule to eliminate a player who reached 25+ cards in hand.
   */
  private static applyMercyElimination(
    state: GameState,
    eliminatedPlayerIndex: number,
    eliminatedHand: Card[],
    drawPile: Card[],
    discardPile: Card[],
    ctx: ActionContext,
    activeColorOverride?: CardColor | null,
    currentSetAsideCards: readonly Card[] = state.setAsideCards || []
  ): ActionProcessResult {
    const eliminatedPlayer = state.players[eliminatedPlayerIndex];
    const setAsideCards = [...currentSetAsideCards, ...eliminatedHand];
    const eliminatedPlayerIds = [...(state.eliminatedPlayerIds || []), eliminatedPlayer.id];
    const eliminatedBonusCount = (state.eliminatedBonusCount || 0) + 1;
    const eliminationOrder = eliminatedPlayerIds.length;

    const updatedPlayers = state.players.map((p, idx) =>
      idx === eliminatedPlayerIndex
        ? {
            ...p,
            hand: [],
            isEliminated: true,
            eliminationOrder,
          }
        : p
    );

    ctx.addEvent('PLAYER_ELIMINATED', eliminatedPlayer.id, {
      playerId: eliminatedPlayer.id,
      cardCount: eliminatedHand.length,
      eliminationOrder,
    });

    const activePlayers = this.getActivePlayers(updatedPlayers);

    // If only 1 player remains, they win the match/game!
    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      const roundScore = this.calculateRoundScore(
        updatedPlayers,
        winner.id,
        eliminatedBonusCount
      );
      const totalScore = winner.score + roundScore;

      const updatedPlayersWithScore = updatedPlayers.map((p) =>
        p.id === winner.id ? { ...p, score: totalScore } : p
      );

      const gameWinner: GameWinner = {
        id: winner.id,
        username: winner.username,
        score: totalScore,
      };

      ctx.addEvent('GAME_WON', winner.id, {
        winnerId: winner.id,
        score: totalScore,
        wonByLastStanding: true,
      });

      const nextState: GameState = {
        ...state,
        status: 'COMPLETED',
        players: updatedPlayersWithScore,
        drawPile,
        discardPile,
        setAsideCards,
        eliminatedPlayerIds,
        eliminatedBonusCount,
        activeColor: activeColorOverride !== undefined ? activeColorOverride : state.activeColor,
        winner: gameWinner,
        roundWinner: gameWinner,
        pendingActionState: null,
        sequenceNumber: ctx.getSeq(),
        updatedAt: ctx.timestamp,
      };

      return { nextState, events: ctx.events };
    }

    // More than 1 player remains: advance turn to next active player
    const nextPlayerIndex = this.getNextActivePlayerIndex(
      eliminatedPlayerIndex,
      updatedPlayers,
      state.turnDirection,
      1
    );

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      currentPlayerIndex: nextPlayerIndex,
      drawPile,
      discardPile,
      setAsideCards,
      eliminatedPlayerIds,
      eliminatedBonusCount,
      activeColor: activeColorOverride !== undefined ? activeColorOverride : state.activeColor,
      turnNumber: state.turnNumber + 1,
      sequenceNumber: ctx.getSeq(),
      pendingActionState: null,
      updatedAt: ctx.timestamp,
    };

    return { nextState, events: ctx.events };
  }

  /**
   * Resolves a round won by emptying hand.
   */
  private static resolveRoundWin(
    state: GameState,
    players: Player[],
    winner: Player,
    discardPile: Card[],
    topDiscardCard: Card,
    activeColor: CardColor | null,
    ctx: ActionContext
  ): ActionProcessResult {
    const roundScore = this.calculateRoundScore(
      players,
      winner.id,
      state.eliminatedBonusCount || 0
    );
    const totalScore = winner.score + roundScore;

    const updatedPlayers = players.map((p) =>
      p.id === winner.id ? { ...p, score: totalScore } : p
    );

    const roundWinner: GameWinner = {
      id: winner.id,
      username: winner.username,
      score: totalScore,
    };

    const isMatchOver = totalScore >= state.targetScore;

    ctx.addEvent('ROUND_WON', winner.id, {
      winnerId: winner.id,
      roundScore,
      totalScore,
      isMatchOver,
    });

    if (isMatchOver) {
      ctx.addEvent('GAME_WON', winner.id, {
        winnerId: winner.id,
        score: totalScore,
      });
    }

    const nextState: GameState = {
      ...state,
      status: isMatchOver ? 'COMPLETED' : 'ROUND_OVER',
      players: updatedPlayers,
      discardPile,
      topDiscardCard,
      activeColor,
      roundWinner,
      winner: isMatchOver ? roundWinner : null,
      pendingActionState: null,
      sequenceNumber: ctx.getSeq(),
      updatedAt: ctx.timestamp,
    };

    return { nextState, events: ctx.events };
  }

  /**
   * Applies 0's Pass: atomic snapshot transfer across all active players in current play direction.
   */
  private static apply0sPass(
    players: Player[],
    turnDirection: 'clockwise' | 'counter_clockwise',
    ctx: ActionContext
  ): Player[] {
    const activeIndices: number[] = [];
    players.forEach((p, idx) => {
      if (!p.isEliminated) {
        activeIndices.push(idx);
      }
    });

    const activeCount = activeIndices.length;
    if (activeCount <= 1) {
      return players;
    }

    // Pre-transfer snapshot of hands
    const handSnapshot = activeIndices.map((idx) => [...players[idx].hand]);

    // Map each player to their new hand
    const newHands = new Map<number, Card[]>();

    for (let i = 0; i < activeCount; i++) {
      let toI: number;
      if (turnDirection === 'clockwise') {
        toI = (i + 1) % activeCount;
      } else {
        toI = (i - 1 + activeCount) % activeCount;
      }
      const toIdx = activeIndices[toI];
      newHands.set(toIdx, handSnapshot[i]);
    }

    ctx.addEvent('HANDS_PASSED_0S', undefined, {
      activePlayerCount: activeCount,
      turnDirection,
    });

    return players.map((p, idx) => {
      if (newHands.has(idx)) {
        const receivedHand = newHands.get(idx)!;
        return {
          ...p,
          hand: receivedHand,
          hasDeclaredUno: receivedHand.length === 1 ? false : p.hasDeclaredUno,
        };
      }
      return p;
    });
  }

  /**
   * Finds the most prevalent color in a hand for optimal wild choice fallback.
   */
  private static getOptimalColor(hand: readonly Card[], fallbackColor: CardColor | null): CardColor {
    const colorCounts: Record<'red' | 'yellow' | 'green' | 'blue', number> = {
      red: 0,
      yellow: 0,
      green: 0,
      blue: 0,
    };

    for (const card of hand) {
      if (card.color && card.color in colorCounts) {
        colorCounts[card.color as 'red' | 'yellow' | 'green' | 'blue']++;
      }
    }

    let bestColor: CardColor = fallbackColor && fallbackColor in colorCounts ? fallbackColor : 'red';
    let maxCount = -1;

    for (const color of ['red', 'yellow', 'green', 'blue'] as const) {
      if (colorCounts[color] > maxCount) {
        maxCount = colorCounts[color];
        bestColor = color;
      }
    }

    return bestColor;
  }
}
