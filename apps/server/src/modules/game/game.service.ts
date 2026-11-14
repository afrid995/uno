import { v4 as uuidv4 } from 'uuid';
import {
  GameState,
  GameFactory,
  ActionProcessor,
  ActionProcessResult,
  GameAction,
  CardColor,
  PlayerGameState,
  getPlayerGameState,
} from '@uno-ultimate/game-engine';
import { ERROR_CODES } from '@uno-ultimate/shared';
import { AppError } from '../../middleware/errorHandler';
import { HTTP_STATUS } from '@uno-ultimate/shared';
import { gameSessionManager } from './game.session.manager';
import { gamePersistenceService } from './game.persistence.service';
import { logger } from '../../utils/logger';

export class GameService {
  /**
   * Initializes and starts a new Classic UNO match for a private room.
   */
  async startMatch(
    roomId: string,
    roomCode: string,
    hostGuestId: string,
    members: { guestId: string; username: string }[],
    variant: string = 'classic'
  ): Promise<GameState> {
    // 1. Guard against duplicate active matches
    const existingMatch = await gamePersistenceService.findActiveMatchForRoom(roomId);
    if (existingMatch) {
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.BAD_REQUEST,
        'A match is already in progress for this room.'
      );
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

    // 2. Initialize GameState through official engine factory
    const initialGameState = GameFactory.createGame({
      matchId,
      roomId,
      variant,
      players: members.map((m) => ({ id: m.guestId, username: m.username })),
      targetScore,
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

      return processResult;
    });
  }

  async playCard(
    guestId: string,
    roomCode: string,
    cardId: string,
    chosenColor?: CardColor,
    playMode?: 'regular' | 'flex',
    targetPlayerId?: string
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'PLAY_CARD',
      playerId: guestId,
      cardId,
      chosenColor,
      playMode,
      targetPlayerId,
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

  async callUno(guestId: string, roomCode: string): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'CALL_UNO',
      playerId: guestId,
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

  async chooseColorRouletteColor(
    guestId: string,
    roomCode: string,
    chosenColor: CardColor
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'CHOOSE_COLOR_ROULETTE_COLOR',
      playerId: guestId,
      chosenColor,
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

    if (!session) return null;

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
    if (!session) return null;

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
    if (existing) return existing.state;

    const activeMatch = await gamePersistenceService.findActiveMatchForRoom(roomId);
    if (!activeMatch) return null;

    const snapshot = await gamePersistenceService.loadLatestSnapshot(activeMatch.id);
    if (!snapshot) return null;

    gameSessionManager.setSession(activeMatch.id, roomCode, roomId, snapshot);
    logger.info('Recovered active match from database snapshot', { matchId: activeMatch.id, roomCode });
    return snapshot;
  }
}

export const gameService = new GameService();
