import { GameState, GameWinner } from '../../game/game.types';
import { GameAction, GameEventRecord } from '../../actions/action.types';
import { ActionProcessResult } from '../../actions/action.processor';
import { Card } from '../../cards/card.types';
import { Player } from '../../players/player.types';
import { TurnDirection } from '../../turns/turn.direction';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../../deck/deck.shuffle';
import { AllWildMoveValidator } from './all-wild.validator';
import { UNO_ALL_WILD_RULES } from './all-wild.constants';
import { assertValidAllWildGameState } from './all-wild.invariants';
import { AllWildDeckFactory } from './all-wild.deck';
import { HandManager } from '../../players/hand.manager';

interface DrawResult {
  readonly drawnCards: Card[];
  readonly nextDrawPile: Card[];
  readonly nextDiscardPile: Card[];
}

interface ActionContext {
  readonly timestamp: string;
  readonly events: GameEventRecord[];
  nextSeq: () => number;
  addEvent: (type: string, playerId: string | undefined, payload: Record<string, unknown>) => void;
}

export class AllWildActionProcessor {
  /**
   * Authoritative action processor for UNO All Wild (Mattel HHL33).
   */
  static process(
    state: GameState,
    action: GameAction,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): ActionProcessResult {
    // 1. Move validation
    const validation = AllWildMoveValidator.validate(state, action);
    if (!validation.valid) {
      throw new Error(`[${validation.code}] ${validation.message}`);
    }

    const events: GameEventRecord[] = [];
    const timestamp = new Date().toISOString();
    let currentSeq = state.sequenceNumber;

    const ctx: ActionContext = {
      timestamp,
      events,
      nextSeq: () => ++currentSeq,
      addEvent: (type: string, playerId: string | undefined, payload: Record<string, unknown>) => {
        currentSeq++;
        events.push({
          sequenceNumber: currentSeq,
          type,
          playerId,
          payload,
          timestamp,
        });
      },
    };

    switch (action.type) {
      case 'PLAY_CARD':
        return this.processPlayCard(state, action.playerId, action.cardId, action.declareUno, ctx, rng);

      case 'DRAW_CARD':
        return this.processDrawCard(state, action.playerId, ctx, rng);

      case 'PASS_TURN':
        return this.processPassTurn(state, action.playerId, ctx);

      case 'CALL_UNO':
        return this.processCallUno(state, action.playerId, ctx);

      case 'CHALLENGE_UNO_FAILURE':
        return this.processChallengeUno(state, action.challengerPlayerId, action.targetPlayerId, ctx, rng);

      case 'CHOOSE_TARGETED_DRAW_TWO_TARGET':
        return this.processTargetedDrawTwo(state, action.playerId, action.targetPlayerId, ctx, rng);

      case 'CHOOSE_FORCED_SWAP_TARGET':
        return this.processForcedSwap(state, action.playerId, action.targetPlayerId, ctx);

      case 'START_NEXT_ROUND':
        return this.processStartNextRound(state, action.triggeredByPlayerId, ctx, rng);

      default:
        throw new Error(`Unsupported action type '${(action as GameAction).type}' for UNO All Wild.`);
    }
  }

