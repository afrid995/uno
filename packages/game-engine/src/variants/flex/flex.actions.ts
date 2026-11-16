import { GameState, GameWinner, InspectionHand, PendingActionState } from '../../game/game.types';
import { GameAction, GameEventRecord, PlayCardAction } from '../../actions/action.types';
import { ActionProcessResult } from '../../actions/action.processor';
import { Card, CardColor } from '../../cards/card.types';
import { Player, PowerCardStatus } from '../../players/player.types';
import { reverseDirection } from '../../turns/turn.direction';
import { TurnManager } from '../../turns/turn.manager';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../../deck/deck.shuffle';
import { FlexMoveValidator } from './flex.validator';
import { UNO_FLEX_RULES } from './flex.constants';
import { assertValidFlexGameState } from './flex.invariants';
import { FlexDeckFactory } from './flex.deck';
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

export class FlexActionProcessor {
  /**
   * Authoritative action processor for UNO Flex (Mattel Product HNB00 / HMY99).
   */
  static process(
    state: GameState,
    action: GameAction,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): ActionProcessResult {
    // 1. Move validation
    const validation = FlexMoveValidator.validate(state, action);
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
        return this.processPlayCard(state, action, ctx, rng);

      case 'DRAW_CARD':
        return this.processDrawCard(state, action.playerId, ctx, rng);

      case 'PASS_TURN':
        return this.processPassTurn(state, action.playerId, ctx);

      case 'CALL_UNO':
        return this.processCallUno(state, action.playerId, ctx);

      case 'CHALLENGE_UNO_FAILURE':
        return this.processChallengeUno(
          state,
          action.challengerPlayerId,
          action.targetPlayerId,
          ctx,
          rng
        );

      case 'CHALLENGE_WILD_DRAW_FOUR':
        return this.processChallengeWildDrawFour(state, action.challengerPlayerId, ctx, rng);

      case 'ACCEPT_WILD_DRAW_FOUR':
        return this.processAcceptWildDrawFour(state, action.playerId, ctx, rng);

      case 'CHOOSE_TARGETED_DRAW_TWO_TARGET':
        return this.processTargetedDrawTwo(
          state,
          action.playerId,
          action.targetPlayerId,
          ctx,
          rng
        );

      case 'CHOOSE_TARGETED_DRAW_FOUR_TARGET':
        return this.processTargetedDrawFour(
          state,
          action.playerId,
          action.targetPlayerId,
          ctx,
          rng
        );

      case 'START_NEXT_ROUND':
        return this.processStartNextRound(state, action.triggeredByPlayerId, ctx, rng);

      default:
        throw new Error(
          `Unsupported action type '${(action as GameAction).type}' for UNO Flex.`
        );
    }
  }

  private static processPlayCard(
    state: GameState,
    action: PlayCardAction,
    ctx: ActionContext,
    rng: RandomNumberGenerator
  ): ActionProcessResult {
    const { cardId, chosenColor, playMode = 'regular', targetPlayerId } = action;
    const playerIndex = state.currentPlayerIndex;
    const player = state.players[playerIndex];

    const card = player.hand.find((c) => c.id === cardId)!;

    // Snapshot offender hand before playing the card (for challenge verification)
    const offenderHandBeforePlay = [...player.hand];

    // Remove played card from hand
    const remainingHand = player.hand.filter((c) => c.id !== cardId);

    // Track UNO declaration status
    let hasDeclaredUno = player.hasDeclaredUno;
    let unoVulnerablePlayerId: string | null = null;

    if (remainingHand.length === 1) {
      if (hasDeclaredUno) {
        // Player declared UNO ahead of time
        hasDeclaredUno = false;
      } else {
        // Vulnerable to challenge until next player acts
        unoVulnerablePlayerId = player.id;
      }
    } else {
      hasDeclaredUno = false;
    }

    const updatedPlayer: Player = {
      ...player,
      hand: remainingHand,
      hasDeclaredUno,
      hasDrawnThisTurn: false,
      drawnCardId: null,
    };

    let nextPlayers = state.players.map((p, idx) => (idx === playerIndex ? updatedPlayer : p));

    // Power Card State Transitions:
    // 1. If played on flex side, player's Power Card flips to red_x
    if (playMode === 'flex') {
      nextPlayers = nextPlayers.map((p, idx) =>
        idx === playerIndex ? { ...p, powerCardStatus: 'red_x' as PowerCardStatus } : p
      );
      ctx.addEvent('flex:power-card-flipped', player.id, {
        playerId: player.id,
        newStatus: 'red_x',
        reason: 'played_flex_side',
      });
    }

    // 2. If played a Classic Number card with the flip icon, player's Power Card flips (green <-> red)
    if (card.hasFlipIcon) {
      const currentStatus = nextPlayers[playerIndex].powerCardStatus ?? 'green_check';
      const newStatus: PowerCardStatus =
        currentStatus === 'green_check' ? 'red_x' : 'green_check';
      nextPlayers = nextPlayers.map((p, idx) =>
        idx === playerIndex ? { ...p, powerCardStatus: newStatus } : p
      );
      ctx.addEvent('flex:power-card-flipped', player.id, {
        playerId: player.id,
        newStatus,
        reason: 'flip_icon',
      });
    }

    // 3. If played Wild All Flip, ALL players flip their Power Card
    if (card.value === 'wild_all_flip') {
      nextPlayers = nextPlayers.map((p) => {
        const cur = p.powerCardStatus ?? 'green_check';
        const flipped: PowerCardStatus = cur === 'green_check' ? 'red_x' : 'green_check';
        return { ...p, powerCardStatus: flipped };
      });
      ctx.addEvent('flex:wild-all-flip', player.id, {
        playedByPlayerId: player.id,
      });
    }

    // 4. All-Red Reset Check:
    // "If every player's Power Card is Red Side up, they all immediately flip back to Green Side."
    const allRed = nextPlayers.every((p) => p.powerCardStatus === 'red_x');
    if (allRed) {
      nextPlayers = nextPlayers.map((p) => ({
        ...p,
        powerCardStatus: 'green_check' as PowerCardStatus,
      }));
      ctx.addEvent('flex:all-red-reset', undefined, {
        message: 'All Power Cards reset to Green Checkmark because all players were on Red X simultaneously.',
      });
    }

    // Active Color determination:
    // - If Wild card: chosenColor is the active color
    // - If Flex card played on flex side: REGULAR color (center oval) continues play!
    // - If played on regular side: regular card color continues play
    let nextActiveColor: CardColor | null = state.activeColor;
    if (card.type === 'wild') {
      nextActiveColor = chosenColor!;
    } else if (playMode === 'flex') {
      // Per Mattel HNB00 rules page 2:
      // "if you choose to play the “flex” side of the card, the “regular” side or “center oval color”
      // of the card is the color that continues game play, not the color of the “flex” side."
      nextActiveColor = card.color;
    } else {
      nextActiveColor = card.color;
    }

    const nextDiscardPile = [...state.discardPile, card];

    ctx.addEvent('game:card-played', player.id, {
      cardId: card.id,
      card,
      playMode,
      chosenColor,
      activeColor: nextActiveColor,
    });

    // Action Card Resolution:
    let currentDrawPile = state.drawPile;
    let currentDiscardPile = nextDiscardPile;
    let nextPendingState: PendingActionState | null = null;
    let turnDirection = state.turnDirection;
    let nextPlayerIndex = state.currentPlayerIndex;
    const playerCount = nextPlayers.length;

    if (playMode === 'flex') {
      // Flex Side Actions
      switch (card.value) {
        case 'flex_draw_two': {
          // "Forces every other player to draw 1 card. The next player does not lose their turn."
          for (let i = 0; i < playerCount; i++) {
            if (i !== playerIndex) {
              const drawRes = this.drawCards(currentDrawPile, currentDiscardPile, 1, rng);
              currentDrawPile = drawRes.nextDrawPile;
              currentDiscardPile = drawRes.nextDiscardPile;
              const target = nextPlayers[i];
              nextPlayers = nextPlayers.map((p, idx) =>
                idx === i
                  ? {
                      ...target,
                      hand: [...target.hand, ...drawRes.drawnCards],
                      hasDeclaredUno: false,
                    }
                  : p
              );
              ctx.addEvent('flex:all-draw-one', player.id, {
                targetPlayerId: target.id,
                cardsDrawn: 1,
              });
            }
          }
          // Next player plays normally (step 1)
          nextPlayerIndex = TurnManager.getNextPlayerIndex(playerIndex, playerCount, turnDirection, 1);
          break;
        }

        case 'flex_skip': {
          // "The 'flex' side is a SKIP ALL which passes over all other players so the turn comes back to you."
          nextPlayerIndex = playerIndex; // Turn returns immediately to the active player!
          ctx.addEvent('flex:skip-all', player.id, {
            playerTakesAnotherTurn: player.id,
          });
          break;
        }

        case 'flex_reverse': {
          // "Acts as a REVERSE then SKIP, so game play goes in the opposite direction and the first player in that direction is skipped."
          turnDirection = reverseDirection(turnDirection);
          if (playerCount === 2) {
            // In 2-player: direction reverses and opponent is skipped -> turn returns to active player
            nextPlayerIndex = playerIndex;
          } else {
            // First player in new direction is skipped -> step 2
            nextPlayerIndex = TurnManager.getNextPlayerIndex(playerIndex, playerCount, turnDirection, 2);
          }
          ctx.addEvent('flex:reverse-skip', player.id, {
            newDirection: turnDirection,
            skippedNextPlayer: true,
          });
          break;
        }

        case 'flex_wild_all_draw': {
          // "Forces every other player to draw 2 cards. The next player does not lose their turn."
          for (let i = 0; i < playerCount; i++) {
            if (i !== playerIndex) {
              const drawRes = this.drawCards(currentDrawPile, currentDiscardPile, 2, rng);
              currentDrawPile = drawRes.nextDrawPile;
              currentDiscardPile = drawRes.nextDiscardPile;
              const target = nextPlayers[i];
              nextPlayers = nextPlayers.map((p, idx) =>
                idx === i
                  ? {
                      ...target,
                      hand: [...target.hand, ...drawRes.drawnCards],
                      hasDeclaredUno: false,
                    }
                  : p
              );
              ctx.addEvent('flex:all-draw-two', player.id, {
                targetPlayerId: target.id,
                cardsDrawn: 2,
              });
            }
          }
          nextPlayerIndex = TurnManager.getNextPlayerIndex(playerIndex, playerCount, turnDirection, 1);
          break;
        }

        case 'flex_wild_target_draw_two': {
          // "Acts as a 'targeted' Draw 2 Card where you choose the player to draw 2 cards. Play then continues with the next player in current order."
          if (targetPlayerId) {
            const targetIdx = nextPlayers.findIndex((p) => p.id === targetPlayerId);
            const drawRes = this.drawCards(currentDrawPile, currentDiscardPile, 2, rng);
            currentDrawPile = drawRes.nextDrawPile;
            currentDiscardPile = drawRes.nextDiscardPile;
            const target = nextPlayers[targetIdx];
            nextPlayers = nextPlayers.map((p, idx) =>
              idx === targetIdx
                ? {
                    ...target,
                    hand: [...target.hand, ...drawRes.drawnCards],
                    hasDeclaredUno: false,
                  }
                : p
            );
            ctx.addEvent('flex:target-draw-two', player.id, {
              targetPlayerId,
              cardsDrawn: 2,
            });
            nextPlayerIndex = TurnManager.getNextPlayerIndex(playerIndex, playerCount, turnDirection, 1);
          } else {
            // Awaiting target selection
            nextPendingState = {
              type: 'AWAITING_TARGETED_DRAW_TWO_SELECTION',
              sourcePlayerId: player.id,
            };
            nextPlayerIndex = playerIndex;
          }
          break;
        }

        case 'flex_wild_draw_four': {
          // "Acts as a 'targeted' Draw 4 where you choose the player to draw 4 cards. Play then continues with the next player in current order."
          if (targetPlayerId) {
            const targetIdx = nextPlayers.findIndex((p) => p.id === targetPlayerId);
            const drawRes = this.drawCards(currentDrawPile, currentDiscardPile, 4, rng);
            currentDrawPile = drawRes.nextDrawPile;
            currentDiscardPile = drawRes.nextDiscardPile;
            const target = nextPlayers[targetIdx];
            nextPlayers = nextPlayers.map((p, idx) =>
              idx === targetIdx
                ? {
                    ...target,
                    hand: [...target.hand, ...drawRes.drawnCards],
                    hasDeclaredUno: false,
                  }
                : p
            );
            ctx.addEvent('flex:target-draw-four', player.id, {
              targetPlayerId,
              cardsDrawn: 4,
            });
            nextPlayerIndex = TurnManager.getNextPlayerIndex(playerIndex, playerCount, turnDirection, 1);
          } else {
            // Awaiting target selection
            nextPendingState = {
              type: 'AWAITING_TARGETED_DRAW_FOUR_SELECTION',
              sourcePlayerId: player.id,
            };
            nextPlayerIndex = playerIndex;
          }
          break;
        }

        default: {
          // Number card played in flex mode
          nextPlayerIndex = TurnManager.getNextPlayerIndex(playerIndex, playerCount, turnDirection, 1);
          break;
        }
      }
    } else {
      // Regular Side Actions
      switch (card.value) {
        case 'draw_two':
        case 'flex_draw_two': {
          // Next player draws 2 cards and loses turn
          const victimIndex = TurnManager.getNextPlayerIndex(playerIndex, playerCount, turnDirection, 1);
          const drawRes = this.drawCards(currentDrawPile, currentDiscardPile, 2, rng);
          currentDrawPile = drawRes.nextDrawPile;
          currentDiscardPile = drawRes.nextDiscardPile;
          const victim = nextPlayers[victimIndex];
          nextPlayers = nextPlayers.map((p, idx) =>
            idx === victimIndex
              ? {
                  ...victim,
                  hand: [...victim.hand, ...drawRes.drawnCards],
                  hasDeclaredUno: false,
                }
              : p
          );
          ctx.addEvent('game:draw-two', player.id, {
            victimPlayerId: victim.id,
            cardsDrawn: 2,
          });
          const turnRes = TurnManager.resolveNextTurn(
            playerIndex,
            playerCount,
            turnDirection,
            'draw_two'
          );
          nextPlayerIndex = turnRes.nextIndex;
          turnDirection = turnRes.newDirection;
          break;
        }

        case 'skip':
        case 'flex_skip': {
          const turnRes = TurnManager.resolveNextTurn(
            playerIndex,
            playerCount,
            turnDirection,
            'skip'
          );
          nextPlayerIndex = turnRes.nextIndex;
          turnDirection = turnRes.newDirection;
          ctx.addEvent('game:skip', player.id, {
            skippedPlayerId: nextPlayers[
              TurnManager.getNextPlayerIndex(playerIndex, playerCount, state.turnDirection, 1)
            ].id,
          });
          break;
        }

        case 'reverse':
        case 'flex_reverse': {
          const turnRes = TurnManager.resolveNextTurn(
            playerIndex,
            playerCount,
            turnDirection,
            'reverse'
          );
          nextPlayerIndex = turnRes.nextIndex;
          turnDirection = turnRes.newDirection;
          ctx.addEvent('game:reverse', player.id, {
            newDirection: turnDirection,
          });
          break;
        }

        case 'flex_wild_draw_four': {
          // Standard Wild Draw Four with Challenge flow!
          const victimIndex = TurnManager.getNextPlayerIndex(playerIndex, playerCount, turnDirection, 1);
          const victim = nextPlayers[victimIndex];

          // Check if play was officially legal (player held NO matching active color card; Wild cards count as matching)
          const wasOfficiallyLegal = !offenderHandBeforePlay
            .filter((c) => c.id !== cardId)
            .some((c) => c.color === state.activeColor || c.type === 'wild');

          nextPendingState = {
            type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
            playedByPlayerId: player.id,
            victimPlayerId: victim.id,
            wasOfficiallyLegal,
            chosenColor: chosenColor!,
            offenderHandSnapshot: offenderHandBeforePlay,
          };
          nextPlayerIndex = victimIndex;
          break;
        }

        default: {
          // Number card, Wild All Flip, regular Flex Wild Target Draw Two, regular Flex Wild All Draw
          nextPlayerIndex = TurnManager.getNextPlayerIndex(playerIndex, playerCount, turnDirection, 1);
          break;
        }
      }
    }

    // Victory Check: If the active player played their last card and no pending action is awaiting resolution
    if (remainingHand.length === 0 && !nextPendingState) {
      return this.handleRoundVictory(
        state,
        nextPlayers,
        playerIndex,
        currentDiscardPile,
        currentDrawPile,
        card,
        nextActiveColor,
        null,
        ctx
      );
    }

    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      drawPile: currentDrawPile,
      discardPile: currentDiscardPile,
      topDiscardCard: card,
      activeColor: nextActiveColor,
      currentPlayerIndex: nextPlayerIndex,
      turnDirection,
      turnNumber: state.turnNumber + 1,
      sequenceNumber: ctx.nextSeq(),
      unoVulnerablePlayerId,
      pendingActionState: nextPendingState,
      updatedAt: ctx.timestamp,
    };

    assertValidFlexGameState(nextState);
    return { nextState, events: ctx.events };
  }

  private static handleRoundVictory(
    state: GameState,
    players: readonly Player[],
    winnerIndex: number,
    discardPile: readonly Card[],
    drawPile: readonly Card[],
    topCard: Card,
    activeColor: CardColor | null,
    unoVulnerablePlayerId: string | null,
    ctx: ActionContext,
    inspectionHand: InspectionHand | null = null
  ): ActionProcessResult {
    const winner = players[winnerIndex];

    // Calculate score from all opponents' remaining hands
    let roundPoints = 0;
    for (let i = 0; i < players.length; i++) {
      if (i !== winnerIndex) {
        for (const card of players[i].hand) {
          roundPoints += card.scoreValue;
        }
      }
    }

    const updatedTotalScore = winner.score + roundPoints;

    const updatedPlayers = players.map((p, idx) =>
      idx === winnerIndex ? { ...p, score: updatedTotalScore } : p
    );

    const isMatchWon = updatedTotalScore >= state.targetScore;

    const roundWinnerRecord: GameWinner = {
      id: winner.id,
      username: winner.username,
      score: updatedTotalScore,
      roundScore: roundPoints,
    };

    const matchWinnerRecord: GameWinner | null = isMatchWon
      ? {
          id: winner.id,
          username: winner.username,
          score: updatedTotalScore,
        }
      : null;

    ctx.addEvent('game:round-over', winner.id, {
      winnerPlayerId: winner.id,
      roundScore: roundPoints,
      totalScore: updatedTotalScore,
      isMatchWon,
    });

    const nextState: GameState = {
      ...state,
      status: isMatchWon ? 'COMPLETED' : 'ROUND_OVER',
      players: updatedPlayers,
      drawPile: [...drawPile],
      discardPile: [...discardPile],
      topDiscardCard: topCard,
      activeColor,
      unoVulnerablePlayerId,
      pendingActionState: null,
      inspectionHand,
      roundWinner: roundWinnerRecord,
      winner: matchWinnerRecord,
      sequenceNumber: ctx.nextSeq(),
      updatedAt: ctx.timestamp,
    };

    assertValidFlexGameState(nextState);
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

    const isPlayable =
      FlexMoveValidator.isRegularMatch(drawnCard, state.activeColor, state.topDiscardCard) ||
      (player.powerCardStatus === 'green_check' &&
        FlexMoveValidator.isFlexMatch(drawnCard, state.activeColor, state.topDiscardCard));

    if (isPlayable) {
      // Case A: Drawn card is playable -> turn stays with player so they can choose to play or pass
      const updatedPlayer: Player = {
        ...player,
        hand: [...player.hand, drawnCard],
        hasDrawnThisTurn: true,
        drawnCardId: drawnCard.id,
        hasDeclaredUno: false,
      };

      const nextPlayers = state.players.map((p, idx) => (idx === playerIndex ? updatedPlayer : p));

      ctx.addEvent('game:card-drawn', player.id, {
        cardCount: 1,
        cardId: drawnCard.id,
        isPlayable: true,
      });

      const nextState: GameState = {
        ...state,
        players: nextPlayers,
        drawPile: drawRes.nextDrawPile,
        discardPile: drawRes.nextDiscardPile,
        unoVulnerablePlayerId: null, // Clears missed UNO vulnerability as next player took action
        sequenceNumber: ctx.nextSeq(),
        updatedAt: ctx.timestamp,
      };

      assertValidFlexGameState(nextState);
      return { nextState, events: ctx.events };
    } else {
      // Case B: Drawn card is not playable -> turn ends immediately and passes to next player
      const updatedPlayer: Player = {
        ...player,
        hand: [...player.hand, drawnCard],
        hasDrawnThisTurn: false,
        drawnCardId: null,
        hasDeclaredUno: false,
      };

      const nextPlayers = state.players.map((p, idx) => (idx === playerIndex ? updatedPlayer : p));
      const nextPlayerIndex = TurnManager.getNextPlayerIndex(
        state.currentPlayerIndex,
        state.players.length,
        state.turnDirection,
        1
      );

      ctx.addEvent('game:card-drawn', player.id, {
        cardCount: 1,
        cardId: drawnCard.id,
        isPlayable: false,
      });

      const nextState: GameState = {
        ...state,
        players: nextPlayers,
        currentPlayerIndex: nextPlayerIndex,
        turnNumber: state.turnNumber + 1,
        drawPile: drawRes.nextDrawPile,
        discardPile: drawRes.nextDiscardPile,
        unoVulnerablePlayerId: null,
        sequenceNumber: ctx.nextSeq(),
        updatedAt: ctx.timestamp,
      };

      assertValidFlexGameState(nextState);
      return { nextState, events: ctx.events };
    }
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
    const nextPlayerIndex = TurnManager.getNextPlayerIndex(
      playerIndex,
      nextPlayers.length,
      state.turnDirection,
      1
    );

    ctx.addEvent('game:turn-passed', player.id, {
      passedPlayerId: player.id,
    });

    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      currentPlayerIndex: nextPlayerIndex,
      turnNumber: state.turnNumber + 1,
      sequenceNumber: ctx.nextSeq(),
      unoVulnerablePlayerId: null,
      updatedAt: ctx.timestamp,
    };

    assertValidFlexGameState(nextState);
    return { nextState, events: ctx.events };
  }

  private static processCallUno(
    state: GameState,
    playerId: string,
    ctx: ActionContext
  ): ActionProcessResult {
    const targetIndex = state.players.findIndex((p) => p.id === playerId);
    const player = state.players[targetIndex];

    const updatedPlayer: Player = {
      ...player,
      hasDeclaredUno: true,
    };

    const nextPlayers = state.players.map((p, idx) => (idx === targetIndex ? updatedPlayer : p));

    ctx.addEvent('game:uno-called', player.id, {
      playerId: player.id,
    });

    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      unoVulnerablePlayerId: null, // Successfully declared
      sequenceNumber: ctx.nextSeq(),
      updatedAt: ctx.timestamp,
    };

    assertValidFlexGameState(nextState);
    return { nextState, events: ctx.events };
  }

  private static processChallengeUno(
    state: GameState,
    challengerId: string,
    targetPlayerId: string,
    ctx: ActionContext,
    rng: RandomNumberGenerator
  ): ActionProcessResult {
    const targetIndex = state.players.findIndex((p) => p.id === targetPlayerId);
    const targetPlayer = state.players[targetIndex];

    // Penalty is 2 cards per official Mattel rules
    const drawRes = this.drawCards(
      state.drawPile,
      state.discardPile,
      UNO_FLEX_RULES.MISSED_UNO_PENALTY_CARDS,
      rng
    );

    const updatedTarget: Player = {
      ...targetPlayer,
      hand: [...targetPlayer.hand, ...drawRes.drawnCards],
      hasDeclaredUno: false,
    };

    const nextPlayers = state.players.map((p, idx) => (idx === targetIndex ? updatedTarget : p));

    ctx.addEvent('game:uno-challenge-penalized', challengerId, {
      challengerPlayerId: challengerId,
      targetPlayerId,
      penaltyCards: UNO_FLEX_RULES.MISSED_UNO_PENALTY_CARDS,
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

    assertValidFlexGameState(nextState);
    return { nextState, events: ctx.events };
  }

  private static processChallengeWildDrawFour(
    state: GameState,
    challengerId: string,
    ctx: ActionContext,
    rng: RandomNumberGenerator
  ): ActionProcessResult {
    const pending = state.pendingActionState;
    if (!pending || pending.type !== 'AWAITING_WILD_DRAW_FOUR_RESOLUTION') {
      throw new Error('No pending Wild Draw Four challenge active.');
    }

    const offenderIndex = state.players.findIndex((p) => p.id === pending.playedByPlayerId);
    const challengerIndex = state.players.findIndex((p) => p.id === pending.victimPlayerId);

    const offender = state.players[offenderIndex];
    const challenger = state.players[challengerIndex];

    let currentDrawPile = state.drawPile;
    let currentDiscardPile = state.discardPile;
    let nextPlayers = [...state.players];
    let nextPlayerIndex = challengerIndex;

    const inspectionHand: InspectionHand = {
      challengerPlayerId: challenger.id,
      offenderPlayerId: offender.id,
      hand: pending.offenderHandSnapshot,
    };

    if (pending.wasOfficiallyLegal) {
      // Offender was innocent (had NO matching active color card)
      // Challenger draws 6 cards (4 + 2 penalty) and loses turn!
      const drawRes = this.drawCards(currentDrawPile, currentDiscardPile, 6, rng);
      currentDrawPile = drawRes.nextDrawPile;
      currentDiscardPile = drawRes.nextDiscardPile;

      const updatedChallenger: Player = {
        ...challenger,
        hand: [...challenger.hand, ...drawRes.drawnCards],
        hasDeclaredUno: false,
        hasDrawnThisTurn: false,
        drawnCardId: null,
      };

      nextPlayers = nextPlayers.map((p, idx) => (idx === challengerIndex ? updatedChallenger : p));

      // Challenger loses turn -> turn advances past challenger
      nextPlayerIndex = TurnManager.getNextPlayerIndex(
        challengerIndex,
        nextPlayers.length,
        state.turnDirection,
        1
      );

      ctx.addEvent('game:wdf-challenge-result', challenger.id, {
        challengerPlayerId: challenger.id,
        offenderPlayerId: offender.id,
        challengeWon: false,
        penaltyCards: 6,
      });

      if (offender.hand.length === 0) {
        return this.handleRoundVictory(
          state,
          nextPlayers,
          offenderIndex,
          currentDiscardPile,
          currentDrawPile,
          state.topDiscardCard,
          state.activeColor,
          null,
          ctx,
          inspectionHand
        );
      }
    } else {
      // Offender was guilty (held matching active color card)
      // Offender draws 4 cards, challenger draws none and takes their turn!
      const drawRes = this.drawCards(currentDrawPile, currentDiscardPile, 4, rng);
      currentDrawPile = drawRes.nextDrawPile;
      currentDiscardPile = drawRes.nextDiscardPile;

      const updatedOffender: Player = {
        ...offender,
        hand: [...offender.hand, ...drawRes.drawnCards],
        hasDeclaredUno: false,
        hasDrawnThisTurn: false,
        drawnCardId: null,
      };

      nextPlayers = nextPlayers.map((p, idx) => (idx === offenderIndex ? updatedOffender : p));

      // Challenger plays their turn next
      nextPlayerIndex = challengerIndex;

      ctx.addEvent('game:wdf-challenge-result', challenger.id, {
        challengerPlayerId: challenger.id,
        offenderPlayerId: offender.id,
        challengeWon: true,
        penaltyCards: 4,
      });
    }

    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      drawPile: currentDrawPile,
      discardPile: currentDiscardPile,
      currentPlayerIndex: nextPlayerIndex,
      pendingActionState: null,
      inspectionHand,
      unoVulnerablePlayerId: null,
      turnNumber: state.turnNumber + 1,
      sequenceNumber: ctx.nextSeq(),
      updatedAt: ctx.timestamp,
    };

    assertValidFlexGameState(nextState);
    return { nextState, events: ctx.events };
  }

  private static processAcceptWildDrawFour(
    state: GameState,
    playerId: string,
    ctx: ActionContext,
    rng: RandomNumberGenerator
  ): ActionProcessResult {
    const pending = state.pendingActionState;
    if (!pending || pending.type !== 'AWAITING_WILD_DRAW_FOUR_RESOLUTION') {
      throw new Error('No pending Wild Draw Four challenge active.');
    }

    const victimIndex = state.players.findIndex((p) => p.id === pending.victimPlayerId);
    const victim = state.players[victimIndex];

    // Victim draws 4 cards and loses turn
    const drawRes = this.drawCards(state.drawPile, state.discardPile, 4, rng);

    const updatedVictim: Player = {
      ...victim,
      hand: [...victim.hand, ...drawRes.drawnCards],
      hasDeclaredUno: false,
      hasDrawnThisTurn: false,
      drawnCardId: null,
    };

    const nextPlayers = state.players.map((p, idx) => (idx === victimIndex ? updatedVictim : p));

    // Turn advances past victim
    const nextPlayerIndex = TurnManager.getNextPlayerIndex(
      victimIndex,
      nextPlayers.length,
      state.turnDirection,
      1
    );

    ctx.addEvent('game:wdf-accepted', victim.id, {
      victimPlayerId: victim.id,
      cardsDrawn: 4,
    });

    const offenderIndex = state.players.findIndex((p) => p.id === pending.playedByPlayerId);
    const offender = state.players[offenderIndex];

    if (offender.hand.length === 0) {
      return this.handleRoundVictory(
        state,
        nextPlayers,
        offenderIndex,
        drawRes.nextDiscardPile,
        drawRes.nextDrawPile,
        state.topDiscardCard,
        state.activeColor,
        null,
        ctx
      );
    }

    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      drawPile: drawRes.nextDrawPile,
      discardPile: drawRes.nextDiscardPile,
      currentPlayerIndex: nextPlayerIndex,
      pendingActionState: null,
      inspectionHand: null,
      unoVulnerablePlayerId: null,
      turnNumber: state.turnNumber + 1,
      sequenceNumber: ctx.nextSeq(),
      updatedAt: ctx.timestamp,
    };

    assertValidFlexGameState(nextState);
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

    const drawRes = this.drawCards(state.drawPile, state.discardPile, 2, rng);

    const updatedTarget: Player = {
      ...targetPlayer,
      hand: [...targetPlayer.hand, ...drawRes.drawnCards],
      hasDeclaredUno: false,
    };

    const nextPlayers = state.players.map((p, idx) => (idx === targetIndex ? updatedTarget : p));

    const sourceIndex = state.players.findIndex((p) => p.id === sourcePlayerId);
    const nextPlayerIndex = TurnManager.getNextPlayerIndex(
      sourceIndex,
      nextPlayers.length,
      state.turnDirection,
      1
    );

    ctx.addEvent('flex:target-draw-two', sourcePlayerId, {
      sourcePlayerId,
      targetPlayerId,
      cardsDrawn: 2,
    });

    const sourcePlayer = state.players[sourceIndex];
    if (sourcePlayer.hand.length === 0) {
      return this.handleRoundVictory(
        state,
        nextPlayers,
        sourceIndex,
        drawRes.nextDiscardPile,
        drawRes.nextDrawPile,
        state.topDiscardCard,
        state.activeColor,
        null,
        ctx
      );
    }

    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      drawPile: drawRes.nextDrawPile,
      discardPile: drawRes.nextDiscardPile,
      currentPlayerIndex: nextPlayerIndex,
      pendingActionState: null,
      turnNumber: state.turnNumber + 1,
      sequenceNumber: ctx.nextSeq(),
      updatedAt: ctx.timestamp,
    };

    assertValidFlexGameState(nextState);
    return { nextState, events: ctx.events };
  }

  private static processTargetedDrawFour(
    state: GameState,
    sourcePlayerId: string,
    targetPlayerId: string,
    ctx: ActionContext,
    rng: RandomNumberGenerator
  ): ActionProcessResult {
    const targetIndex = state.players.findIndex((p) => p.id === targetPlayerId);
    const targetPlayer = state.players[targetIndex];

    const drawRes = this.drawCards(state.drawPile, state.discardPile, 4, rng);

    const updatedTarget: Player = {
      ...targetPlayer,
      hand: [...targetPlayer.hand, ...drawRes.drawnCards],
      hasDeclaredUno: false,
    };

    const nextPlayers = state.players.map((p, idx) => (idx === targetIndex ? updatedTarget : p));

    const sourceIndex = state.players.findIndex((p) => p.id === sourcePlayerId);
    const nextPlayerIndex = TurnManager.getNextPlayerIndex(
      sourceIndex,
      nextPlayers.length,
      state.turnDirection,
      1
    );

    ctx.addEvent('flex:target-draw-four', sourcePlayerId, {
      sourcePlayerId,
      targetPlayerId,
      cardsDrawn: 4,
    });

    const sourcePlayer = state.players[sourceIndex];
    if (sourcePlayer.hand.length === 0) {
      return this.handleRoundVictory(
        state,
        nextPlayers,
        sourceIndex,
        drawRes.nextDiscardPile,
        drawRes.nextDrawPile,
        state.topDiscardCard,
        state.activeColor,
        null,
        ctx
      );
    }

    const nextState: GameState = {
      ...state,
      players: nextPlayers,
      drawPile: drawRes.nextDrawPile,
      discardPile: drawRes.nextDiscardPile,
      currentPlayerIndex: nextPlayerIndex,
      pendingActionState: null,
      turnNumber: state.turnNumber + 1,
      sequenceNumber: ctx.nextSeq(),
      updatedAt: ctx.timestamp,
    };

    assertValidFlexGameState(nextState);
    return { nextState, events: ctx.events };
  }

  private static processStartNextRound(
    state: GameState,
    playerId: string,
    ctx: ActionContext,
    rng: RandomNumberGenerator
  ): ActionProcessResult {
    const playerCount = state.players.length;
    // Next dealer rotates clockwise
    const nextDealerIndex = (state.dealerIndex + 1) % playerCount;

    // Reset 104-card deck
    const deck = shuffleDeck(FlexDeckFactory.createDeck(), rng);

    const playerIds = state.players.map((p) => p.id);
    const { hands, remainingDeck } = HandManager.dealInitialHands(
      deck,
      playerIds,
      UNO_FLEX_RULES.INITIAL_HAND_SIZE
    );

    const drawPile = [...remainingDeck];

    // Flip top card for discard pile. If Action Card, ignore action per Mattel rules setup.
    // All Action Cards (Classic & Flex) and Wild Cards are ignored; keep flipping until a Number Card is reached.
    const discardPile: Card[] = [];
    let topCard = drawPile.pop()!;
    while (topCard.type !== 'number') {
      discardPile.push(topCard);
      topCard = drawPile.pop()!;
    }
    discardPile.push(topCard);

    const startingPlayerIndex = (nextDealerIndex + 1) % playerCount;
    const initialPlayers: Player[] = state.players.map((p) => ({
      id: p.id,
      username: p.username,
      hand: hands.get(p.id)!,
      hasDeclaredUno: false,
      hasDrawnThisTurn: false,
      drawnCardId: null,
      score: p.score,
      powerCardStatus: 'green_check' as PowerCardStatus, // Power Cards reset to green at round start
    }));

    ctx.addEvent('game:round-started', playerId, {
      roundNumber: state.roundNumber + 1,
      dealerIndex: nextDealerIndex,
      startingPlayerIndex,
      topCard,
    });

    const nextState: GameState = {
      ...state,
      status: 'IN_PROGRESS',
      roundNumber: state.roundNumber + 1,
      dealerIndex: nextDealerIndex,
      players: initialPlayers,
      currentPlayerIndex: startingPlayerIndex,
      turnDirection: 'clockwise',
      drawPile,
      discardPile,
      topDiscardCard: topCard,
      activeColor: topCard.color,
      turnNumber: 1,
      sequenceNumber: ctx.nextSeq(),
      unoVulnerablePlayerId: null,
      pendingActionState: null,
      inspectionHand: null,
      roundWinner: null,
      updatedAt: ctx.timestamp,
    };

    assertValidFlexGameState(nextState);
    return { nextState, events: ctx.events };
  }

  /**
   * Helper: draws count cards safely, reshuffling discard pile if necessary.
   * Ensures exact 104 card conservation.
   */
  private static drawCards(
    drawPile: readonly Card[],
    discardPile: readonly Card[],
    count: number,
    rng: RandomNumberGenerator
  ): DrawResult {
    let currentDraw = [...drawPile];
    let currentDiscard = [...discardPile];
    const drawnCards: Card[] = [];

    for (let i = 0; i < count; i++) {
      if (currentDraw.length === 0) {
        if (currentDiscard.length <= 1) {
          // No more cards available to draw
          break;
        }
        // Retain top discard card
        const topDiscard = currentDiscard[currentDiscard.length - 1];
        const recyclable = currentDiscard.slice(0, currentDiscard.length - 1);
        currentDraw = shuffleDeck(recyclable, rng);
        currentDiscard = [topDiscard];
      }
      const card = currentDraw.pop();
      if (card) {
        drawnCards.push(card);
      }
    }

    return {
      drawnCards,
      nextDrawPile: currentDraw,
      nextDiscardPile: currentDiscard,
    };
  }
}
