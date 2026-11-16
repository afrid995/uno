import { Server, Socket } from 'socket.io';
import {
  SOCKET_EVENTS,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  playCardInputSchema,
  challengeUnoInputSchema,
  choose7sSwapInputSchema,
  chooseRouletteColorInputSchema,
  acceptStackPenaltyInputSchema,
  chooseTargetedDrawTwoInputSchema,
  chooseTargetedDrawFourInputSchema,
  chooseForcedSwapInputSchema,
  teamInitialPassInputSchema,
  teamCardPassInputSchema,
  teamSplitHandPassInputSchema,
  chooseAttackTargetInputSchema,
  CardColor,
} from '@uno-ultimate/game-protocol';
import { ERROR_CODES } from '@uno-ultimate/shared';
import { AppError } from '../../middleware/errorHandler';
import { HTTP_STATUS } from '@uno-ultimate/shared';
import { GameState, getPlayerGameState } from '@uno-ultimate/game-engine';
import { gameService } from './game.service';
import { gameStatePublisher } from './game.state.publisher';
import { roomService } from '../room/room.service';
import { gameSessionManager } from './game.session.manager';
import { logger } from '../../utils/logger';

type UnoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type UnoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function registerGameHandlers(
  io: UnoServer,
  socket: UnoSocket,
  guestSockets: Map<string, UnoSocket>
): void {
  const getAuthenticatedGuestId = (): string => {
    if (!socket.data.isAuthenticated || !socket.data.guestId) {
      throw new AppError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Authentication required');
    }
    return socket.data.guestId;
  };

  const getActiveRoomCode = (explicitRoomCode?: string): string => {
    let roomCode = explicitRoomCode || socket.data.currentRoomCode;
    if (!roomCode && socket.data.guestId) {
      roomCode = gameSessionManager.getRoomCodeForGuest(socket.data.guestId) || undefined;
      if (roomCode) {
        socket.data.currentRoomCode = roomCode;
        socket.join(roomCode);
      }
    }
    if (!roomCode) {
      throw new AppError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.NOT_IN_ROOM, 'Not currently in a game room');
    }
    return roomCode;
  };

  const handleGameStateBroadcasts = async (nextState: GameState, roomCode: string) => {
    if (socket.data.guestId && (!guestSockets.has(socket.data.guestId) || guestSockets.get(socket.data.guestId)?.id !== socket.id)) {
      guestSockets.set(socket.data.guestId, socket);
    }
    gameStatePublisher.publishToAllParticipants(nextState, guestSockets, io);

    if (nextState.status === 'ROUND_OVER') {
      gameStatePublisher.broadcastRoundFinished(io, roomCode, nextState);
    } else if (nextState.status === 'COMPLETED') {
      gameStatePublisher.broadcastMatchFinished(io, roomCode, nextState);
      try {
        const updatedRoom = await roomService.updateRoomStatus(nextState.roomId, 'FINISHED');
        io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, { room: updatedRoom });
      } catch (statusErr) {
        logger.warn('Failed to update room status to FINISHED upon match completion', {
          roomCode,
          roomId: nextState.roomId,
          error: String(statusErr),
        });
      }
      gameSessionManager.removeSessionByRoomCode(roomCode);
    }
  };

  // 1. Handle game:play-card
  socket.on(SOCKET_EVENTS.GAME_PLAY_CARD, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();
      const validated = await playCardInputSchema.parseAsync(payload);

      const { nextState } = await gameService.playCard(
        guestId,
        roomCode,
        validated.cardId,
        validated.chosenColor,
        validated.playMode,
        validated.targetPlayerId
      );

      // Publish personalized projections and handle round/match completion
      await handleGameStateBroadcasts(nextState, roomCode);

      callback({
        success: true,
        data: {
          success: true,
          roundOver: nextState.status === 'ROUND_OVER',
          matchOver: nextState.status === 'COMPLETED',
        },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to play card';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      logger.warn('game:play-card rejected', { error: message, code, guestId: socket.data.guestId });
      callback({ success: false, error: { code, message } });
    }
  });

  // 2. Handle game:draw-card
  socket.on(SOCKET_EVENTS.GAME_DRAW_CARD, async (_payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();

      const { nextState, events } = await gameService.drawCard(guestId, roomCode);

      const elim = events.find((e) => e.type === 'PLAYER_ELIMINATED');
      if (elim) {
        const pElim = elim.payload as { playerId: string; cardCount: number; eliminationOrder: number };
        const elimPlayer = nextState.players.find((p) => p.id === pElim.playerId);
        const remaining = nextState.players.filter((p) => !p.isEliminated).length;
        io.to(roomCode).emit(SOCKET_EVENTS.GAME_PLAYER_ELIMINATED, {
          guestId: pElim.playerId,
          username: elimPlayer?.username ?? 'Player',
          cardCount: pElim.cardCount,
          remainingPlayerCount: remaining,
        });
      }

      await handleGameStateBroadcasts(nextState, roomCode);

      const player = nextState.players.find((p) => p.id === guestId);
      callback({
        success: true,
        data: {
          cardDrawn: true,
          cardId: player?.drawnCardId ?? undefined,
        },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to draw card';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 3. Handle game:pass-turn
  socket.on(SOCKET_EVENTS.GAME_PASS_TURN, async (_payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();

      const { nextState } = await gameService.passTurn(guestId, roomCode);

      await handleGameStateBroadcasts(nextState, roomCode);

      callback({
        success: true,
        data: { passed: true },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to pass turn';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 4. Handle game:uno (call UNO)
  socket.on(SOCKET_EVENTS.GAME_UNO, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();
      const targetPlayerId = (payload as { targetPlayerId?: string } | undefined)?.targetPlayerId;

      const { nextState } = await gameService.callUno(guestId, roomCode, targetPlayerId);

      await handleGameStateBroadcasts(nextState, roomCode);

      callback({
        success: true,
        data: { declared: true },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to call UNO';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 5. Handle game:challenge-uno (catch missed UNO call)
  socket.on(SOCKET_EVENTS.GAME_CHALLENGE_UNO, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();
      const validated = await challengeUnoInputSchema.parseAsync(payload);

      const { nextState } = await gameService.challengeUno(
        guestId,
        roomCode,
        validated.targetPlayerId
      );

      await handleGameStateBroadcasts(nextState, roomCode);

      const penaltyCards = nextState.variant === 'uno_flip' ? 2 : 4;

      callback({
        success: true,
        data: { success: true, penaltyCards },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to challenge missed UNO';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 6. Handle game:challenge-wild-draw-four
  socket.on(SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_FOUR, async (_payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();

      const { nextState, events } = await gameService.challengeWildDrawFour(guestId, roomCode);

      await handleGameStateBroadcasts(nextState, roomCode);

      const won = events.some((e) => e.type === 'WILD_DRAW_FOUR_CHALLENGE_WON');

      callback({
        success: true,
        data: {
          challengeWon: won,
          penaltyCards: won ? 4 : 6,
        },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to challenge Wild Draw Four';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 7. Handle game:accept-wild-draw-four
  socket.on(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_FOUR, async (_payload, callback) => {
    const startTime = Date.now();
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();
      logger.info('Processing accept wild draw four', {
        action: 'ACCEPT_WILD_DRAW_FOUR_START',
        roomCode,
        guestId,
      });

      const { nextState } = await gameService.acceptWildDrawFour(guestId, roomCode);

      await handleGameStateBroadcasts(nextState, roomCode);

      const playerState = getPlayerGameState(nextState, guestId);
      const durationMs = Date.now() - startTime;
      logger.info('Wild draw four accepted successfully', {
        action: 'ACCEPT_WILD_DRAW_FOUR_COMPLETE',
        roomCode,
        guestId,
        durationMs,
        cardsDrawn: 4,
        nextPlayerIndex: nextState.currentPlayerIndex,
      });

      if (typeof callback === 'function') {
        callback({
          success: true,
          data: { accepted: true, cardsDrawn: 4, state: playerState },
        });
      }
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const message = (err as Error).message || 'Failed to accept Wild Draw Four';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      logger.warn('Failed to accept Wild Draw Four', {
        action: 'ACCEPT_WILD_DRAW_FOUR_FAILED',
        error: message,
        code,
        durationMs,
      });
      if (typeof callback === 'function') {
        callback({ success: false, error: { code, message } });
      }
    }
  });

  // 8. Handle game:challenge-wild-draw-two
  socket.on(SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_TWO, async (_payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();

      const { nextState, events } = await gameService.challengeWildDrawTwo(guestId, roomCode);

      await handleGameStateBroadcasts(nextState, roomCode);

      const won = events.some((e) => e.type === 'WILD_DRAW_TWO_CHALLENGE_WON');

      if (typeof callback === 'function') {
        callback({
          success: true,
          data: {
            challengeWon: won,
            penaltyCards: won ? 2 : 4,
          },
        });
      }
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to challenge Wild Draw Two';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      if (typeof callback === 'function') {
        callback({ success: false, error: { code, message } });
      }
    }
  });

  // 9. Handle game:accept-wild-draw-two
  socket.on(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_TWO, async (_payload, callback) => {
    const startTime = Date.now();
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();
      logger.info('Processing accept wild draw two', {
        action: 'ACCEPT_WILD_DRAW_TWO_START',
        roomCode,
        guestId,
      });

      const { nextState } = await gameService.acceptWildDrawTwo(guestId, roomCode);

      await handleGameStateBroadcasts(nextState, roomCode);

      const playerState = getPlayerGameState(nextState, guestId);
      const durationMs = Date.now() - startTime;
      logger.info('Wild draw two accepted successfully', {
        action: 'ACCEPT_WILD_DRAW_TWO_COMPLETE',
        roomCode,
        guestId,
        durationMs,
        cardsDrawn: 2,
        nextPlayerIndex: nextState.currentPlayerIndex,
      });

      if (typeof callback === 'function') {
        callback({
          success: true,
          data: { accepted: true, cardsDrawn: 2, state: playerState },
        });
      }
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const message = (err as Error).message || 'Failed to accept Wild Draw Two';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      logger.warn('Failed to accept Wild Draw Two', {
        action: 'ACCEPT_WILD_DRAW_TWO_FAILED',
        error: message,
        code,
        durationMs,
      });
      if (typeof callback === 'function') {
        callback({ success: false, error: { code, message } });
      }
    }
  });

  // 10. Handle game:challenge-wild-draw-color
  socket.on(SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_COLOR, async (_payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();

      const { nextState, events } = await gameService.challengeWildDrawColor(guestId, roomCode);

      await handleGameStateBroadcasts(nextState, roomCode);

      const won = events.some((e) => e.type === 'WILD_DRAW_COLOR_CHALLENGE_WON');
      const challengeEvent = events.find(
        (e) => e.type === 'WILD_DRAW_COLOR_CHALLENGE_WON' || e.type === 'WILD_DRAW_COLOR_CHALLENGE_LOST'
      );
      const payload = challengeEvent?.payload as Record<string, unknown> | undefined;
      const penaltyCards =
        typeof payload?.penaltyCardsDrawn === 'number'
          ? payload.penaltyCardsDrawn
          : won
          ? 0
          : 2;

      callback({
        success: true,
        data: {
          challengeWon: won,
          penaltyCards,
        },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to challenge Wild Draw Color';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 11. Handle game:accept-wild-draw-color
  socket.on(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_COLOR, async (_payload, callback) => {
    const startTime = Date.now();
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();
      logger.info('Processing accept wild draw color', {
        action: 'ACCEPT_WILD_DRAW_COLOR_START',
        roomCode,
        guestId,
      });

      const { nextState, events } = await gameService.acceptWildDrawColor(guestId, roomCode);

      await handleGameStateBroadcasts(nextState, roomCode);

      const acceptEvent = events.find((e) => e.type === 'WILD_DRAW_COLOR_ACCEPTED');
      const acceptPayload = acceptEvent?.payload as Record<string, unknown> | undefined;
      const cardsDrawn =
        typeof acceptPayload?.cardsDrawn === 'number'
          ? acceptPayload.cardsDrawn
          : 0;

      const playerState = getPlayerGameState(nextState, guestId);
      const durationMs = Date.now() - startTime;
      logger.info('Wild draw color accepted successfully', {
        action: 'ACCEPT_WILD_DRAW_COLOR_COMPLETE',
        roomCode,
        guestId,
        durationMs,
        cardsDrawn,
        nextPlayerIndex: nextState.currentPlayerIndex,
      });

      if (typeof callback === 'function') {
        callback({
          success: true,
          data: { accepted: true, cardsDrawn, state: playerState },
        });
      }
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const message = (err as Error).message || 'Failed to accept Wild Draw Color';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      logger.warn('Failed to accept Wild Draw Color', {
        action: 'ACCEPT_WILD_DRAW_COLOR_FAILED',
        error: message,
        code,
        durationMs,
      });
      if (typeof callback === 'function') {
        callback({ success: false, error: { code, message } });
      }
    }
  });

  // 12. Handle game:choose-starting-wild-color & game:choose-color
  const handleChooseStartingWildColor = async (
    payload: { chosenColor: CardColor },
    callback: (response: {
      success: boolean;
      data?: { success: boolean; chosenColor?: CardColor };
      error?: { code: string; message: string };
    }) => void
  ) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();

      const { nextState } = await gameService.chooseStartingWildColor(guestId, roomCode, payload.chosenColor);

      await handleGameStateBroadcasts(nextState, roomCode);

      callback({
        success: true,
        data: { success: true, chosenColor: payload.chosenColor },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to choose starting color';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  };

  socket.on(SOCKET_EVENTS.GAME_CHOOSE_STARTING_WILD_COLOR, handleChooseStartingWildColor);
  socket.on(SOCKET_EVENTS.GAME_CHOOSE_COLOR, handleChooseStartingWildColor);

  // 14. Handle game:choose-7s-swap
  socket.on(SOCKET_EVENTS.GAME_CHOOSE_7S_SWAP, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();
      const validated = await choose7sSwapInputSchema.parseAsync(payload);

      const { nextState } = await gameService.choose7sSwapTarget(
        guestId,
        roomCode,
        validated.targetPlayerId
      );

      await handleGameStateBroadcasts(nextState, roomCode);

      callback({
        success: true,
        data: { success: true, targetPlayerId: validated.targetPlayerId },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to select 7s swap target';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 15. Handle game:choose-roulette-color
  socket.on(SOCKET_EVENTS.GAME_CHOOSE_ROULETTE_COLOR, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();
      const validated = await chooseRouletteColorInputSchema.parseAsync(payload);

      const { nextState, events } = await gameService.chooseColorRouletteColor(
        guestId,
        roomCode,
        validated.chosenColor
      );

      const elim = events.find((e) => e.type === 'PLAYER_ELIMINATED');
      if (elim) {
        const pElim = elim.payload as { playerId: string; cardCount: number; eliminationOrder: number };
        const elimPlayer = nextState.players.find((p) => p.id === pElim.playerId);
        const remaining = nextState.players.filter((p) => !p.isEliminated).length;
        io.to(roomCode).emit(SOCKET_EVENTS.GAME_PLAYER_ELIMINATED, {
          guestId: pElim.playerId,
          username: elimPlayer?.username ?? 'Player',
          cardCount: pElim.cardCount,
          remainingPlayerCount: remaining,
        });
      }

      await handleGameStateBroadcasts(nextState, roomCode);

      const resEvent = events.find((e) => e.type === 'ROULETTE_RESOLVED');
      const cardsRevealed = (resEvent?.payload?.drawnCount as number) ?? 0;
      const victimPlayer = nextState.players.find((p) => p.id === guestId);
      const eliminated = !!victimPlayer?.isEliminated;

      callback({
        success: true,
        data: { success: true, cardsRevealed, eliminated },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to resolve Color Roulette';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 16. Handle game:accept-stack-penalty
  socket.on(SOCKET_EVENTS.GAME_ACCEPT_STACK_PENALTY, async (payload, callback) => {
    const startTime = Date.now();
    try {
      await acceptStackPenaltyInputSchema.parseAsync(payload);
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();
      logger.info('Processing accept stack penalty', {
        action: 'ACCEPT_STACK_PENALTY_START',
        roomCode,
        guestId,
      });

      const { nextState, events } = await gameService.acceptStackPenalty(guestId, roomCode);

      const elim = events.find((e) => e.type === 'PLAYER_ELIMINATED');
      if (elim) {
        const pElim = elim.payload as { playerId: string; cardCount: number; eliminationOrder: number };
        const elimPlayer = nextState.players.find((p) => p.id === pElim.playerId);
        const remaining = nextState.players.filter((p) => !p.isEliminated).length;
        io.to(roomCode).emit(SOCKET_EVENTS.GAME_PLAYER_ELIMINATED, {
          guestId: pElim.playerId,
          username: elimPlayer?.username ?? 'Player',
          cardCount: pElim.cardCount,
          remainingPlayerCount: remaining,
        });
      }

      await handleGameStateBroadcasts(nextState, roomCode);

      const resEvent = events.find((e) => e.type === 'STACK_PENALTY_RESOLVED');
      const drawnCount = (resEvent?.payload?.drawnCount as number) ?? 0;
      const targetPlayer = nextState.players.find((p) => p.id === guestId);
      const eliminated = !!targetPlayer?.isEliminated;

      const playerState = getPlayerGameState(nextState, guestId);
      const durationMs = Date.now() - startTime;
      logger.info('Stack penalty accepted successfully', {
        action: 'ACCEPT_STACK_PENALTY_COMPLETE',
        roomCode,
        guestId,
        durationMs,
        cardsDrawn: drawnCount,
        eliminated,
        nextPlayerIndex: nextState.currentPlayerIndex,
      });

      if (typeof callback === 'function') {
        callback({
          success: true,
          data: { success: true, cardsDrawn: drawnCount, eliminated, state: playerState },
        });
      }
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const message = (err as Error).message || 'Failed to accept stack penalty';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      logger.warn('Failed to accept stack penalty', {
        action: 'ACCEPT_STACK_PENALTY_FAILED',
        error: message,
        code,
        durationMs,
      });
      if (typeof callback === 'function') {
        callback({ success: false, error: { code, message } });
      }
    }
  });

  // 17. Handle game:choose-targeted-draw-two
  socket.on(SOCKET_EVENTS.GAME_CHOOSE_TARGETED_DRAW_TWO, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();
      const validated = await chooseTargetedDrawTwoInputSchema.parseAsync(payload);

      const { nextState } = await gameService.chooseTargetedDrawTwoTarget(
        guestId,
        roomCode,
        validated.targetPlayerId
      );

      await handleGameStateBroadcasts(nextState, roomCode);

      callback({
        success: true,
        data: { success: true, targetPlayerId: validated.targetPlayerId },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to choose Targeted Draw Two target';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 17b. Handle game:choose-targeted-draw-four
  socket.on(SOCKET_EVENTS.GAME_CHOOSE_TARGETED_DRAW_FOUR, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();
      const validated = await chooseTargetedDrawFourInputSchema.parseAsync(payload);

      const { nextState } = await gameService.chooseTargetedDrawFourTarget(
        guestId,
        roomCode,
        validated.targetPlayerId
      );

      await handleGameStateBroadcasts(nextState, roomCode);

      callback({
        success: true,
        data: { success: true, targetPlayerId: validated.targetPlayerId },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to choose Targeted Draw Four target';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 18. Handle game:choose-forced-swap
  socket.on(SOCKET_EVENTS.GAME_CHOOSE_FORCED_SWAP, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();
      const validated = await chooseForcedSwapInputSchema.parseAsync(payload);

      const { nextState } = await gameService.chooseForcedSwapTarget(
        guestId,
        roomCode,
        validated.targetPlayerId
      );

      await handleGameStateBroadcasts(nextState, roomCode);

      callback({
        success: true,
        data: { success: true, targetPlayerId: validated.targetPlayerId },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to choose Forced Swap target';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 19. Handle game:team-initial-pass
  socket.on(SOCKET_EVENTS.GAME_TEAM_INITIAL_PASS, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();
      const validated = await teamInitialPassInputSchema.parseAsync(payload);

      const { nextState } = await gameService.teamInitialPass(
        guestId,
        roomCode,
        validated.cardId
      );

      await handleGameStateBroadcasts(nextState, roomCode);

      const allPassed = !nextState.pendingActionState;
      callback({
        success: true,
        data: { success: true, allPassed },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to submit initial team pass';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 20. Handle game:team-card-pass
  socket.on(SOCKET_EVENTS.GAME_TEAM_CARD_PASS, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();
      const validated = await teamCardPassInputSchema.parseAsync(payload);

      const { nextState } = await gameService.teamCardPass(
        guestId,
        roomCode,
        validated.cardId
      );

      await handleGameStateBroadcasts(nextState, roomCode);

      const allPassed = !nextState.pendingActionState;
      callback({
        success: true,
        data: { success: true, allPassed },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to submit team card pass';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 21. Handle game:team-split-hand-pass
  socket.on(SOCKET_EVENTS.GAME_TEAM_SPLIT_HAND_PASS, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();
      const validated = await teamSplitHandPassInputSchema.parseAsync(payload);

      const { nextState } = await gameService.teamSplitHandPass(
        guestId,
        roomCode,
        validated.cardIds
      );

      await handleGameStateBroadcasts(nextState, roomCode);

      callback({
        success: true,
        data: { success: true, cardsPassed: validated.cardIds.length },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to submit team split hand pass';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 22. Handle game:choose-attack-target
  socket.on(SOCKET_EVENTS.GAME_CHOOSE_ATTACK_TARGET, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();
      const validated = await chooseAttackTargetInputSchema.parseAsync(payload);

      const { nextState } = await gameService.chooseAttackTarget(
        guestId,
        roomCode,
        validated.targetPlayerId,
        validated.chosenColor as CardColor | undefined
      );

      await handleGameStateBroadcasts(nextState, roomCode);

      callback({
        success: true,
        data: {
          success: true,
          roundOver: nextState.status === 'ROUND_OVER',
          matchOver: nextState.status === 'COMPLETED',
        },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to choose attack target';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 23. Handle game:next-round
  socket.on(SOCKET_EVENTS.GAME_NEXT_ROUND, async (_payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();

      const { nextState } = await gameService.startNextRound(guestId, roomCode);

      await handleGameStateBroadcasts(nextState, roomCode);

      callback({
        success: true,
        data: { started: true },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to start next round';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });
}