  private static processPlayCard(
    state: GameState,
    playerId: string,
    cardId: string,
    declareUno: boolean | undefined,
    ctx: ActionContext,
    rng: RandomNumberGenerator
  ): ActionProcessResult {
    const playerIndex = state.currentPlayerIndex;
    const player = state.players[playerIndex];
    const card = player.hand.find((c) => c.id === cardId)!;

    // Remove card from player's hand
    const nextHand = player.hand.filter((c) => c.id !== cardId);
    const hasDeclared = nextHand.length === 1 ? (player.hasDeclaredUno || !!declareUno) : false;
    if (nextHand.length === 1 && declareUno && !player.hasDeclaredUno) {
      ctx.addEvent('UNO_CALLED', player.id, { playerId: player.id, declaredWithPlay: true });
    }
    const updatedPlayer: Player = {
      ...player,
      hand: nextHand,
      hasDrawnThisTurn: false,
      drawnCardId: null,
      hasDeclaredUno: hasDeclared,
    };

    // Update discard pile: played card becomes the top discard card
    const nextDiscardPile = [...state.discardPile, card];
    const nextTopDiscardCard = card;

    let updatedPlayers = state.players.map((p, idx) => (idx === playerIndex ? updatedPlayer : p));
    let nextDrawPile = [...state.drawPile];
    let nextDiscard = nextDiscardPile;
    let nextTurnDirection = state.turnDirection;
    let nextPlayerIndex = playerIndex;
    let nextUnoVulnerablePlayerId: string | null = null;
    let pendingActionState = null;

    // Check UNO vulnerability:
    // If player now holds exactly 1 card and has NOT declared UNO, they become vulnerable.
    if (nextHand.length === 1 && !updatedPlayer.hasDeclaredUno) {
      nextUnoVulnerablePlayerId = player.id;
    }

    ctx.addEvent('CARD_PLAYED', player.id, {
      cardId: card.id,
      cardValue: card.value,
      remainingCards: nextHand.length,
    });

    const playerCount = updatedPlayers.length;

    // Execute card action
    switch (card.value) {
      case 'wild':
        // Standard Wild: No action effect. Advance 1 step.
        nextPlayerIndex = this.getNextPlayerIndex(playerIndex, playerCount, nextTurnDirection, 1);
        break;

      case 'wild_reverse':
        // Wild Reverse: Reverses turn direction.
        nextTurnDirection = nextTurnDirection === 'clockwise' ? 'counter_clockwise' : 'clockwise';
        ctx.addEvent('DIRECTION_REVERSED', player.id, { newDirection: nextTurnDirection });

        if (playerCount === 2) {
          // 2-player rule: Reverse acts like a skip. Play returns to the active player.
          nextPlayerIndex = playerIndex;
        } else {
          nextPlayerIndex = this.getNextPlayerIndex(playerIndex, playerCount, nextTurnDirection, 1);
        }
        break;

      case 'wild_skip':
        // Wild Skip: Next player loses their turn.
        ctx.addEvent('PLAYER_SKIPPED', player.id, {
          skippedPlayerId: updatedPlayers[this.getNextPlayerIndex(playerIndex, playerCount, nextTurnDirection, 1)].id,
        });

        if (playerCount === 2) {
          // 2-player rule: Opponent is skipped, active player takes another turn.
          nextPlayerIndex = playerIndex;
        } else {
          nextPlayerIndex = this.getNextPlayerIndex(playerIndex, playerCount, nextTurnDirection, 2);
        }
        break;

      case 'wild_skip_two':
        // Wild Skip Two: Next two players lose their turns.
        if (playerCount === 2) {
          // 2-player deliberate rule: Opponent is skipped, active player takes another turn.
          ctx.addEvent('PLAYER_SKIPPED', player.id, {
            skippedPlayerId: updatedPlayers[this.getNextPlayerIndex(playerIndex, playerCount, nextTurnDirection, 1)].id,
          });
          nextPlayerIndex = playerIndex;
        } else if (playerCount === 3) {
          // 3-player rule: Skips player +1 and player +2, looping back to active player.
          ctx.addEvent('TWO_PLAYERS_SKIPPED', player.id, {
            firstSkippedId: updatedPlayers[this.getNextPlayerIndex(playerIndex, playerCount, nextTurnDirection, 1)].id,
            secondSkippedId: updatedPlayers[this.getNextPlayerIndex(playerIndex, playerCount, nextTurnDirection, 2)].id,
          });
          nextPlayerIndex = playerIndex;
        } else {
          ctx.addEvent('TWO_PLAYERS_SKIPPED', player.id, {
            firstSkippedId: updatedPlayers[this.getNextPlayerIndex(playerIndex, playerCount, nextTurnDirection, 1)].id,
            secondSkippedId: updatedPlayers[this.getNextPlayerIndex(playerIndex, playerCount, nextTurnDirection, 2)].id,
          });
          nextPlayerIndex = this.getNextPlayerIndex(playerIndex, playerCount, nextTurnDirection, 3);
        }
        break;

      case 'wild_draw_two': {
        // Wild Draw Two: Next player draws 2 cards and loses their turn.
        const victimIndex = this.getNextPlayerIndex(playerIndex, playerCount, nextTurnDirection, 1);
        const victim = updatedPlayers[victimIndex];

        const drawRes = this.drawCards(nextDrawPile, nextDiscard, 2, rng);
        nextDrawPile = drawRes.nextDrawPile;
        nextDiscard = drawRes.nextDiscardPile;

        const updatedVictim: Player = {
          ...victim,
          hand: [...victim.hand, ...drawRes.drawnCards],
          hasDeclaredUno: false,
        };
        updatedPlayers = updatedPlayers.map((p, idx) => (idx === victimIndex ? updatedVictim : p));

        ctx.addEvent('CARDS_DRAWN_PENALTY', victim.id, {
          victimPlayerId: victim.id,
          cardsDrawn: 2,
          skipped: true,
        });

        if (playerCount === 2) {
          nextPlayerIndex = playerIndex;
        } else {
          nextPlayerIndex = this.getNextPlayerIndex(playerIndex, playerCount, nextTurnDirection, 2);
        }
        break;
      }

      case 'wild_draw_four': {
        // Wild Draw Four: Next player draws 4 cards and loses their turn.
        const victimIndex = this.getNextPlayerIndex(playerIndex, playerCount, nextTurnDirection, 1);
        const victim = updatedPlayers[victimIndex];

        const drawRes = this.drawCards(nextDrawPile, nextDiscard, 4, rng);
        nextDrawPile = drawRes.nextDrawPile;
        nextDiscard = drawRes.nextDiscardPile;

        const updatedVictim: Player = {
          ...victim,
          hand: [...victim.hand, ...drawRes.drawnCards],
          hasDeclaredUno: false,
        };
        updatedPlayers = updatedPlayers.map((p, idx) => (idx === victimIndex ? updatedVictim : p));

        ctx.addEvent('CARDS_DRAWN_PENALTY', victim.id, {
          victimPlayerId: victim.id,
          cardsDrawn: 4,
          skipped: true,
        });

        if (playerCount === 2) {
          nextPlayerIndex = playerIndex;
        } else {
          nextPlayerIndex = this.getNextPlayerIndex(playerIndex, playerCount, nextTurnDirection, 2);
        }
        break;
      }

      case 'wild_targeted_draw_two':
        // Wild Targeted Draw Two: Active player chooses target player. Enters pending state.
        pendingActionState = {
          type: 'AWAITING_TARGETED_DRAW_TWO_SELECTION' as const,
          sourcePlayerId: player.id,
        };
        ctx.addEvent('PENDING_TARGETED_DRAW_TWO', player.id, { sourcePlayerId: player.id });
        nextPlayerIndex = playerIndex;
        break;

      case 'wild_forced_swap':
        // Wild Forced Swap: Active player chooses target player to exchange hands with.
        // Per game designer Nick Hayes and Mattel social media ruling, Wild Forced Swap MUST
        // execute even if played as the player's final card. The player must choose an opponent
        // to swap hands with; the chosen opponent receives the 0-card hand and wins the round!
        pendingActionState = {
          type: 'AWAITING_FORCED_SWAP_SELECTION' as const,
          sourcePlayerId: player.id,
        };
        ctx.addEvent('PENDING_FORCED_SWAP', player.id, { sourcePlayerId: player.id });
        nextPlayerIndex = playerIndex;
        break;

      default:
        nextPlayerIndex = this.getNextPlayerIndex(playerIndex, playerCount, nextTurnDirection, 1);
        break;
    }

    // If the played card emptied the player's hand and no pending target selection is required,
    // evaluate round victory immediately after executing the card's action effects.
    if (nextHand.length === 0 && !pendingActionState) {
      return this.handleRoundVictory(
        state,
        playerIndex,
        updatedPlayers,
        nextDrawPile,
        nextDiscard,
        nextTopDiscardCard,
        ctx,
        nextTurnDirection
      );
    }

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      drawPile: nextDrawPile,
      discardPile: nextDiscard,
      topDiscardCard: nextTopDiscardCard,
      currentPlayerIndex: nextPlayerIndex,
      turnDirection: nextTurnDirection,
      unoVulnerablePlayerId: nextUnoVulnerablePlayerId,
      pendingActionState,
      turnNumber: state.turnNumber + 1,
      sequenceNumber: ctx.nextSeq(),
      updatedAt: ctx.timestamp,
    };

