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
    members: { guestId: string; username: string }[]
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

    if (members.length < 2 || members.length > 10) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.BAD_REQUEST,
        'Classic UNO requires between 2 and 10 players.'
      );
    }

    const matchId = uuidv4();

    // 2. Initialize GameState through official Mattel 42001 engine factory
    const initialGameState = GameFactory.createGame({
      matchId,
      roomId,
      variant: 'classic',
      players: members.map((m) => ({ id: m.guestId, username: m.username })),
      targetScore: 500,
    });

    // 3. Persist Match and MatchPlayers in PostgreSQL
    await gamePersistenceService.createMatch(
      matchId,
      roomId,
      'classic',
      members.map((m, idx) => ({ guestId: m.guestId, seatIndex: idx }))
    );

    // 4. Save initial snapshot (sequence 0)
    await gamePersistenceService.saveGameSnapshot(matchId, 0, initialGameState);

    // 5. Register in active memory manager
    gameSessionManager.setSession(matchId, roomCode, roomId, initialGameState);

    logger.info('Classic UNO match started', {
      matchId,
      roomCode,
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

      // 2. Update memory state
      activeSession.state = nextState;

      // 3. Persist progress and events asynchronously
      gamePersistenceService.updateMatchProgress(activeSession.matchId, nextState);

      for (const ev of events) {
        gamePersistenceService.saveGameEvent(
          activeSession.matchId,
          ev.sequenceNumber,
          ev.type,
          ev.playerId,
          ev.payload
        );
      }

      // Persist snapshot periodically or on major transitions
      if (
        nextState.status === 'ROUND_OVER' ||
        nextState.status === 'COMPLETED' ||
        nextState.sequenceNumber % 5 === 0
      ) {
        gamePersistenceService.saveGameSnapshot(activeSession.matchId, nextState.sequenceNumber, nextState);
      }

      return processResult;
    });
  }

  async playCard(
    guestId: string,
    roomCode: string,
    cardId: string,
    chosenColor?: CardColor
  ): Promise<ActionProcessResult> {
    return this.executeAction(roomCode, {
      type: 'PLAY_CARD',
      playerId: guestId,
      cardId,
      chosenColor,
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
