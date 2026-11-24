import { v4 as uuidv4 } from 'uuid';
import { Server, Socket } from 'socket.io';
import {
  GameState,
  GameFactory,
  ActionProcessor,
  ActionProcessResult,
  GameAction,
  CardColor,
  PlayerGameState,
  getPlayerGameState,
  GameWinner,
  GameEventRecord,
  DeckManager,
} from '@uno-ultimate/game-engine';
import {
  SOCKET_EVENTS,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@uno-ultimate/game-protocol';
import { ERROR_CODES } from '@uno-ultimate/shared';
import { AppError } from '../../middleware/errorHandler';
import { HTTP_STATUS } from '@uno-ultimate/shared';
import { gameSessionManager } from './game.session.manager';
import { gamePersistenceService } from './game.persistence.service';
import { gameStatePublisher } from './game.state.publisher';
import { roomService } from '../room/room.service';
import { logger } from '../../utils/logger';

type UnoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type UnoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export class GameService {
  /**
   * Initializes and starts a new Classic UNO match for a private room.
   */
  async startMatch(
    roomId: string,
    roomCode: string,
    hostGuestId: string,
    members: { guestId: string; username: string }[],
    variant: string = 'classic',
    settings: Record<string, unknown> = {},
    cumulativeScores?: Map<string, number>,
    options?: { isRematch?: boolean }
  ): Promise<GameState> {
    const isRematch = options?.isRematch === true;
    const activeSession = gameSessionManager.getSessionByRoomCode(roomCode);
    const isSessionGenuinelyActive = Boolean(
      activeSession &&
      activeSession.state.status === 'IN_PROGRESS'
    );

    // 1. Guard against duplicate active matches:
    // Only reject if an in-memory session is actively in progress
    if (isSessionGenuinelyActive) {
      logger.warn('startMatch rejected: match session is actively in progress', {
        roomId,
        roomCode,
        matchId: activeSession?.matchId,
        isRematch,
      });
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.BAD_REQUEST,
        'A match is already in progress for this room.'
      );
    }

    // 2. Clean up any stale or predecessor match records in PostgreSQL
    // If starting a rematch or no active session exists, finalize prior matches
    await gamePersistenceService.finalizeStaleMatchesForRoom(roomId);

    // If session was completed or stale, remove it from memory before registering new match
    if (activeSession) {
      gameSessionManager.removeSessionByRoomCode(roomCode);
    }

    if (variant === 'uno_show_em_no_mercy') {
      if (members.length < 2 || members.length > 6) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.BAD_REQUEST,
          'UNO Show \'em No Mercy requires between 2 and 6 players.'
        );
      }
    } else if (variant === 'uno_flex') {
      if (members.length < 2 || members.length > 8) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.BAD_REQUEST,
          'UNO Flex requires between 2 and 8 players.'
        );
      }
    } else if (variant === 'uno_teams') {
      if (members.length < 4 || members.length > 8 || members.length % 2 !== 0) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.BAD_REQUEST,
          'UNO Teams requires 4, 6, or 8 players (teams of 2).'
        );
      }
    } else {
      if (members.length < 2 || members.length > 10) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.BAD_REQUEST,
          'Match requires between 2 and 10 players.'
        );
      }
    }

    const matchId = uuidv4();
    const targetScore = variant === 'uno_show_em_no_mercy' ? 1000 : 500;

    let attackCustomizableCount: 1 | 3 | undefined = undefined;
    if (variant === 'uno_attack') {
      const rawCount = settings?.attackCustomizableCount;
      if (rawCount !== undefined) {
        if (rawCount !== 1 && rawCount !== 3) {
          throw new AppError(
            HTTP_STATUS.BAD_REQUEST,
            ERROR_CODES.BAD_REQUEST,
            'UNO Attack permits only 1 or 3 Wild Customizable cards (official Mattel GTX66 rules).'
          );
        }
        attackCustomizableCount = rawCount as 1 | 3;
      } else {
        attackCustomizableCount = 3;
      }
    }

    // 2. Initialize GameState through official engine factory
    const initialGameState = GameFactory.createGame({
      matchId,
      roomId,
      variant,
      players: members.map((m) => ({
        id: m.guestId,
        username: m.username,
        cumulativeScore: cumulativeScores?.get(m.guestId) ?? 0,
      })),
      targetScore,
      attackCustomizableCount,
    });

    // 3. Persist Match, MatchPlayers, and initial sequence 0 snapshot in PostgreSQL
    await gamePersistenceService.createMatch(
      matchId,
      roomId,
      variant,
      members.map((m, idx) => ({ guestId: m.guestId, seatIndex: idx })),
      initialGameState
    );

    // 4. Register in active memory manager
    gameSessionManager.setSession(matchId, roomCode, roomId, initialGameState);

    logger.info('Match started', {
      matchId,
      roomCode,
      variant,
      dealerIndex: initialGameState.dealerIndex,
      startingPlayerIndex: initialGameState.currentPlayerIndex,
      topDiscard: `${initialGameState.topDiscardCard.color} ${initialGameState.topDiscardCard.value}`,
    });

    return initialGameState;
  }

  /**
   * Generic executor for validated gameplay actions.
   * Runs inside per-match serialization lock to prevent race conditions.
   */
  private async executeAction(
    roomCode: string,
    action: GameAction
  ): Promise<ActionProcessResult> {
    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    if (!session) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'No active match found for this room.'
      );
    }

    return gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      // Safe idempotent duplicate accept check: if victim already resolved penalty and state advanced
      if (
        (action.type === 'ACCEPT_WILD_DRAW_FOUR' ||
          action.type === 'ACCEPT_WILD_DRAW_TWO' ||
          action.type === 'ACCEPT_WILD_DRAW_COLOR' ||
          action.type === 'ACCEPT_STACK_PENALTY') &&
        'playerId' in action
      ) {
        if (
          !activeSession.state.pendingActionState &&
          activeSession.lastResolvedPenalty &&
          activeSession.lastResolvedPenalty.victimPlayerId === action.playerId &&
          activeSession.lastResolvedPenalty.actionType === action.type
        ) {
          logger.info(`Safely absorbed duplicate ${action.type} request from victim`, {
            matchId: activeSession.matchId,
            roomCode,
            playerId: action.playerId,
            sequenceNumber: activeSession.state.sequenceNumber,
          });
          return {
            nextState: activeSession.state,
            events: [],
          };
        }
      }

      // Safe idempotent duplicate challenge check: if challenger already resolved challenge and state advanced
      if (
        (action.type === 'CHALLENGE_WILD_DRAW_FOUR' ||
          action.type === 'CHALLENGE_WILD_DRAW_TWO' ||
          action.type === 'CHALLENGE_WILD_DRAW_COLOR') &&
        'challengerPlayerId' in action
      ) {
        if (
          !activeSession.state.pendingActionState &&
          activeSession.lastResolvedPenalty &&
          (activeSession.lastResolvedPenalty.challengerPlayerId === action.challengerPlayerId ||
            activeSession.lastResolvedPenalty.victimPlayerId === action.challengerPlayerId) &&
          activeSession.lastResolvedPenalty.actionType === action.type
        ) {
          logger.info(`Safely absorbed duplicate ${action.type} request from challenger`, {
            matchId: activeSession.matchId,
            roomCode,
            challengerPlayerId: action.challengerPlayerId,
            sequenceNumber: activeSession.state.sequenceNumber,
          });
          return {
            nextState: activeSession.state,
            events: [],
          };
        }
      }

      // Safe idempotent duplicate UNO challenge check: if vulnerability already cleared by a recently resolved challenge
      if (action.type === 'CHALLENGE_UNO_FAILURE') {
        if (
          !activeSession.state.unoVulnerablePlayerId &&
          activeSession.lastResolvedPenalty &&
          activeSession.lastResolvedPenalty.actionType === 'CHALLENGE_UNO_FAILURE' &&
          activeSession.lastResolvedPenalty.victimPlayerId === action.targetPlayerId
        ) {
          logger.info('Safely absorbed duplicate or late CHALLENGE_UNO_FAILURE request', {
            matchId: activeSession.matchId,
            roomCode,
            challengerPlayerId: action.challengerPlayerId,
            sequenceNumber: activeSession.state.sequenceNumber,
          });
          return {
            nextState: activeSession.state,
            events: [],
          };
        }
      }

      // Safe idempotent duplicate modal / targeted action check
      const isTargetModalAction =
        action.type === 'CHOOSE_7S_SWAP_TARGET' ||
        action.type === 'CHOOSE_FORCED_SWAP_TARGET' ||
        action.type === 'CHOOSE_TARGETED_DRAW_TWO_TARGET' ||
        action.type === 'CHOOSE_TARGETED_DRAW_FOUR_TARGET' ||
        action.type === 'CHOOSE_ATTACK_TARGET' ||
        action.type === 'CHOOSE_STARTING_WILD_COLOR';

      if (isTargetModalAction && 'playerId' in action) {
        if (
          !activeSession.state.pendingActionState &&
          activeSession.lastResolvedTargetAction &&
          activeSession.lastResolvedTargetAction.playerId === action.playerId &&
          activeSession.lastResolvedTargetAction.actionType === action.type
        ) {
          logger.info(`Safely absorbed duplicate ${action.type} request from player`, {
            matchId: activeSession.matchId,
            roomCode,
            playerId: action.playerId,
            sequenceNumber: activeSession.state.sequenceNumber,
          });
          return {
            nextState: activeSession.state,
            events: [],
          };
        }
      }

      // 1. Process action through pure engine
      let processResult: ActionProcessResult;
      try {
        processResult = ActionProcessor.process(activeSession.state, action);
      } catch (err: unknown) {
        const errorMsg = (err as Error).message;
        throw new AppError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.BAD_REQUEST, errorMsg);
      }

      const { nextState, events } = processResult;

      // 2. Durably commit progress, events, and snapshot in a single database transaction
      await gamePersistenceService.persistActionBatch(activeSession.matchId, nextState, events);

      // 3. ONLY after successful database commit, update in-memory session state!
      activeSession.state = nextState;

      // Record last resolved penalty or challenge for idempotency tracking
      if (
        (action.type === 'ACCEPT_WILD_DRAW_FOUR' ||
          action.type === 'ACCEPT_WILD_DRAW_TWO' ||
          action.type === 'ACCEPT_WILD_DRAW_COLOR' ||
          action.type === 'ACCEPT_STACK_PENALTY') &&
        'playerId' in action
      ) {
        const resolvedEvent = events.find((e) =>
          e.type === 'WILD_DRAW_FOUR_ACCEPTED' ||
          e.type === 'WILD_DRAW_TWO_ACCEPTED' ||
          e.type === 'WILD_DRAW_COLOR_ACCEPTED' ||
          e.type === 'STACK_PENALTY_RESOLVED' ||
          e.type === 'game:wdf-accepted'
        );
        const cardsDrawn =
          (resolvedEvent?.payload?.cardsDrawn as number) ??
          (resolvedEvent?.payload?.drawnCount as number) ??
          (action.type === 'ACCEPT_WILD_DRAW_FOUR' ? 4 : action.type === 'ACCEPT_WILD_DRAW_TWO' ? 2 : 0);

        activeSession.lastResolvedPenalty = {
          actionType: action.type,
          victimPlayerId: action.playerId,
          sequenceNumber: nextState.sequenceNumber,
          cardsDrawn,
          resolvedAt: new Date().toISOString(),
        };
      } else if (
        (action.type === 'CHALLENGE_WILD_DRAW_FOUR' ||
          action.type === 'CHALLENGE_WILD_DRAW_TWO' ||
          action.type === 'CHALLENGE_WILD_DRAW_COLOR') &&
        'challengerPlayerId' in action
      ) {
        const wonEvent = events.find(
          (e) =>
            e.type === 'WILD_DRAW_FOUR_CHALLENGE_WON' ||
            e.type === 'WILD_DRAW_TWO_CHALLENGE_WON' ||
            e.type === 'WILD_DRAW_COLOR_CHALLENGE_WON' ||
            (e.type === 'game:wdf-challenge-result' && (e.payload as Record<string, unknown>)?.challengeWon === true)
        );
        const lostEvent = events.find(
          (e) =>
            e.type === 'WILD_DRAW_FOUR_CHALLENGE_LOST' ||
            e.type === 'WILD_DRAW_TWO_CHALLENGE_LOST' ||
            e.type === 'WILD_DRAW_COLOR_CHALLENGE_LOST' ||
            (e.type === 'game:wdf-challenge-result' && (e.payload as Record<string, unknown>)?.challengeWon === false)
        );
        const challengeWon = !!wonEvent;
        const resolvedEvent = wonEvent || lostEvent;
        const defaultPenalty =
          action.type === 'CHALLENGE_WILD_DRAW_FOUR'
            ? (challengeWon ? 4 : 6)
            : action.type === 'CHALLENGE_WILD_DRAW_TWO'
            ? (challengeWon ? 2 : 4)
            : (challengeWon ? 0 : 2);
        const cardsDrawn =
          (resolvedEvent?.payload?.penaltyCards as number) ??
          (resolvedEvent?.payload?.penaltyCardsDrawn as number) ??
          defaultPenalty;

        activeSession.lastResolvedPenalty = {
          actionType: action.type,
          victimPlayerId: (resolvedEvent?.payload?.offenderId as string) || action.challengerPlayerId,
          challengerPlayerId: action.challengerPlayerId,
          sequenceNumber: nextState.sequenceNumber,
          cardsDrawn,
          challengeWon,
          resolvedAt: new Date().toISOString(),
        };
      } else if (action.type !== 'CALL_UNO' && action.type !== 'CHALLENGE_UNO_FAILURE') {
        activeSession.lastResolvedPenalty = undefined;
      }

      // Record last resolved modal / target action for idempotency tracking
      if (isTargetModalAction && 'playerId' in action) {
        activeSession.lastResolvedTargetAction = {
          actionType: action.type,
          playerId: action.playerId,
          sequenceNumber: nextState.sequenceNumber,
          resolvedAt: new Date().toISOString(),
          targetPlayerId: 'targetPlayerId' in action ? (action as { targetPlayerId?: string }).targetPlayerId : undefined,
        };
      } else if (action.type !== 'ACCEPT_WILD_DRAW_FOUR' && action.type !== 'ACCEPT_WILD_DRAW_TWO' && action.type !== 'ACCEPT_WILD_DRAW_COLOR' && action.type !== 'ACCEPT_STACK_PENALTY') {
        activeSession.lastResolvedTargetAction = undefined;
      }

      return processResult;
    });
  }

  async playCard(
    guestId: string,
    roomCode: string,
    cardId: string,
    chosenColor?: CardColor,
    playMode?: 'regular' | 'flex',
    targetPlayerId?: string,
    declareUno?: boolean
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'PLAY_CARD',
      playerId: guestId,
      cardId,
      chosenColor,
      playMode,
      targetPlayerId,
      declareUno,
    });
  }

  async drawCard(guestId: string, roomCode: string): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'DRAW_CARD',
      playerId: guestId,
    });
  }

  async passTurn(guestId: string, roomCode: string): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'PASS_TURN',
      playerId: guestId,
    });
  }

  async callUno(guestId: string, roomCode: string, targetPlayerId?: string): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'CALL_UNO',
      playerId: guestId,
      targetPlayerId,
    });
  }

  async challengeUno(
    guestId: string,
    roomCode: string,
    targetPlayerId: string
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'CHALLENGE_UNO_FAILURE',
      challengerPlayerId: guestId,
      targetPlayerId,
    });
  }

  async challengeWildDrawFour(
    guestId: string,
    roomCode: string
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'CHALLENGE_WILD_DRAW_FOUR',
      challengerPlayerId: guestId,
    });
  }

  async acceptWildDrawFour(
    guestId: string,
    roomCode: string
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'ACCEPT_WILD_DRAW_FOUR',
      playerId: guestId,
    });
  }

  async challengeWildDrawTwo(
    guestId: string,
    roomCode: string
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'CHALLENGE_WILD_DRAW_TWO',
      challengerPlayerId: guestId,
    });
  }

  async acceptWildDrawTwo(
    guestId: string,
    roomCode: string
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'ACCEPT_WILD_DRAW_TWO',
      playerId: guestId,
    });
  }

  async challengeWildDrawColor(
    guestId: string,
    roomCode: string
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'CHALLENGE_WILD_DRAW_COLOR',
      challengerPlayerId: guestId,
    });
  }

  async acceptWildDrawColor(
    guestId: string,
    roomCode: string
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'ACCEPT_WILD_DRAW_COLOR',
      playerId: guestId,
    });
  }

  async chooseStartingWildColor(
    guestId: string,
    roomCode: string,
    chosenColor: CardColor
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'CHOOSE_STARTING_WILD_COLOR',
      playerId: guestId,
      chosenColor,
    });
  }

  async choose7sSwapTarget(
    guestId: string,
    roomCode: string,
    targetPlayerId: string
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'CHOOSE_7S_SWAP_TARGET',
      playerId: guestId,
      targetPlayerId,
    });
  }

  async acceptStackPenalty(
    guestId: string,
    roomCode: string
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'ACCEPT_STACK_PENALTY',
      playerId: guestId,
    });
  }

  async chooseTargetedDrawTwoTarget(
    guestId: string,
    roomCode: string,
    targetPlayerId: string
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'CHOOSE_TARGETED_DRAW_TWO_TARGET',
      playerId: guestId,
      targetPlayerId,
    });
  }

  async chooseTargetedDrawFourTarget(
    guestId: string,
    roomCode: string,
    targetPlayerId: string
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'CHOOSE_TARGETED_DRAW_FOUR_TARGET',
      playerId: guestId,
      targetPlayerId,
    });
  }

  async chooseForcedSwapTarget(
    guestId: string,
    roomCode: string,
    targetPlayerId: string
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'CHOOSE_FORCED_SWAP_TARGET',
      playerId: guestId,
      targetPlayerId,
    });
  }

  async teamInitialPass(
    guestId: string,
    roomCode: string,
    cardId: string
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'TEAM_INITIAL_PASS',
      playerId: guestId,
      cardId,
    });
  }

  async teamCardPass(
    guestId: string,
    roomCode: string,
    cardId: string
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'TEAM_CARD_PASS',
      playerId: guestId,
      cardId,
    });
  }

  async teamSplitHandPass(
    guestId: string,
    roomCode: string,
    cardIds: string[]
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'TEAM_SPLIT_HAND_PASS',
      playerId: guestId,
      cardIds,
    });
  }

  async chooseAttackTarget(
    guestId: string,
    roomCode: string,
    targetPlayerId: string,
    chosenColor?: CardColor
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'CHOOSE_ATTACK_TARGET',
      playerId: guestId,
      targetPlayerId,
      chosenColor,
    });
  }

  async startNextRound(
    guestId: string,
    roomCode: string
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'START_NEXT_ROUND',
      triggeredByPlayerId: guestId,
    });
  }

  /**
   * Retrieves or recovers the secure PlayerGameState projection for a player.
   * If in-memory session is missing (e.g. server restart), recovers from PostgreSQL snapshot.
   * Enforces player membership verification.
   */
  async getOrRecoverPlayerState(
    guestId: string,
    roomId: string,
    roomCode: string
  ): Promise<PlayerGameState | null> {
    let session = gameSessionManager.getSessionByRoomCode(roomCode);

    if (!session) {
      // Attempt recovery from database snapshot
      const recoveredState = await this.recoverMatchIfActive(roomId, roomCode);
      if (!recoveredState) return null;
      session = gameSessionManager.getSessionByRoomCode(roomCode);
    }

    if (!session || session.state.status === 'COMPLETED') return null;

    // Verify player is an actual member of this match
    if (!session.state.players.some((p) => p.id === guestId)) {
      return null;
    }

    try {
      return getPlayerGameState(session.state, guestId);
    } catch {
      return null;
    }
  }

  /**
   * Retrieves the current secure PlayerGameState projection for a player.
   */
  getActivePlayerState(guestId: string, roomCode: string): PlayerGameState | null {
    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    if (!session || session.state.status === 'COMPLETED') return null;

    try {
      return getPlayerGameState(session.state, guestId);
    } catch {
      return null;
    }
  }

  /**
   * Attempts to recover an active match state from the database if server restarted.
   */
  async recoverMatchIfActive(roomId: string, roomCode: string): Promise<GameState | null> {
    const existing = gameSessionManager.getSessionByRoomCode(roomCode);
    if (existing) {
      if (existing.state.status === 'COMPLETED') {
        gameSessionManager.removeSessionByRoomCode(roomCode);
        return null;
      }
      return existing.state;
    }

    const activeMatch = await gamePersistenceService.findActiveMatchForRoom(roomId);
    if (!activeMatch) return null;

    const snapshot = await gamePersistenceService.loadLatestSnapshot(activeMatch.id);
    if (!snapshot || snapshot.status === 'COMPLETED') return null;

    gameSessionManager.setSession(activeMatch.id, roomCode, roomId, snapshot);
    logger.info('Recovered active match from database snapshot', { matchId: activeMatch.id, roomCode });
    return snapshot;
  }

  /**
   * Handles player departure (disconnect grace timeout or intentional leave/logout).
   * Server-authoritative turn progression and state recovery across all 7 variants.
   */
  async handlePlayerDeparture(
    io: UnoServer,
    guestId: string,
    roomCode: string,
    reason: 'DISCONNECT_TIMEOUT' | 'INTENTIONAL_LEAVE',
    guestSockets?: Map<string, UnoSocket>
  ): Promise<void> {
    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    if (!session || session.state.status === 'COMPLETED') {
      return;
    }

    await gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      const state = activeSession.state;
      if (state.status === 'COMPLETED') return;

      const departedPlayer = state.players.find((p) => p.id === guestId);
      if (!departedPlayer) return;

      const departedUsername = departedPlayer.username;
      const remainingPlayers = state.players.filter((p) => p.id !== guestId);
      const remainingActivePlayers = remainingPlayers.filter((p) => !p.isEliminated && !p.isOut);

      const isTeams = state.variant === 'uno_teams';
      const activeTeams = new Set(remainingActivePlayers.map((p) => p.teamId).filter(Boolean));
      const insufficientTeams = isTeams && (activeTeams.size <= 1 || remainingPlayers.length < 4 || remainingPlayers.length % 2 !== 0);
      const insufficientStandardPlayers = !isTeams && remainingActivePlayers.length < 2;

      // Case 1: Insufficient players/teams remain -> Declare match winner by forfeit/departure
      if (insufficientStandardPlayers || insufficientTeams) {
        let winner: GameWinner;
        if (isTeams) {
          const winningTeamId = Array.from(activeTeams)[0] || remainingPlayers[0]?.teamId || 'team_1';
          const winningPlayers = remainingPlayers.filter((p) => p.teamId === winningTeamId);
          winner = {
            id: winningPlayers[0]?.id || 'unknown',
            username: winningPlayers.length > 1
              ? `${winningPlayers[0].username} & ${winningPlayers[1].username} (${winningTeamId})`
              : `${winningPlayers[0]?.username ?? 'Unknown'} (${winningTeamId})`,
            score: Math.max(winningPlayers[0]?.score ?? 0, state.targetScore),
            roundScore: 0,
          };
        } else {
          const soleWinner = remainingActivePlayers[0] || remainingPlayers[0] || departedPlayer;
          winner = {
            id: soleWinner.id,
            username: soleWinner.username,
            score: Math.max(soleWinner.score, state.targetScore),
            roundScore: 0,
          };
        }

        const currentSeq = state.sequenceNumber + 1;
        const events: GameEventRecord[] = [
          {
            sequenceNumber: currentSeq,
            type: 'PLAYER_DEPARTED',
            playerId: guestId,
            payload: { guestId, username: departedUsername, reason },
            timestamp: new Date().toISOString(),
          },
          {
            sequenceNumber: currentSeq + 1,
            type: 'MATCH_FINISHED_BY_DEPARTURE',
            playerId: winner.id,
            payload: { winner, reason },
            timestamp: new Date().toISOString(),
          },
        ];

        const finishedState: GameState = {
          ...state,
          status: 'COMPLETED',
          winner,
          roundWinner: winner,
          sequenceNumber: currentSeq + 1,
          updatedAt: new Date().toISOString(),
        };

        await gamePersistenceService.persistActionBatch(activeSession.matchId, finishedState, events);
        activeSession.state = finishedState;

        io.to(roomCode).emit(SOCKET_EVENTS.GAME_PLAYER_DEPARTED, {
          guestId,
          username: departedUsername,
          reason,
        });

        gameStatePublisher.broadcastMatchFinished(io, roomCode, finishedState);

        try {
          const updatedRoom = await roomService.updateRoomStatus(finishedState.roomId, 'FINISHED');
          io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, { room: updatedRoom });
        } catch (statusErr) {
          logger.warn('Failed to update room status to FINISHED on departure', { roomCode, error: String(statusErr) });
        }

        gameSessionManager.removeGuest(guestId);
        gameSessionManager.removeSessionByRoomCode(roomCode);
        return;
      }

      // Case 2: Multi-player match continues with 2+ active players
      // A. Card conservation
      let newDrawPile = [...state.drawPile];
      let newDiscardPile = [...state.discardPile];
      let newSetAsideCards = [...(state.setAsideCards || [])];

      if (state.variant === 'uno_show_em_no_mercy') {
        // No Mercy: Add departing player's hand to setAsideCards to uphold 168-card law
        newSetAsideCards = [...newSetAsideCards, ...departedPlayer.hand];
      } else {
        // Other variants: Place under top discard card to preserve deck count
        if (departedPlayer.hand.length > 0) {
          if (newDiscardPile.length > 1) {
            const top = newDiscardPile[newDiscardPile.length - 1];
            const rest = newDiscardPile.slice(0, -1);
            newDiscardPile = [...rest, ...departedPlayer.hand, top];
          } else {
            newDiscardPile = [...departedPlayer.hand, ...newDiscardPile];
          }
        }
      }

      // B. Resolve pending action states involving departing player
      let newPendingActionState = state.pendingActionState;
      let newActiveColor = state.activeColor;

      if (!newActiveColor) {
        newActiveColor = state.topDiscardCard.color || 'red';
      }

      if (newPendingActionState) {
        const p = newPendingActionState;
        if (p.type === 'AWAITING_STACK_RESOLUTION') {
          if (p.targetPlayerId === guestId) {
            const penalty = p.accumulatedPenalty;
            if (state.variant === 'uno_show_em_no_mercy') {
              const drawResult = DeckManager.drawCards(newDrawPile, newDiscardPile, penalty);
              newDrawPile = [...drawResult.newDrawPile];
              newDiscardPile = [...drawResult.newDiscardPile];
              newSetAsideCards = [...newSetAsideCards, ...drawResult.drawnCards];
            }
            newPendingActionState = null;
          }
        } else if (
          p.type === 'AWAITING_WILD_DRAW_FOUR_RESOLUTION' ||
          p.type === 'AWAITING_WILD_DRAW_TWO_RESOLUTION' ||
          p.type === 'AWAITING_WILD_DRAW_COLOR_RESOLUTION'
        ) {
          if (p.victimPlayerId === guestId || p.playedByPlayerId === guestId) {
            newPendingActionState = null;
          }
        } else if (p.type === 'AWAITING_STARTING_WILD_COLOR_SELECTION') {
          if (p.designatedPlayerId === guestId) {
            newPendingActionState = null;
          }
        } else if (
          (p.type === 'AWAITING_7S_SWAP_SELECTION' && p.sourcePlayerId === guestId) ||
          (p.type === 'AWAITING_TARGETED_DRAW_TWO_SELECTION' && p.sourcePlayerId === guestId) ||
          (p.type === 'AWAITING_TARGETED_DRAW_FOUR_SELECTION' && p.sourcePlayerId === guestId) ||
          (p.type === 'AWAITING_FORCED_SWAP_SELECTION' && p.sourcePlayerId === guestId) ||
          (p.type === 'AWAITING_ATTACK_TARGET_SELECTION' && p.playedByPlayerId === guestId) ||
          (p.type === 'AWAITING_STARTING_ATTACK_SELECTION' && p.designatedPlayerId === guestId) ||
          p.type === 'AWAITING_TEAM_INITIAL_PASS' ||
          p.type === 'AWAITING_TEAM_CARD_PASS' ||
          p.type === 'AWAITING_TEAM_HAND_SPLIT' ||
          p.type === 'AWAITING_WILD_TEAM_PLAY'
        ) {
          newPendingActionState = null;
        }
      }

      // C. Clear inspection hand & uno vulnerable if departing player involved
      const newInspectionHand = null;
      const newUnoVulnerablePlayerId =
        state.unoVulnerablePlayerId === guestId ? null : state.unoVulnerablePlayerId;

      // D. Turn progression
      const oldPlayerOrder = [...state.playerOrder];
      const depIdx = oldPlayerOrder.indexOf(guestId);
      const newPlayerOrder = oldPlayerOrder.filter((id) => id !== guestId);
      const wasActiveTurn = state.playerOrder[state.currentPlayerIndex] === guestId;

      let nextActiveGuestId: string;

      if (wasActiveTurn) {
        const step = state.turnDirection === 'clockwise' ? 1 : -1;
        let candidateIdx = (((depIdx + step) % oldPlayerOrder.length) + oldPlayerOrder.length) % oldPlayerOrder.length;
        const remainingActiveIds = new Set(remainingActivePlayers.map((p) => p.id));

        while (candidateIdx !== depIdx) {
          const candidateId = oldPlayerOrder[candidateIdx];
          if (remainingActiveIds.has(candidateId)) {
            nextActiveGuestId = candidateId;
            break;
          }
          candidateIdx = (((candidateIdx + step) % oldPlayerOrder.length) + oldPlayerOrder.length) % oldPlayerOrder.length;
        }
        if (!nextActiveGuestId!) {
          nextActiveGuestId = remainingActivePlayers[0].id;
        }
      } else {
        nextActiveGuestId = state.playerOrder[state.currentPlayerIndex];
      }

      const newCurrentPlayerIndex = newPlayerOrder.indexOf(nextActiveGuestId);

      // Reset turn flags on new active player
      const newPlayers = remainingPlayers.map((p) => {
        if (p.id === nextActiveGuestId) {
          return {
            ...p,
            hasDrawnThisTurn: false,
            drawnCardId: null,
          };
        }
        return p;
      });

      // Update dealer index if needed
      const oldDealerId = oldPlayerOrder[state.dealerIndex];
      const candidateDealerIdx = newPlayerOrder.indexOf(oldDealerId);
      const finalDealerIndex = candidateDealerIdx >= 0 ? candidateDealerIdx : 0;

      let currentSeq = state.sequenceNumber + 1;
      const events: GameEventRecord[] = [
        {
          sequenceNumber: currentSeq,
          type: 'PLAYER_DEPARTED',
          playerId: guestId,
          payload: { guestId, username: departedUsername, reason },
          timestamp: new Date().toISOString(),
        },
      ];

      if (wasActiveTurn) {
        currentSeq += 1;
        events.push({
          sequenceNumber: currentSeq,
          type: 'TURN_RECOVERED',
          playerId: nextActiveGuestId,
          payload: {
            departedGuestId: guestId,
            departedUsername,
            newCurrentTurnGuestId: nextActiveGuestId,
            reason,
          },
          timestamp: new Date().toISOString(),
        });
      }

      const recoveredState: GameState = {
        ...state,
        players: newPlayers,
        playerOrder: newPlayerOrder,
        currentPlayerIndex: newCurrentPlayerIndex,
        dealerIndex: finalDealerIndex,
        drawPile: newDrawPile,
        discardPile: newDiscardPile,
        setAsideCards: newSetAsideCards,
        activeColor: newActiveColor,
        pendingActionState: newPendingActionState,
        inspectionHand: newInspectionHand,
        unoVulnerablePlayerId: newUnoVulnerablePlayerId,
        turnNumber: state.turnNumber + (wasActiveTurn ? 1 : 0),
        sequenceNumber: currentSeq,
        updatedAt: new Date().toISOString(),
      };

      await gamePersistenceService.persistActionBatch(activeSession.matchId, recoveredState, events);
      activeSession.state = recoveredState;

      // Clean up idempotency cache and guest mapping
      if (activeSession.lastResolvedPenalty?.victimPlayerId === guestId) {
        activeSession.lastResolvedPenalty = undefined;
      }
      if (activeSession.lastResolvedTargetAction?.playerId === guestId) {
        activeSession.lastResolvedTargetAction = undefined;
      }
      gameSessionManager.removeGuest(guestId);

      io.to(roomCode).emit(SOCKET_EVENTS.GAME_PLAYER_DEPARTED, {
        guestId,
        username: departedUsername,
        reason,
      });

      if (wasActiveTurn) {
        const nextPlayer = newPlayers.find((p) => p.id === nextActiveGuestId);
        io.to(roomCode).emit(SOCKET_EVENTS.GAME_TURN_RECOVERED, {
          departedGuestId: guestId,
          departedUsername,
          newCurrentTurnGuestId: nextActiveGuestId,
          reason,
          message: `Turn recovered to ${nextPlayer?.username ?? 'next player'}.`,
        });
      }

      gameStatePublisher.publishToAllParticipants(recoveredState, guestSockets || new Map(), io);
    });
  }

  /**
   * Safe server-authoritative stuck-state detection & recovery safeguard.
   * Can be triggered on room:resume or when a turn is stalled.
   * Examines active match session for stuck pending states, invalid turn indices, or orphaned actors,
   * cleanly auto-resolving them so games never remain permanently frozen.
   */
  async checkAndRecoverStuckSession(
    roomCode: string,
    io?: UnoServer,
    guestSockets?: Map<string, UnoSocket>
  ): Promise<GameState | null> {
    const session = gameSessionManager.getSessionByRoomCode(roomCode);
    if (!session || session.state.status !== 'IN_PROGRESS') {
      return session?.state ?? null;
    }

    return gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      const state = activeSession.state;
      let needsRecovery = false;
      let curIdx = state.currentPlayerIndex;

      // 1. Check if currentPlayerIndex points to an invalid or eliminated player
      if (
        curIdx < 0 ||
        curIdx >= state.players.length ||
        state.players[curIdx]?.isEliminated ||
        state.players[curIdx]?.isOut
      ) {
        const step = state.turnDirection === 'counter_clockwise' ? -1 : 1;
        const total = state.players.length;
        let safeIdx = (((curIdx + step) % total) + total) % total;
        let iterations = 0;
        while (iterations < total && (state.players[safeIdx]?.isEliminated || state.players[safeIdx]?.isOut)) {
          safeIdx = (((safeIdx + step) % total) + total) % total;
          iterations++;
        }
        if (iterations < total) {
          curIdx = safeIdx;
          needsRecovery = true;
          logger.warn('Recovered invalid currentPlayerIndex in stuck session', { roomCode, safeIdx });
        }
      }

      // 2. Check orphaned or invalid pendingActionState
      const pending = state.pendingActionState;
      if (pending) {
        let isActorMissing = false;
        if ('victimPlayerId' in pending && pending.victimPlayerId) {
          const victim = state.players.find((p) => p.id === pending.victimPlayerId);
          if (!victim || victim.isEliminated || victim.isOut) isActorMissing = true;
        } else if ('targetPlayerId' in pending && pending.targetPlayerId) {
          const target = state.players.find((p) => p.id === pending.targetPlayerId);
          if (!target || target.isEliminated || target.isOut) isActorMissing = true;
        } else if ('sourcePlayerId' in pending && pending.sourcePlayerId) {
          const source = state.players.find((p) => p.id === pending.sourcePlayerId);
          if (!source || source.isEliminated || source.isOut) isActorMissing = true;
        } else if ('designatedPlayerId' in pending && pending.designatedPlayerId) {
          const designated = state.players.find((p) => p.id === pending.designatedPlayerId);
          if (!designated || designated.isEliminated || designated.isOut) isActorMissing = true;
        }

        if (isActorMissing) {
          needsRecovery = true;
          logger.warn('Clearing orphaned pendingActionState whose actor is missing or eliminated', {
            roomCode,
            pendingType: pending.type,
          });
        }
      }

      if (!needsRecovery) {
        return state;
      }

      const currentSeq = state.sequenceNumber + 1;
      const healedState: GameState = {
        ...state,
        currentPlayerIndex: curIdx,
        pendingActionState: null,
        inspectionHand: null,
        sequenceNumber: currentSeq,
        updatedAt: new Date().toISOString(),
      };

      const events: GameEventRecord[] = [
        {
          sequenceNumber: currentSeq,
          type: 'TURN_RECOVERED',
          playerId: healedState.players[curIdx]?.id,
          payload: {
            reason: 'STUCK_STATE_AUTO_RECOVERY',
            newCurrentTurnGuestId: healedState.players[curIdx]?.id,
          },
          timestamp: new Date().toISOString(),
        },
      ];

      await gamePersistenceService.persistActionBatch(activeSession.matchId, healedState, events);
      activeSession.state = healedState;

      if (io) {
        io.to(roomCode).emit(SOCKET_EVENTS.GAME_TURN_RECOVERED, {
          departedGuestId: '',
          departedUsername: 'System',
          newCurrentTurnGuestId: healedState.players[curIdx]?.id ?? '',
          reason: 'STUCK_STATE_AUTO_RECOVERY',
          message: `Turn recovered to ${healedState.players[curIdx]?.username ?? 'next player'}.`,
        });
        gameStatePublisher.publishToAllParticipants(healedState, guestSockets || new Map(), io);
      }

      return healedState;
    });
  }
}

export const gameService = new GameService();