    assertValidAllWildGameState(nextState);
    return { nextState, events: ctx.events };
  }

  private static processDrawCard(
    state: GameState,
    playerId: string,
    ctx: ActionContext,
    rng: RandomNumberGenerator
  ): ActionProcessResult {
    const playerIndex = state.currentPlayerIndex;
    const player = state.players[playerIndex];

    const drawRes = this.drawCards(state.drawPile, state.discardPile, 1, rng);
    const drawnCard = drawRes.drawnCards[0];

    const updatedPlayer: Player = {
      ...player,
      hand: [...player.hand, drawnCard],
      hasDrawnThisTurn: true,
      drawnCardId: drawnCard.id,
      hasDeclaredUno: false,
    };

    const nextPlayers = state.players.map((p, idx) => (idx === playerIndex ? updatedPlayer : p));

    ctx.addEvent('CARD_DRAWN', player.id, {
      cardId: drawnCard.id,
      handSize: updatedPlayer.hand.length,
    });

    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      drawPile: drawRes.nextDrawPile,
      discardPile: drawRes.nextDiscardPile,
      unoVulnerablePlayerId: null, // Clear previous vulnerable player as turn has progressed
      sequenceNumber: ctx.nextSeq(),
      updatedAt: ctx.timestamp,
    };

    assertValidAllWildGameState(nextState);
    return { nextState, events: ctx.events };
  }

  private static processPassTurn(
    state: GameState,
    playerId: string,
    ctx: ActionContext
  ): ActionProcessResult {
    const playerIndex = state.currentPlayerIndex;
    const player = state.players[playerIndex];

    const updatedPlayer: Player = {
      ...player,
      hasDrawnThisTurn: false,
      drawnCardId: null,
    };

    const nextPlayers = state.players.map((p, idx) => (idx === playerIndex ? updatedPlayer : p));
    const nextPlayerIndex = this.getNextPlayerIndex(
      playerIndex,
      nextPlayers.length,
      state.turnDirection,
      1
    );

    ctx.addEvent('TURN_PASSED', player.id, { nextPlayerIndex });

    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      currentPlayerIndex: nextPlayerIndex,
      unoVulnerablePlayerId: null,
      sequenceNumber: ctx.nextSeq(),
      turnNumber: state.turnNumber + 1,
      updatedAt: ctx.timestamp,
    };

    assertValidAllWildGameState(nextState);
    return { nextState, events: ctx.events };
  }

  private static processCallUno(
    state: GameState,
    playerId: string,
    ctx: ActionContext
  ): ActionProcessResult {
    const player = state.players.find((p) => p.id === playerId)!;
    const nextPlayers = state.players.map((p) =>
      p.id === playerId ? { ...p, hasDeclaredUno: true } : p
    );

    ctx.addEvent('UNO_CALLED', player.id, { playerId });

    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      unoVulnerablePlayerId: state.unoVulnerablePlayerId,
      sequenceNumber: ctx.nextSeq(),
      updatedAt: ctx.timestamp,
    };

    assertValidAllWildGameState(nextState);
    return { nextState, events: ctx.events };
  }

  private static processChallengeUno(
    state: GameState,
    challengerPlayerId: string,
    targetPlayerId: string,
    ctx: ActionContext,
    rng: RandomNumberGenerator
  ): ActionProcessResult {
    const penaltyCardsCount = UNO_ALL_WILD_RULES.MISSED_UNO_PENALTY_CARDS;
    const targetIndex = state.players.findIndex((p) => p.id === targetPlayerId);
    const targetPlayer = state.players[targetIndex];

    const drawRes = this.drawCards(state.drawPile, state.discardPile, penaltyCardsCount, rng);

    const updatedTarget: Player = {
      ...targetPlayer,
      hand: [...targetPlayer.hand, ...drawRes.drawnCards],
      hasDeclaredUno: false,
    };

    const nextPlayers = state.players.map((p, idx) => (idx === targetIndex ? updatedTarget : p));

    ctx.addEvent('UNO_CHALLENGE_SUCCESS', challengerPlayerId, {
      challengerPlayerId,
      targetPlayerId,
      penaltyCards: penaltyCardsCount,
    });

    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      drawPile: drawRes.nextDrawPile,
      discardPile: drawRes.nextDiscardPile,
      unoVulnerablePlayerId: null,
      sequenceNumber: ctx.nextSeq(),
      updatedAt: ctx.timestamp,
    };

    assertValidAllWildGameState(nextState);
    return { nextState, events: ctx.events };
  }

  private static processTargetedDrawTwo(
    state: GameState,
    sourcePlayerId: string,
    targetPlayerId: string,
    ctx: ActionContext,
    rng: RandomNumberGenerator
  ): ActionProcessResult {
    const targetIndex = state.players.findIndex((p) => p.id === targetPlayerId);
    const targetPlayer = state.players[targetIndex];

    // Target draws exactly 2 cards from draw pile
    const drawRes = this.drawCards(state.drawPile, state.discardPile, 2, rng);

    const updatedTarget: Player = {
      ...targetPlayer,
      hand: [...targetPlayer.hand, ...drawRes.drawnCards],
      hasDeclaredUno: false,
    };

    const nextPlayers = state.players.map((p, idx) => (idx === targetIndex ? updatedTarget : p));

    // Per official HHL33 rules: Target does NOT lose their turn.
    // Turn advances normally to the next player from the source player.
    const sourceIndex = state.players.findIndex((p) => p.id === sourcePlayerId);
    const nextPlayerIndex = this.getNextPlayerIndex(
      sourceIndex,
      nextPlayers.length,
      state.turnDirection,
      1
    );

    ctx.addEvent('TARGETED_DRAW_TWO_RESOLVED', sourcePlayerId, {
      sourcePlayerId,
      targetPlayerId,
      cardsDrawn: 2,
    });

    // Check if any player has 0 cards (e.g. source player played Targeted Draw Two as their final card)
    const winnerIndex = nextPlayers.findIndex((p) => p.hand.length === 0);
    if (winnerIndex !== -1) {
      return this.handleRoundVictory(
        state,
        winnerIndex,
        nextPlayers,
        drawRes.nextDrawPile,
        drawRes.nextDiscardPile,
        state.topDiscardCard,
        ctx,
        state.turnDirection
      );
    }

    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      drawPile: drawRes.nextDrawPile,
      discardPile: drawRes.nextDiscardPile,
      currentPlayerIndex: nextPlayerIndex,
      pendingActionState: null,
      sequenceNumber: ctx.nextSeq(),
      turnNumber: state.turnNumber + 1,
      updatedAt: ctx.timestamp,
    };

    assertValidAllWildGameState(nextState);
    return { nextState, events: ctx.events };
  }

  private static processForcedSwap(
    state: GameState,
    sourcePlayerId: string,
    targetPlayerId: string,
    ctx: ActionContext
  ): ActionProcessResult {
    const sourceIndex = state.players.findIndex((p) => p.id === sourcePlayerId);
    const targetIndex = state.players.findIndex((p) => p.id === targetPlayerId);
    const sourcePlayer = state.players[sourceIndex];
    const targetPlayer = state.players[targetIndex];

    // Entire hands are exchanged
    const newSourceHand = [...targetPlayer.hand];
    const newTargetHand = [...sourcePlayer.hand];

    const updatedSource: Player = {
      ...sourcePlayer,
      hand: newSourceHand,
      hasDeclaredUno: false,
    };

    const updatedTarget: Player = {
      ...targetPlayer,
      hand: newTargetHand,
      hasDeclaredUno: false,
    };

    const nextPlayers = state.players.map((p, idx) => {
      if (idx === sourceIndex) return updatedSource;
      if (idx === targetIndex) return updatedTarget;
      return p;
    });

    ctx.addEvent('HANDS_FORCED_SWAPPED', sourcePlayerId, {
      sourcePlayerId,
      targetPlayerId,
      sourceNewHandSize: newSourceHand.length,
      targetNewHandSize: newTargetHand.length,
    });

    // Check if any player has 0 cards (e.g. if hands were swapped with an empty hand)
    const winnerIndex = nextPlayers.findIndex((p) => p.hand.length === 0);
    if (winnerIndex !== -1) {
      return this.handleRoundVictory(
        state,
        winnerIndex,
        nextPlayers,
        [...state.drawPile],
        [...state.discardPile],
        state.topDiscardCard,
        ctx,
        state.turnDirection
      );
    }

    // Check UNO obligations after swap (when game continues):
    // If either player ends with 1 card, they must announce UNO immediately.
    let nextUnoVulnerable: string | null = null;
    const sourceHasUno = newSourceHand.length === 1;
    const targetHasUno = newTargetHand.length === 1;

    if (sourceHasUno) {
      nextUnoVulnerable = sourcePlayer.id;
    } else if (targetHasUno) {
      nextUnoVulnerable = targetPlayer.id;
    }

    // Advance turn normally to the next player from the source player
    const nextPlayerIndex = this.getNextPlayerIndex(
      sourceIndex,
      nextPlayers.length,
      state.turnDirection,
      1
    );

    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      currentPlayerIndex: nextPlayerIndex,
      pendingActionState: null,
      unoVulnerablePlayerId: nextUnoVulnerable,
      sequenceNumber: ctx.nextSeq(),
      turnNumber: state.turnNumber + 1,
      updatedAt: ctx.timestamp,
    };

    assertValidAllWildGameState(nextState);
    return { nextState, events: ctx.events };
  }

  private static processStartNextRound(
    state: GameState,
    triggeredByPlayerId: string,
    ctx: ActionContext,
    rng: RandomNumberGenerator
  ): ActionProcessResult {
    const playerCount = state.players.length;
    const nextDealerIndex = (state.dealerIndex + 1) % playerCount;

    // 1. Create and shuffle 112-card All Wild deck
    const deck = shuffleDeck(AllWildDeckFactory.createDeck(), rng);

    // 2. Deal 7 cards to each player
    const playerIds = state.players.map((p) => p.id);
    const { hands, remainingDeck } = HandManager.dealInitialHands(
      deck,
      playerIds,
      UNO_ALL_WILD_RULES.INITIAL_HAND_SIZE
    );

    const drawPile = [...remainingDeck];

    // 3. Reveal top card as discard pile. Action effect is ignored.
    const topCard = drawPile.pop()!;
    const discardPile = [topCard];

    const startingPlayerIndex = (nextDealerIndex + 1) % playerCount;

    const nextPlayers: Player[] = state.players.map((p) => ({
      ...p,
      hand: hands.get(p.id)!,
      hasDeclaredUno: false,
      hasDrawnThisTurn: false,
      drawnCardId: null,
    }));

    ctx.addEvent('ROUND_STARTED', triggeredByPlayerId, {
      roundNumber: state.roundNumber + 1,
      dealerIndex: nextDealerIndex,
    });

    const nextState: GameState = {
      ...state,
      status: 'IN_PROGRESS',
      roundNumber: state.roundNumber + 1,
      dealerIndex: nextDealerIndex,
      currentPlayerIndex: startingPlayerIndex,
      turnDirection: 'clockwise',
      drawPile,
      discardPile,
      topDiscardCard: topCard,
      activeColor: null,
      players: nextPlayers,
      roundWinner: null,
      unoVulnerablePlayerId: null,
      pendingActionState: null,
      inspectionHand: null,
      turnNumber: 1,
      sequenceNumber: ctx.nextSeq(),
      updatedAt: ctx.timestamp,
    };

    assertValidAllWildGameState(nextState);
    return { nextState, events: ctx.events };
  }

  private static handleRoundVictory(
    state: GameState,
    winnerIndex: number,
    players: Player[],
    drawPile: Card[],
    discardPile: Card[],
    topDiscardCard: Card,
    ctx: ActionContext,
    turnDirection: TurnDirection = state.turnDirection
  ): ActionProcessResult {
    const winnerPlayer = players[winnerIndex];

    // Calculate score from opponents' hands:
    // Standard Wild = 20 points, Wild Actions = 50 points
    let roundPoints = 0;
    for (let i = 0; i < players.length; i++) {
      if (i !== winnerIndex) {
        for (const card of players[i].hand) {
          roundPoints += card.scoreValue;
        }
      }
    }

    const newScore = winnerPlayer.score + roundPoints;
    const isMatchComplete = newScore >= state.targetScore;

    const updatedPlayers = players.map((p, idx) =>
      idx === winnerIndex ? { ...p, score: newScore } : p
    );

    const roundWinner: GameWinner = {
      id: winnerPlayer.id,
      username: winnerPlayer.username,
      score: newScore,
      roundScore: roundPoints,
    };

    const matchWinner: GameWinner | null = isMatchComplete ? roundWinner : null;
    const nextStatus = isMatchComplete ? 'COMPLETED' : 'ROUND_OVER';

    ctx.addEvent('ROUND_WON', winnerPlayer.id, {
      winnerId: winnerPlayer.id,
      roundPoints,
      totalScore: newScore,
      matchComplete: isMatchComplete,
    });

    const nextState: GameState = {
      ...state,
      status: nextStatus,
      players: updatedPlayers,
      drawPile,
      discardPile,
      topDiscardCard,
      turnDirection,
      currentPlayerIndex: winnerIndex,
      roundWinner,
      winner: matchWinner,
      pendingActionState: null,
      unoVulnerablePlayerId: null,
      sequenceNumber: ctx.nextSeq(),
      updatedAt: ctx.timestamp,
    };

    assertValidAllWildGameState(nextState);
    return { nextState, events: ctx.events };
  }

  /**
   * Helper to draw `count` cards from draw pile.
   * If draw pile runs out, reshuffles recyclable cards from discard pile (excluding top discard).
   */
  private static drawCards(
    drawPile: readonly Card[],
    discardPile: readonly Card[],
    count: number,
    rng: RandomNumberGenerator
  ): DrawResult {
    let currentDraw = [...drawPile];
    let currentDiscard = [...discardPile];
    const drawn: Card[] = [];

    for (let i = 0; i < count; i++) {
      if (currentDraw.length === 0) {
        if (currentDiscard.length <= 1) {
          // Exhausted all recyclable cards
          break;
        }
        // Take recyclable discard cards (all cards except top card)
        const topCard = currentDiscard[currentDiscard.length - 1];
        const recyclable = currentDiscard.slice(0, currentDiscard.length - 1);
        currentDraw = shuffleDeck(recyclable, rng);
        currentDiscard = [topCard];
      }

      const card = currentDraw.pop();
      if (card) {
        drawn.push(card);
      }
    }

    return {
      drawnCards: drawn,
      nextDrawPile: currentDraw,
      nextDiscardPile: currentDiscard,
    };
  }

  /**
   * Computes the next player index advancing `steps` positions in `turnDirection`.
   */
  private static getNextPlayerIndex(
    currentIndex: number,
    playerCount: number,
    direction: TurnDirection,
    steps: number
  ): number {
    const dir = direction === 'clockwise' ? 1 : -1;
    let next = (currentIndex + dir * steps) % playerCount;
    if (next < 0) {
      next += playerCount;
    }
    return next;
  }
}
