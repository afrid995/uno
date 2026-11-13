import { Server, Socket } from 'socket.io';
import {
  SOCKET_EVENTS,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  playCardInputSchema,
  challengeUnoInputSchema,
} from '@uno-ultimate/game-protocol';
import { ERROR_CODES } from '@uno-ultimate/shared';
import { AppError } from '../../middleware/errorHandler';
import { HTTP_STATUS } from '@uno-ultimate/shared';
import { gameService } from './game.service';
import { gameStatePublisher } from './game.state.publisher';
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

  const getActiveRoomCode = (): string => {
    const roomCode = socket.data.currentRoomCode;
    if (!roomCode) {
      throw new AppError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.NOT_IN_ROOM, 'Not currently in a game room');
    }
    return roomCode;
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
        validated.chosenColor
      );

      // Publish personalized projections to all participants
      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      if (nextState.status === 'ROUND_OVER') {
        gameStatePublisher.broadcastRoundFinished(io, roomCode, nextState);
      } else if (nextState.status === 'COMPLETED') {
        gameStatePublisher.broadcastMatchFinished(io, roomCode, nextState);
      }

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

      const { nextState } = await gameService.drawCard(guestId, roomCode);

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

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

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

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
  socket.on(SOCKET_EVENTS.GAME_UNO, async (_payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();

      const { nextState } = await gameService.callUno(guestId, roomCode);

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

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

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

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

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      if (nextState.status === 'ROUND_OVER') {
        gameStatePublisher.broadcastRoundFinished(io, roomCode, nextState);
      } else if (nextState.status === 'COMPLETED') {
        gameStatePublisher.broadcastMatchFinished(io, roomCode, nextState);
      }

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
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();

      const { nextState } = await gameService.acceptWildDrawFour(guestId, roomCode);

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      if (nextState.status === 'ROUND_OVER') {
        gameStatePublisher.broadcastRoundFinished(io, roomCode, nextState);
      } else if (nextState.status === 'COMPLETED') {
        gameStatePublisher.broadcastMatchFinished(io, roomCode, nextState);
      }

      callback({
        success: true,
        data: { accepted: true, cardsDrawn: 4 },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to accept Wild Draw Four';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 8. Handle game:challenge-wild-draw-two
  socket.on(SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_TWO, async (_payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();

      const { nextState, events } = await gameService.challengeWildDrawTwo(guestId, roomCode);

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      if (nextState.status === 'ROUND_OVER') {
        gameStatePublisher.broadcastRoundFinished(io, roomCode, nextState);
      } else if (nextState.status === 'COMPLETED') {
        gameStatePublisher.broadcastMatchFinished(io, roomCode, nextState);
      }

      const won = events.some((e) => e.type === 'WILD_DRAW_TWO_CHALLENGE_WON');

      callback({
        success: true,
        data: {
          challengeWon: won,
          penaltyCards: won ? 2 : 4,
        },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to challenge Wild Draw Two';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 9. Handle game:accept-wild-draw-two
  socket.on(SOCKET_EVENTS.GAME_ACCEPT_WILD_DRAW_TWO, async (_payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();

      const { nextState } = await gameService.acceptWildDrawTwo(guestId, roomCode);

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      if (nextState.status === 'ROUND_OVER') {
        gameStatePublisher.broadcastRoundFinished(io, roomCode, nextState);
      } else if (nextState.status === 'COMPLETED') {
        gameStatePublisher.broadcastMatchFinished(io, roomCode, nextState);
      }

      callback({
        success: true,
        data: { accepted: true, cardsDrawn: 2 },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to accept Wild Draw Two';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 10. Handle game:challenge-wild-draw-color
  socket.on(SOCKET_EVENTS.GAME_CHALLENGE_WILD_DRAW_COLOR, async (_payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();

      const { nextState, events } = await gameService.challengeWildDrawColor(guestId, roomCode);

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      if (nextState.status === 'ROUND_OVER') {
        gameStatePublisher.broadcastRoundFinished(io, roomCode, nextState);
      } else if (nextState.status === 'COMPLETED') {
        gameStatePublisher.broadcastMatchFinished(io, roomCode, nextState);
      }

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
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();

      const { nextState, events } = await gameService.acceptWildDrawColor(guestId, roomCode);

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      if (nextState.status === 'ROUND_OVER') {
        gameStatePublisher.broadcastRoundFinished(io, roomCode, nextState);
      } else if (nextState.status === 'COMPLETED') {
        gameStatePublisher.broadcastMatchFinished(io, roomCode, nextState);
      }

      const acceptEvent = events.find((e) => e.type === 'WILD_DRAW_COLOR_ACCEPTED');
      const acceptPayload = acceptEvent?.payload as Record<string, unknown> | undefined;
      const cardsDrawn =
        typeof acceptPayload?.cardsDrawn === 'number'
          ? acceptPayload.cardsDrawn
          : 0;

      callback({
        success: true,
        data: { accepted: true, cardsDrawn },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to accept Wild Draw Color';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
    }
  });

  // 12. Handle game:next-round
  socket.on(SOCKET_EVENTS.GAME_NEXT_ROUND, async (_payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();

      const { nextState } = await gameService.startNextRound(guestId, roomCode);

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

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
