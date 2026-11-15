import {
  GameState,
  GameWinner,
  PendingActionState,
  AttackLauncherState,
} from '../../game/game.types';
import {
  GameAction,
  GameEventRecord,
  PlayCardAction,
  CallUnoAction,
  ChallengeUnoFailureAction,
  ChooseAttackTargetAction,
  ChooseStartingWildColorAction,
} from '../../actions/action.types';
import { ActionProcessResult } from '../../actions/action.processor';
import { Card, CardColor } from '../../cards/card.types';
import { isWildCard } from '../../cards/card.validation';
import { DeckManager } from '../../deck/deck.manager';
import { Player } from '../../players/player.types';
import { TurnDirection } from '../../turns/turn.direction';
import { TurnManager } from '../../turns/turn.manager';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../../deck/deck.shuffle';
import { HandManager } from '../../players/hand.manager';
import { AttackDeckFactory } from './attack.deck';
import { AttackMoveValidator } from './attack.validator';
import { AttackLauncher } from './attack.launcher';
import { ATTACK_LAUNCHER_CONFIG, UNO_ATTACK_RULES } from './attack.constants';
import { assertValidAttackGameState } from './attack.invariants';

export class AttackActionProcessor {
  static process(
    state: GameState,
    action: GameAction,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): ActionProcessResult {
    // 1. Validate legality
    const validation = AttackMoveValidator.validate(state, action);
    if (!validation.valid) {
      throw new Error(`[${validation.code}] ${validation.message}`);
    }

    // 2. Dispatch
    switch (action.type) {
      case 'PLAY_CARD':
        return this.processPlayCard(state, action, rng);
      case 'DRAW_CARD':
        return this.processDrawCard(state, action.playerId, rng);
      case 'CALL_UNO':
        return this.processCallUno(state, action);
      case 'CHALLENGE_UNO_FAILURE':
        return this.processChallengeUnoFailure(state, action, rng);
      case 'CHOOSE_STARTING_WILD_COLOR':
        return this.processChooseStartingWildColor(state, action);
      case 'CHOOSE_ATTACK_TARGET':
        return this.processChooseAttackTarget(state, action, rng);
      case 'START_NEXT_ROUND':
        return this.processStartNextRound(state, action.triggeredByPlayerId, rng);
      default:
        throw new Error(`Unhandled action type: ${(action as GameAction).type}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------

  private static processPlayCard(
    state: GameState,
    action: PlayCardAction,
    rng: RandomNumberGenerator
  ): ActionProcessResult {
    const { playerId, cardId, chosenColor, targetPlayerId } = action;
    const playerIndex = state.currentPlayerIndex;
    const player = state.players[playerIndex];
    const card = player.hand.find((c) => c.id === cardId)!;

    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile];
    let turnDirection = state.turnDirection;
    let unoVulnerablePlayerId = state.unoVulnerablePlayerId;
    let launcherState: AttackLauncherState = state.attackLauncherState ?? { tension: 0 };
    let pendingActionState: PendingActionState | null = null;

    const events: GameEventRecord[] = [];
    let sequenceNumber = state.sequenceNumber;

    const addEvent = (type: string, actorId?: string, payload: Record<string, unknown> = {}) => {
      sequenceNumber++;
      events.push({
        sequenceNumber,
        type,
        playerId: actorId,
        payload,
        timestamp: new Date().toISOString(),
      });
    };

    // Calculate remaining hand for active player
    let remainingHand: Card[];
    let additionalDiscardedCards: Card[] = [];

    if (card.value === 'discard_all') {
      // Discard all other cards in hand of matching color
      additionalDiscardedCards = player.hand.filter((c) => c.id !== card.id && c.color === card.color);
      remainingHand = player.hand.filter((c) => c.id !== card.id && c.color !== card.color);
      discardPile = [...discardPile, ...additionalDiscardedCards, card];
      addEvent('CARDS_DISCARDED', playerId, {
        discardAllCardId: card.id,
        additionalCardIds: additionalDiscardedCards.map((c) => c.id),
        color: card.color,
        count: 1 + additionalDiscardedCards.length,
      });
    } else {
      remainingHand = player.hand.filter((c) => c.id !== card.id);
      discardPile = [...discardPile, card];
    }

    addEvent('CARD_PLAYED', playerId, {
      cardId: card.id,
      card,
      chosenColor,
    });

    // Determine active color
    let nextActiveColor: CardColor | null = state.activeColor;
    if (isWildCard(card) || card.type === 'wild') {
      nextActiveColor = chosenColor ?? 'red';
      addEvent('COLOR_CHOSEN', playerId, { color: nextActiveColor });
    } else if (card.color) {
      nextActiveColor = card.color;
    }

    // UNO vulnerability check:
    // If player now has exactly 1 card left and did NOT declare UNO: vulnerable!
    if (remainingHand.length === 1 && !player.hasDeclaredUno) {
      unoVulnerablePlayerId = playerId;
      addEvent('PLAYER_VULNERABLE_UNO', playerId, {});
    } else {
      if (unoVulnerablePlayerId === playerId) {
        unoVulnerablePlayerId = null;
      }
    }

    let updatedPlayers: Player[] = state.players.map((p) => {
      if (p.id === playerId) {
        return {
          ...p,
          hand: remainingHand,
          hasDeclaredUno: remainingHand.length === 1 ? p.hasDeclaredUno : false,
          hasDrawnThisTurn: false,
          drawnCardId: null,
        };
      }
      return p;
    });

    // Helper for turn advancement
    const advanceTurn = (steps: number = 1): number => {
      return TurnManager.getNextPlayerIndex(state.currentPlayerIndex, updatedPlayers.length, turnDirection, steps);
    };

    let nextPlayerIndex = advanceTurn(1);
    const playerCount = updatedPlayers.length;

    const isGoingOut = remainingHand.length === 0;
    const availableCardCount = drawPile.length + Math.max(0, discardPile.length - 1);

    // Action resolution
    if (card.value === 'reverse') {
      if (!isGoingOut) {
        if (playerCount === 2) {
          // 2-player game: Reverse acts like Skip! Attacker takes another turn
          nextPlayerIndex = state.currentPlayerIndex;
          addEvent('REVERSE_ACTS_AS_SKIP', playerId, { nextPlayerId: playerId });
        } else {
          turnDirection = turnDirection === 'clockwise' ? 'counter_clockwise' : 'clockwise';
          nextPlayerIndex = TurnManager.getNextPlayerIndex(state.currentPlayerIndex, playerCount, turnDirection, 1);
          addEvent('DIRECTION_REVERSED', playerId, { direction: turnDirection });
        }
      }
    } else if (card.value === 'skip') {
      if (!isGoingOut) {
        if (playerCount === 2) {
          // 2-player game: Skip gives the player another turn immediately!
          nextPlayerIndex = state.currentPlayerIndex;
          addEvent('PLAYER_SKIPPED', updatedPlayers[advanceTurn(1)].id, { skippedBy: playerId });
        } else {
          const skippedIndex = advanceTurn(1);
          addEvent('PLAYER_SKIPPED', updatedPlayers[skippedIndex].id, { skippedBy: playerId });
          nextPlayerIndex = advanceTurn(2);
        }
      }
    } else if (card.value === 'hit_2') {
      // Per official Mattel GTX66 rules, once a player is out of cards, the hand is over.
      // The Wild Attack-Attack exception does NOT apply to Hit 2.
      if (!isGoingOut) {
        const victimIndex = advanceTurn(1);
        const victim = updatedPlayers[victimIndex];

        // Victim must press the launcher twice
        const evalResult = AttackLauncher.evaluatePresses(
          ATTACK_LAUNCHER_CONFIG.PRESSES.HIT_2,
          launcherState.tension,
          availableCardCount,
          rng
        );

        let drawnCards: Card[] = [];
        if (evalResult.totalCardsToDispense > 0) {
          const drawRes = DeckManager.drawCards(drawPile, discardPile, evalResult.totalCardsToDispense, rng);
          drawPile = [...drawRes.newDrawPile];
          discardPile = [...drawRes.newDiscardPile];
          drawnCards = [...drawRes.drawnCards];
        }

        launcherState = {
          tension: evalResult.finalTension,
          lastLaunchResult: {
            playerId: victim.id,
            cardsLaunched: drawnCards.length,
            totalPresses: ATTACK_LAUNCHER_CONFIG.PRESSES.HIT_2,
            timestamp: Date.now(),
          },
        };

        updatedPlayers = updatedPlayers.map((p) => {
          if (p.id === victim.id) {
            return {
              ...p,
              hand: [...p.hand, ...drawnCards],
              hasDeclaredUno: false,
            };
          }
          return p;
        });

        addEvent('ATTACK_LAUNCHER_RESULT', victim.id, {
          cardsLaunched: drawnCards.length,
          presses: ATTACK_LAUNCHER_CONFIG.PRESSES.HIT_2,
          tension: evalResult.finalTension,
          drawnCards: drawnCards.map((c) => c.id),
        });

        addEvent('PLAYER_SKIPPED', victim.id, { skippedBy: playerId });

        // Turn advancement after Hit 2:
        // In 2-player game: play returns to attacker
        // In 3+ player game: play advances to player after victim
        if (playerCount === 2) {
          nextPlayerIndex = state.currentPlayerIndex;
        } else {
          nextPlayerIndex = advanceTurn(2);
        }
      }
    } else if (card.value === 'wild_hit_4') {
      // Per official Mattel GTX66 rules, once a player is out of cards, the hand is over.
      // The Wild Attack-Attack exception does NOT apply to Wild Hit 4.
      if (!isGoingOut) {
        const victimIndex = advanceTurn(1);
        const victim = updatedPlayers[victimIndex];

        // Victim must press launcher 4 times
        const evalResult = AttackLauncher.evaluatePresses(
          ATTACK_LAUNCHER_CONFIG.PRESSES.WILD_HIT_4,
          launcherState.tension,
          availableCardCount,
          rng
        );

        let drawnCards: Card[] = [];
        if (evalResult.totalCardsToDispense > 0) {
          const drawRes = DeckManager.drawCards(drawPile, discardPile, evalResult.totalCardsToDispense, rng);
          drawPile = [...drawRes.newDrawPile];
          discardPile = [...drawRes.newDiscardPile];
          drawnCards = [...drawRes.drawnCards];
        }

        launcherState = {
          tension: evalResult.finalTension,
          lastLaunchResult: {
            playerId: victim.id,
            cardsLaunched: drawnCards.length,
            totalPresses: ATTACK_LAUNCHER_CONFIG.PRESSES.WILD_HIT_4,
            timestamp: Date.now(),
          },
        };

        updatedPlayers = updatedPlayers.map((p) => {
          if (p.id === victim.id) {
            return {
              ...p,
              hand: [...p.hand, ...drawnCards],
              hasDeclaredUno: false,
            };
          }
          return p;
        });

        addEvent('ATTACK_LAUNCHER_RESULT', victim.id, {
          cardsLaunched: drawnCards.length,
          presses: ATTACK_LAUNCHER_CONFIG.PRESSES.WILD_HIT_4,
          tension: evalResult.finalTension,
          drawnCards: drawnCards.map((c) => c.id),
        });

        addEvent('PLAYER_SKIPPED', victim.id, { skippedBy: playerId });

        if (playerCount === 2) {
          nextPlayerIndex = state.currentPlayerIndex;
        } else {
          nextPlayerIndex = advanceTurn(2);
        }
      }
    } else if (card.value === 'wild_attack_attack') {
      // Explicit Mattel GTX66 Rule (Page 3):
      // "If a player goes out using a Wild Attack-Attack card, they may use this command card as normal before the game ends."
      if (targetPlayerId) {
        // Target player provided directly: execute Attack-Attack immediately!
        const victim = updatedPlayers.find((p) => p.id === targetPlayerId)!;
        const evalResult = AttackLauncher.evaluatePresses(
          ATTACK_LAUNCHER_CONFIG.PRESSES.WILD_ATTACK_ATTACK,
          launcherState.tension,
          availableCardCount,
          rng
        );

        let drawnCards: Card[] = [];
        if (evalResult.totalCardsToDispense > 0) {
          const drawRes = DeckManager.drawCards(drawPile, discardPile, evalResult.totalCardsToDispense, rng);
          drawPile = [...drawRes.newDrawPile];
          discardPile = [...drawRes.newDiscardPile];
          drawnCards = [...drawRes.drawnCards];
        }

        launcherState = {
          tension: evalResult.finalTension,
          lastLaunchResult: {
            playerId: victim.id,
            cardsLaunched: drawnCards.length,
            totalPresses: ATTACK_LAUNCHER_CONFIG.PRESSES.WILD_ATTACK_ATTACK,
            timestamp: Date.now(),
          },
        };

        updatedPlayers = updatedPlayers.map((p) => {
          if (p.id === victim.id) {
            return {
              ...p,
              hand: [...p.hand, ...drawnCards],
              hasDeclaredUno: false,
            };
          }
          return p;
        });

        addEvent('ATTACK_LAUNCHER_RESULT', victim.id, {
          cardsLaunched: drawnCards.length,
          presses: ATTACK_LAUNCHER_CONFIG.PRESSES.WILD_ATTACK_ATTACK,
          tension: evalResult.finalTension,
          drawnCards: drawnCards.map((c) => c.id),
          attackedBy: playerId,
        });

        // Official Rule: "The game then continues with the next player in turn order after the player who got attacked."
        const victimIndex = updatedPlayers.findIndex((p) => p.id === victim.id);
        nextPlayerIndex = TurnManager.getNextPlayerIndex(victimIndex, playerCount, turnDirection, 1);
      } else {
        // Awaiting target selection
        pendingActionState = {
          type: 'AWAITING_ATTACK_TARGET_SELECTION',
          playedByPlayerId: playerId,
          chosenColor: nextActiveColor ?? 'red',
        };
      }
    }

    // Check round victory:
    // If the active player has 0 cards and no pending action is awaiting resolution:
    // Note: Official rule explicitly allows final-card action resolution (served above)!
    if (remainingHand.length === 0 && !pendingActionState) {
      return this.handleRoundVictory(
        state,
        updatedPlayers,
        playerIndex,
        discardPile,
        drawPile,
        card,
        nextActiveColor,
        launcherState,
        events,
        sequenceNumber
      );
    }

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      currentPlayerIndex: nextPlayerIndex,
      turnDirection,
      drawPile,
      discardPile,
      topDiscardCard: card,
      activeColor: nextActiveColor,
      turnNumber: state.turnNumber + 1,
      sequenceNumber,
      unoVulnerablePlayerId,
      pendingActionState,
      attackLauncherState: launcherState,
      updatedAt: new Date().toISOString(),
    };

    assertValidAttackGameState(nextState);
    return { nextState, events };
  }

  private static processDrawCard(
    state: GameState,
    playerId: string,
    rng: RandomNumberGenerator
  ): ActionProcessResult {
    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile];
    let launcherState: AttackLauncherState = state.attackLauncherState ?? { tension: 0 };

    const events: GameEventRecord[] = [];
    let sequenceNumber = state.sequenceNumber;

    const addEvent = (type: string, actorId?: string, payload: Record<string, unknown> = {}) => {
      sequenceNumber++;
      events.push({
        sequenceNumber,
        type,
        playerId: actorId,
        payload,
        timestamp: new Date().toISOString(),
      });
    };

    // Press launcher once
    const availableCardCount = drawPile.length + Math.max(0, discardPile.length - 1);
    const evalResult = AttackLauncher.evaluatePresses(
      ATTACK_LAUNCHER_CONFIG.PRESSES.VOLUNTARY_OR_UNPLAYABLE_TURN,
      launcherState.tension,
      availableCardCount,
      rng
    );

    let drawnCards: Card[] = [];
    if (evalResult.totalCardsToDispense > 0) {
      const drawRes = DeckManager.drawCards(drawPile, discardPile, evalResult.totalCardsToDispense, rng);
      drawPile = [...drawRes.newDrawPile];
      discardPile = [...drawRes.newDiscardPile];
      drawnCards = [...drawRes.drawnCards];
    }

    launcherState = {
      tension: evalResult.finalTension,
      lastLaunchResult: {
        playerId,
        cardsLaunched: drawnCards.length,
        totalPresses: ATTACK_LAUNCHER_CONFIG.PRESSES.VOLUNTARY_OR_UNPLAYABLE_TURN,
        timestamp: Date.now(),
      },
    };

    const updatedPlayers: Player[] = state.players.map((p) => {
      if (p.id === playerId) {
        return {
          ...p,
          hand: [...p.hand, ...drawnCards],
          hasDeclaredUno: false,
          hasDrawnThisTurn: false,
          drawnCardId: null,
        };
      }
      return p;
    });

    addEvent('ATTACK_LAUNCHER_RESULT', playerId, {
      cardsLaunched: drawnCards.length,
      presses: ATTACK_LAUNCHER_CONFIG.PRESSES.VOLUNTARY_OR_UNPLAYABLE_TURN,
      tension: evalResult.finalTension,
      drawnCards: drawnCards.map((c) => c.id),
    });

    // Official UNO Attack rule:
    // "ONCE YOU PRESS THE LAUNCH BUTTON YOUR TURN IS OVER."
    // Turn advances to next player immediately!
    const nextPlayerIndex = TurnManager.getNextPlayerIndex(
      state.currentPlayerIndex,
      updatedPlayers.length,
      state.turnDirection,
      1
    );

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      currentPlayerIndex: nextPlayerIndex,
      drawPile,
      discardPile,
      turnNumber: state.turnNumber + 1,
      sequenceNumber,
      attackLauncherState: launcherState,
      unoVulnerablePlayerId: state.unoVulnerablePlayerId === playerId ? null : state.unoVulnerablePlayerId,
      updatedAt: new Date().toISOString(),
    };

    assertValidAttackGameState(nextState);
    return { nextState, events };
  }

  private static processCallUno(state: GameState, action: CallUnoAction): ActionProcessResult {
    const { playerId } = action;
    const events: GameEventRecord[] = [];
    let sequenceNumber = state.sequenceNumber;

    sequenceNumber++;
    events.push({
      sequenceNumber,
      type: 'UNO_CALLED',
      playerId,
      payload: {},
      timestamp: new Date().toISOString(),
    });

    const updatedPlayers = state.players.map((p) => (p.id === playerId ? { ...p, hasDeclaredUno: true } : p));

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      sequenceNumber,
      unoVulnerablePlayerId: state.unoVulnerablePlayerId === playerId ? null : state.unoVulnerablePlayerId,
      updatedAt: new Date().toISOString(),
    };

    assertValidAttackGameState(nextState);
    return { nextState, events };
  }

  private static processChallengeUnoFailure(
    state: GameState,
    action: ChallengeUnoFailureAction,
    rng: RandomNumberGenerator
  ): ActionProcessResult {
    const { challengerPlayerId, targetPlayerId } = action;
    const events: GameEventRecord[] = [];
    let sequenceNumber = state.sequenceNumber;

    const addEvent = (type: string, actorId?: string, payload: Record<string, unknown> = {}) => {
      sequenceNumber++;
      events.push({
        sequenceNumber,
        type,
        playerId: actorId,
        payload,
        timestamp: new Date().toISOString(),
      });
    };

    addEvent('UNO_CHALLENGE_SUCCESS', challengerPlayerId, { targetPlayerId });

    // Official UNO Attack rule:
    // "If you don't shout UNO, you must hit the button TWICE."
    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile];
    let launcherState: AttackLauncherState = state.attackLauncherState ?? { tension: 0 };

    const availableCardCount = drawPile.length + Math.max(0, discardPile.length - 1);
    const evalResult = AttackLauncher.evaluatePresses(
      ATTACK_LAUNCHER_CONFIG.PRESSES.MISSED_UNO_PENALTY,
      launcherState.tension,
      availableCardCount,
      rng
    );

    let drawnCards: Card[] = [];
    if (evalResult.totalCardsToDispense > 0) {
      const drawRes = DeckManager.drawCards(drawPile, discardPile, evalResult.totalCardsToDispense, rng);
      drawPile = [...drawRes.newDrawPile];
      discardPile = [...drawRes.newDiscardPile];
      drawnCards = [...drawRes.drawnCards];
    }

    launcherState = {
      tension: evalResult.finalTension,
      lastLaunchResult: {
        playerId: targetPlayerId,
        cardsLaunched: drawnCards.length,
        totalPresses: ATTACK_LAUNCHER_CONFIG.PRESSES.MISSED_UNO_PENALTY,
        timestamp: Date.now(),
      },
    };

    const updatedPlayers = state.players.map((p) => {
      if (p.id === targetPlayerId) {
        return {
          ...p,
          hand: [...p.hand, ...drawnCards],
          hasDeclaredUno: false,
        };
      }
      return p;
    });

    addEvent('ATTACK_LAUNCHER_RESULT', targetPlayerId, {
      cardsLaunched: drawnCards.length,
      presses: ATTACK_LAUNCHER_CONFIG.PRESSES.MISSED_UNO_PENALTY,
      tension: evalResult.finalTension,
      drawnCards: drawnCards.map((c) => c.id),
      reason: 'MISSED_UNO_CHALLENGE_PENALTY',
    });

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      drawPile,
      discardPile,
      sequenceNumber,
      unoVulnerablePlayerId: null,
      attackLauncherState: launcherState,
      updatedAt: new Date().toISOString(),
    };

    assertValidAttackGameState(nextState);
    return { nextState, events };
  }

  private static processChooseStartingWildColor(
    state: GameState,
    action: ChooseStartingWildColorAction
  ): ActionProcessResult {
    const { playerId, chosenColor } = action;
    const events: GameEventRecord[] = [];
    let sequenceNumber = state.sequenceNumber;

    sequenceNumber++;
    events.push({
      sequenceNumber,
      type: 'STARTING_WILD_COLOR_CHOSEN',
      playerId,
      payload: { color: chosenColor },
      timestamp: new Date().toISOString(),
    });

    const nextState: GameState = {
      ...state,
      activeColor: chosenColor,
      pendingActionState: null,
      sequenceNumber,
      updatedAt: new Date().toISOString(),
    };

    assertValidAttackGameState(nextState);
    return { nextState, events };
  }

  private static processChooseAttackTarget(
    state: GameState,
    action: ChooseAttackTargetAction,
    rng: RandomNumberGenerator
  ): ActionProcessResult {
    const { playerId, targetPlayerId, chosenColor } = action;
    const events: GameEventRecord[] = [];
    let sequenceNumber = state.sequenceNumber;

    const addEvent = (type: string, actorId?: string, payload: Record<string, unknown> = {}) => {
      sequenceNumber++;
      events.push({
        sequenceNumber,
        type,
        playerId: actorId,
        payload,
        timestamp: new Date().toISOString(),
      });
    };

    let drawPile = [...state.drawPile];
    let discardPile = [...state.discardPile];
    let launcherState: AttackLauncherState = state.attackLauncherState ?? { tension: 0 };
    const victim = state.players.find((p) => p.id === targetPlayerId)!;

    const availableCardCount = drawPile.length + Math.max(0, discardPile.length - 1);
    const evalResult = AttackLauncher.evaluatePresses(
      ATTACK_LAUNCHER_CONFIG.PRESSES.WILD_ATTACK_ATTACK,
      launcherState.tension,
      availableCardCount,
      rng
    );

    let drawnCards: Card[] = [];
    if (evalResult.totalCardsToDispense > 0) {
      const drawRes = DeckManager.drawCards(drawPile, discardPile, evalResult.totalCardsToDispense, rng);
      drawPile = [...drawRes.newDrawPile];
      discardPile = [...drawRes.newDiscardPile];
      drawnCards = [...drawRes.drawnCards];
    }

    launcherState = {
      tension: evalResult.finalTension,
      lastLaunchResult: {
        playerId: targetPlayerId,
        cardsLaunched: drawnCards.length,
        totalPresses: ATTACK_LAUNCHER_CONFIG.PRESSES.WILD_ATTACK_ATTACK,
        timestamp: Date.now(),
      },
    };

    const updatedPlayers = state.players.map((p) => {
      if (p.id === targetPlayerId) {
        return {
          ...p,
          hand: [...p.hand, ...drawnCards],
          hasDeclaredUno: false,
        };
      }
      return p;
    });

    addEvent('ATTACK_LAUNCHER_RESULT', targetPlayerId, {
      cardsLaunched: drawnCards.length,
      presses: ATTACK_LAUNCHER_CONFIG.PRESSES.WILD_ATTACK_ATTACK,
      tension: evalResult.finalTension,
      drawnCards: drawnCards.map((c) => c.id),
      attackedBy: playerId,
    });

    // Check if player had 0 cards (going out on Wild Attack-Attack):
    const sourcePlayer = updatedPlayers.find((p) => p.id === playerId)!;
    if (sourcePlayer.hand.length === 0) {
      const sourceIndex = updatedPlayers.findIndex((p) => p.id === playerId);
      return this.handleRoundVictory(
        state,
        updatedPlayers,
        sourceIndex,
        discardPile,
        drawPile,
        state.topDiscardCard,
        state.activeColor,
        launcherState,
        events,
        sequenceNumber
      );
    }

    // Play continues with next player in turn order after the attacked player!
    const victimIndex = updatedPlayers.findIndex((p) => p.id === victim.id);
    const nextPlayerIndex = TurnManager.getNextPlayerIndex(
      victimIndex,
      updatedPlayers.length,
      state.turnDirection,
      1
    );

    const nextState: GameState = {
      ...state,
      players: updatedPlayers,
      currentPlayerIndex: nextPlayerIndex,
      drawPile,
      discardPile,
      activeColor: chosenColor ?? state.activeColor,
      pendingActionState: null,
      sequenceNumber,
      attackLauncherState: launcherState,
      updatedAt: new Date().toISOString(),
    };

    assertValidAttackGameState(nextState);
    return { nextState, events };
  }

  private static processStartNextRound(
    state: GameState,
    _triggeredByPlayerId: string,
    rng: RandomNumberGenerator
  ): ActionProcessResult {
    const customizableCount =
      state.attackCustomizableCount ?? UNO_ATTACK_RULES.DEFAULT_CUSTOMIZABLE_CARDS_COUNT;
    const deck = shuffleDeck(AttackDeckFactory.createDeck(customizableCount), rng);
    const playerCount = state.players.length;
    const cardsPerHand = 7;

    const playerIds = state.players.map((p) => p.id);
    const { hands, remainingDeck } = HandManager.dealInitialHands(deck, playerIds, cardsPerHand);

    let drawPile = [...remainingDeck];
    let discardPile: Card[] = [];

    // Flip top card from draw pile to start discard pile
    const topCard = drawPile.pop()!;
    discardPile.push(topCard);

    const dealerIndex = (state.dealerIndex + 1) % playerCount;
    let turnDirection: TurnDirection = 'clockwise';
    let currentPlayerIndex = (dealerIndex + 1) % playerCount;
    let activeColor: CardColor | null = topCard.color;
    let pendingActionState: PendingActionState | null = null;
    let launcherTension = 0;

    let updatedPlayers: Player[] = state.players.map((p) => ({
      ...p,
      hand: hands.get(p.id)!,
      hasDeclaredUno: false,
      hasDrawnThisTurn: false,
      drawnCardId: null,
    }));

    // Handle opening card if action/wild
    if (topCard.value === 'reverse') {
      if (playerCount === 2) {
        currentPlayerIndex = dealerIndex;
      } else {
        turnDirection = 'counter_clockwise';
        currentPlayerIndex = dealerIndex;
      }
    } else if (topCard.value === 'skip') {
      if (playerCount === 2) {
        currentPlayerIndex = dealerIndex;
      } else {
        currentPlayerIndex = (dealerIndex + 2) % playerCount;
      }
    } else if (topCard.value === 'hit_2') {
      const victim = updatedPlayers[currentPlayerIndex];
      const evalResult = AttackLauncher.evaluatePresses(
        ATTACK_LAUNCHER_CONFIG.PRESSES.HIT_2,
        0,
        drawPile.length + Math.max(0, discardPile.length - 1),
        rng
      );
      if (evalResult.totalCardsToDispense > 0) {
        const drawRes = DeckManager.drawCards(drawPile, discardPile, evalResult.totalCardsToDispense, rng);
        drawPile = [...drawRes.newDrawPile];
        discardPile = [...drawRes.newDiscardPile];
        updatedPlayers = updatedPlayers.map((p) =>
          p.id === victim.id ? { ...p, hand: [...p.hand, ...drawRes.drawnCards] } : p
        );
      }
      launcherTension = evalResult.finalTension;
      currentPlayerIndex = playerCount === 2 ? dealerIndex : (dealerIndex + 2) % playerCount;
    } else if (topCard.value === 'wild_hit_4') {
      const victim = updatedPlayers[currentPlayerIndex];
      const evalResult = AttackLauncher.evaluatePresses(
        ATTACK_LAUNCHER_CONFIG.PRESSES.WILD_HIT_4,
        0,
        drawPile.length + Math.max(0, discardPile.length - 1),
        rng
      );
      if (evalResult.totalCardsToDispense > 0) {
        const drawRes = DeckManager.drawCards(drawPile, discardPile, evalResult.totalCardsToDispense, rng);
        drawPile = [...drawRes.newDrawPile];
        discardPile = [...drawRes.newDiscardPile];
        updatedPlayers = updatedPlayers.map((p) =>
          p.id === victim.id ? { ...p, hand: [...p.hand, ...drawRes.drawnCards] } : p
        );
      }
      launcherTension = evalResult.finalTension;
      currentPlayerIndex = playerCount === 2 ? dealerIndex : (dealerIndex + 2) % playerCount;
      pendingActionState = {
        type: 'AWAITING_STARTING_WILD_COLOR_SELECTION',
        designatedPlayerId: updatedPlayers[currentPlayerIndex].id,
      };
      activeColor = null;
    } else if (topCard.value === 'wild' || topCard.value === 'wild_customizable') {
      pendingActionState = {
        type: 'AWAITING_STARTING_WILD_COLOR_SELECTION',
        designatedPlayerId: state.players[currentPlayerIndex].id,
      };
      activeColor = null;
    } else if (topCard.value === 'wild_attack_attack') {
      pendingActionState = {
        type: 'AWAITING_STARTING_ATTACK_SELECTION',
        designatedPlayerId: state.players[currentPlayerIndex].id,
      };
      activeColor = null;
    }

    const events: GameEventRecord[] = [
      {
        sequenceNumber: state.sequenceNumber + 1,
        type: 'ROUND_STARTED',
        playerId: state.players[dealerIndex].id,
        payload: {
          roundNumber: state.roundNumber + 1,
          dealerIndex,
          topCard,
        },
        timestamp: new Date().toISOString(),
      },
    ];

    const nextState: GameState = {
      ...state,
      status: 'IN_PROGRESS',
      roundNumber: state.roundNumber + 1,
      dealerIndex,
      players: updatedPlayers,
      currentPlayerIndex,
      turnDirection,
      drawPile,
      discardPile,
      topDiscardCard: topCard,
      activeColor,
      turnNumber: 0,
      sequenceNumber: state.sequenceNumber + 1,
      unoVulnerablePlayerId: null,
      pendingActionState,
      roundWinner: null,
      attackLauncherState: { tension: launcherTension },
      attackCustomizableCount: state.attackCustomizableCount,
      updatedAt: new Date().toISOString(),
    };

    assertValidAttackGameState(nextState);
    return { nextState, events };
  }

  // ---------------------------------------------------------------------------
  // Victory & Scoring Helper
  // ---------------------------------------------------------------------------

  private static handleRoundVictory(
    state: GameState,
    players: Player[],
    winnerIndex: number,
    discardPile: Card[],
    drawPile: Card[],
    winningCard: Card,
    activeColor: CardColor | null,
    launcherState: AttackLauncherState,
    events: GameEventRecord[],
    currentSeq: number
  ): ActionProcessResult {
    const winner = players[winnerIndex];

    // Score calculation: winner gets points from all cards left in opponents' hands
    let roundPoints = 0;
    for (const p of players) {
      if (p.id !== winner.id) {
        for (const card of p.hand) {
          roundPoints += card.scoreValue;
        }
      }
    }

    const newScore = winner.score + roundPoints;
    const matchCompleted = newScore >= state.targetScore;

    const roundWinner: GameWinner = {
      id: winner.id,
      username: winner.username,
      score: newScore,
      roundScore: roundPoints,
    };

    const overallWinner: GameWinner | null = matchCompleted
      ? {
          id: winner.id,
          username: winner.username,
          score: newScore,
        }
      : null;

    currentSeq++;
    events.push({
      sequenceNumber: currentSeq,
      type: 'ROUND_WON',
      playerId: winner.id,
      payload: {
        roundWinner,
        roundPoints,
        newScore,
        matchCompleted,
      },
      timestamp: new Date().toISOString(),
    });

    if (matchCompleted) {
      currentSeq++;
      events.push({
        sequenceNumber: currentSeq,
        type: 'MATCH_WON',
        playerId: winner.id,
        payload: { winner: overallWinner },
        timestamp: new Date().toISOString(),
      });
    }

    const updatedPlayers = players.map((p) => (p.id === winner.id ? { ...p, score: newScore } : p));

    const nextState: GameState = {
      ...state,
      status: matchCompleted ? 'COMPLETED' : 'ROUND_OVER',
      players: updatedPlayers,
      drawPile,
      discardPile,
      topDiscardCard: winningCard,
      activeColor,
      roundWinner,
      winner: overallWinner,
      pendingActionState: null,
      sequenceNumber: currentSeq,
      attackLauncherState: launcherState,
      updatedAt: new Date().toISOString(),
    };

    assertValidAttackGameState(nextState);
    return { nextState, events };
  }
}
