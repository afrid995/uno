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
  CardColor,
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
        validated.chosenColor,
        validated.playMode,
        validated.targetPlayerId
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

      const { nextState, events } = await gameService.drawCard(guestId, roomCode);

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

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

      if (nextState.status === 'ROUND_OVER') {
        gameStatePublisher.broadcastRoundFinished(io, roomCode, nextState);
      } else if (nextState.status === 'COMPLETED') {
        gameStatePublisher.broadcastMatchFinished(io, roomCode, nextState);
      }

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

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

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

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

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

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

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

      if (nextState.status === 'ROUND_OVER') {
        gameStatePublisher.broadcastRoundFinished(io, roomCode, nextState);
      } else if (nextState.status === 'COMPLETED') {
        gameStatePublisher.broadcastMatchFinished(io, roomCode, nextState);
      }

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
    try {
      await acceptStackPenaltyInputSchema.parseAsync(payload);
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();

      const { nextState, events } = await gameService.acceptStackPenalty(guestId, roomCode);

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

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

      if (nextState.status === 'ROUND_OVER') {
        gameStatePublisher.broadcastRoundFinished(io, roomCode, nextState);
      } else if (nextState.status === 'COMPLETED') {
        gameStatePublisher.broadcastMatchFinished(io, roomCode, nextState);
      }

      const resEvent = events.find((e) => e.type === 'STACK_PENALTY_RESOLVED');
      const drawnCount = (resEvent?.payload?.drawnCount as number) ?? 0;
      const targetPlayer = nextState.players.find((p) => p.id === guestId);
      const eliminated = !!targetPlayer?.isEliminated;

      callback({
        success: true,
        data: { success: true, cardsDrawn: drawnCount, eliminated },
      });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to accept stack penalty';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      callback({ success: false, error: { code, message } });
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

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      if (nextState.status === 'ROUND_OVER') {
        gameStatePublisher.broadcastRoundFinished(io, roomCode, nextState);
      } else if (nextState.status === 'COMPLETED') {
        gameStatePublisher.broadcastMatchFinished(io, roomCode, nextState);
      }

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

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      if (nextState.status === 'ROUND_OVER') {
        gameStatePublisher.broadcastRoundFinished(io, roomCode, nextState);
      } else if (nextState.status === 'COMPLETED') {
        gameStatePublisher.broadcastMatchFinished(io, roomCode, nextState);
      }

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

      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      if (nextState.status === 'ROUND_OVER') {
        gameStatePublisher.broadcastRoundFinished(io, roomCode, nextState);
      } else if (nextState.status === 'COMPLETED') {
        gameStatePublisher.broadcastMatchFinished(io, roomCode, nextState);
      }

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

  // 19. Handle game:next-round
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
