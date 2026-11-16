import { Server, Socket } from 'socket.io';
import {
  SOCKET_EVENTS,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@uno-ultimate/game-protocol';
import {
  createRoomSchema,
  joinRoomSchema,
  readyStatusSchema,
  updateRoomSettingsSchema,
  ERROR_CODES,
  JoinRoomInput,
  RoomPublicDto,
} from '@uno-ultimate/shared';
import { SocketAck } from '@uno-ultimate/game-protocol';
import { AppError } from '../middleware/errorHandler';
import { HTTP_STATUS } from '@uno-ultimate/shared';
import { roomService } from '../modules/room/room.service';
import { gameService } from '../modules/game/game.service';
import { gameSessionManager } from '../modules/game/game.session.manager';
import { gameStatePublisher } from '../modules/game/game.state.publisher';
import { logger } from '../utils/logger';

export type UnoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type UnoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// Track active sockets per guest to prevent duplicate connections and handle replacement
export const guestSockets = new Map<string, UnoSocket>();

// Configurable countdown duration (default 5000ms for production)
export const PRODUCTION_COUNTDOWN_MS = 5000;
let configuredCountdownMs = PRODUCTION_COUNTDOWN_MS;

export function setCountdownDurationForTesting(ms: number): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Countdown duration can only be modified in test environment');
  }
  configuredCountdownMs = ms;
}

export function resetCountdownDurationForTesting(): void {
  configuredCountdownMs = PRODUCTION_COUNTDOWN_MS;
}

// Track active countdown timers per room for cancellation handling
export const activeCountdownTimers = new Map<string, NodeJS.Timeout>();

export function cancelAllCountdownTimersForTesting(): void {
  for (const timer of activeCountdownTimers.values()) {
    clearTimeout(timer);
  }
  activeCountdownTimers.clear();
  resetCountdownDurationForTesting();
  roomService.shutdown();
}

export async function registerAuthenticatedGuestSocket(
  io: UnoServer,
  socket: UnoSocket,
  guestId: string
): Promise<void> {
  const existingSocket = guestSockets.get(guestId);
  if (existingSocket && existingSocket.id !== socket.id) {
    logger.info('Replacing previous socket for guest', {
      guestId,
      oldSocketId: existingSocket.id,
      newSocketId: socket.id,
    });
    existingSocket.emit(SOCKET_EVENTS.ROOM_ERROR, {
      code: 'SESSION_REPLACED',
      message: 'Your session has connected in another tab or device.',
    });
    existingSocket.disconnect(true);
  }
  guestSockets.set(guestId, socket);

  try {
    const activeRoom = await roomService.restoreConnection(guestId);
    if (activeRoom) {
      socket.data.currentRoomCode = activeRoom.roomCode;
      socket.join(activeRoom.roomCode);
      io.to(activeRoom.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, { room: activeRoom });
      logger.info('Restored player connection in room on socket auth/reconnect', {
        guestId,
        roomCode: activeRoom.roomCode,
      });

      // If room is IN_GAME, also deliver active player game state and broadcast reconnected event
      if (activeRoom.status === 'IN_GAME') {
        io.to(activeRoom.roomCode).emit(SOCKET_EVENTS.GAME_PLAYER_RECONNECTED, {
          guestId,
          username: socket.data.username || 'Player',
        });
        const playerState = gameService.getActivePlayerState(guestId, activeRoom.roomCode);
        if (playerState) {
          socket.emit(SOCKET_EVENTS.GAME_STATE, { state: playerState });
        }
      }
    }
  } catch (err) {
    logger.warn('Failed to restore connection for authenticated socket', {
      guestId,
      error: String(err),
    });
  }
}

export function registerRoomHandlers(io: UnoServer, socket: UnoSocket): void {
  const cancelCountdownIfActive = (roomCode: string, reason?: string) => {
    const timer = activeCountdownTimers.get(roomCode);
    if (timer) {
      clearTimeout(timer);
      activeCountdownTimers.delete(roomCode);
      logger.info('Match start countdown cancelled', { roomCode, reason });
      io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STARTING, {
        countdownSeconds: 0,
        version: -1,
      });
    }
  };

  const getAuthenticatedGuestId = (): string => {
    if (!socket.data.isAuthenticated || !socket.data.guestId) {
      throw new AppError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Authentication required');
    }
    return socket.data.guestId;
  };

  // Register socket in active guest map
  if (socket.data.guestId) {
    registerAuthenticatedGuestSocket(io, socket, socket.data.guestId);
  }

  // Handle room:create
  socket.on(SOCKET_EVENTS.ROOM_CREATE, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const validated = await createRoomSchema.parseAsync(payload || {});

      const room = await roomService.createRoom(guestId, validated.maxPlayers, validated.settings);

      // Leave old socket room if any
      if (socket.data.currentRoomCode) {
        socket.leave(socket.data.currentRoomCode);
      }

      socket.data.currentRoomCode = room.roomCode;
      socket.join(room.roomCode);

      socket.emit(SOCKET_EVENTS.ROOM_CREATED, { room });
      callback({ success: true, data: room });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to create room';
      const code = (err as { code?: string }).code || ERROR_CODES.INTERNAL_ERROR;
      logger.warn('Room create error', { error: message, code });
      callback({ success: false, error: { code, message } });
    }
  });

  // Handle room:join & room:join-link
  const handleJoin = async (
    payload: JoinRoomInput,
    callback: (res: SocketAck<RoomPublicDto>) => void
  ) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const validated = await joinRoomSchema.parseAsync(payload);

      const { room, isNewJoin } = await roomService.joinRoom(guestId, validated.roomCode);

      // Leave previous socket room if switching
      if (socket.data.currentRoomCode && socket.data.currentRoomCode !== room.roomCode) {
        socket.leave(socket.data.currentRoomCode);
      }

      socket.data.currentRoomCode = room.roomCode;
      socket.join(room.roomCode);

      socket.emit(SOCKET_EVENTS.ROOM_JOINED, { room });

      if (isNewJoin) {
        const newPlayer = room.members.find((m) => m.guestId === guestId);
        if (newPlayer) {
          socket.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_PLAYER_JOINED, {
            player: newPlayer,
            version: room.version,
          });
        }
      }

      // Broadcast updated room state to all members
      io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, { room });

      // If room is IN_GAME, deliver active player state
      if (room.status === 'IN_GAME') {
        const playerState = gameService.getActivePlayerState(guestId, room.roomCode);
        if (playerState) {
          socket.emit(SOCKET_EVENTS.GAME_STATE, { state: playerState });
        }
      }

      callback({ success: true, data: room });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to join room';
      const code = (err as { code?: string }).code || ERROR_CODES.INTERNAL_ERROR;
      logger.warn('Room join error', { error: message, code });
      callback({ success: false, error: { code, message } });
    }
  };

  socket.on(SOCKET_EVENTS.ROOM_JOIN, handleJoin);
  socket.on(SOCKET_EVENTS.ROOM_JOIN_LINK, handleJoin);

  // Handle room:resume
  socket.on(SOCKET_EVENTS.ROOM_RESUME, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const validated = await joinRoomSchema.parseAsync(payload);

      const room = await roomService.getRoomByCode(validated.roomCode);
      if (!room) {
        callback({ success: false, error: { code: ERROR_CODES.ROOM_NOT_FOUND, message: 'Room not found.' } });
        return;
      }

      const isMember = room.members.some((m) => m.guestId === guestId);
      if (!isMember) {
        callback({ success: false, error: { code: ERROR_CODES.NOT_IN_ROOM, message: 'You are not a member of this room.' } });
        return;
      }

      socket.data.currentRoomCode = room.roomCode;
      socket.join(room.roomCode);

      // If room is IN_GAME, restore player state (with durable crash/restart recovery)
      if (room.status === 'IN_GAME') {
        const playerState = await gameService.getOrRecoverPlayerState(guestId, room.id, room.roomCode);
        if (playerState) {
          socket.emit(SOCKET_EVENTS.GAME_STATE, { state: playerState });
        }
      }

      io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, { room });
      callback({ success: true, data: room });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to resume room';
      const code = (err as { code?: string }).code || ERROR_CODES.INTERNAL_ERROR;
      callback({ success: false, error: { code, message } });
    }
  });

  // Handle room:leave
  socket.on(SOCKET_EVENTS.ROOM_LEAVE, async (_payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = socket.data.currentRoomCode || gameSessionManager.getRoomCodeForGuest(guestId);

      if (!roomCode) {
        callback({ success: true, data: { left: true } });
        return;
      }

      cancelCountdownIfActive(roomCode, 'Player left room');

      // 1. Process game departure immediately if game is active
      try {
        await gameService.handlePlayerDeparture(io, guestId, roomCode, 'INTENTIONAL_LEAVE', guestSockets);
      } catch (gameErr) {
        logger.warn('Error handling game player departure on leave room', {
          guestId,
          roomCode,
          error: String(gameErr),
        });
      }

      const result = await roomService.leaveRoom(guestId, roomCode);

      socket.leave(roomCode);
      socket.data.currentRoomCode = undefined;

      if (result.roomDeleted) {
        gameSessionManager.removeSessionByRoomCode(roomCode);
        io.to(roomCode).emit(SOCKET_EVENTS.ROOM_CLOSED, { reason: 'Host closed or all members left.' });
      } else if (result.room) {
        io.to(roomCode).emit(SOCKET_EVENTS.ROOM_PLAYER_LEFT, {
          guestId,
          newHostGuestId: result.newHostGuestId,
          version: result.room.version,
        });

        if (result.newHostGuestId) {
          io.to(roomCode).emit(SOCKET_EVENTS.ROOM_HOST_CHANGED, {
            newHostGuestId: result.newHostGuestId,
            version: result.room.version,
          });
        }

        io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, { room: result.room });
      }

      callback({ success: true, data: { left: true } });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to leave room';
      const code = (err as { code?: string }).code || ERROR_CODES.INTERNAL_ERROR;
      callback({ success: false, error: { code, message } });
    }
  });

  // Handle room:ready
  socket.on(SOCKET_EVENTS.ROOM_READY, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const validated = await readyStatusSchema.parseAsync(payload);

      const room = await roomService.setReadyStatus(guestId, validated.isReady);

      if (!validated.isReady) {
        cancelCountdownIfActive(room.roomCode, 'Player toggled unready');
      }

      io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_PLAYER_READY, {
        guestId,
        isReady: validated.isReady,
        version: room.version,
      });
      io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, { room });

      callback({ success: true, data: { readyStatus: validated.isReady } });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to set ready status';
      const code = (err as { code?: string }).code || ERROR_CODES.INTERNAL_ERROR;
      callback({ success: false, error: { code, message } });
    }
  });

  // Handle room:update-settings
  socket.on(SOCKET_EVENTS.ROOM_UPDATE_SETTINGS, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const validated = await updateRoomSettingsSchema.parseAsync(payload);

      const room = await roomService.updateSettings(guestId, validated.settings);

      io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, { room });
      callback({ success: true, data: room.settings });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to update settings';
      const code = (err as { code?: string }).code || ERROR_CODES.INTERNAL_ERROR;
      callback({ success: false, error: { code, message } });
    }
  });

  // Handle room:start
  socket.on(SOCKET_EVENTS.ROOM_START, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = socket.data.currentRoomCode;
      if (!roomCode) {
        callback({ success: false, error: { code: ERROR_CODES.NOT_IN_ROOM, message: 'Not in a room.' } });
        return;
      }

      const room = await roomService.getRoomByCode(roomCode);
      if (!room) {
        callback({ success: false, error: { code: ERROR_CODES.ROOM_NOT_FOUND, message: 'Room not found.' } });
        return;
      }

      if (room.hostGuestId !== guestId) {
        callback({
          success: false,
          error: { code: ERROR_CODES.HOST_ONLY_ACTION, message: 'Only the host can start the game.' },
        });
        return;
      }

      const variant = ((room.settings as Record<string, unknown>)?.variant as string) || 'classic';
      if (variant === 'uno_show_em_no_mercy') {
        if (room.members.length < 2 || room.members.length > 6) {
          callback({
            success: false,
            error: {
              code: ERROR_CODES.BAD_REQUEST,
              message: 'UNO Show \'em No Mercy requires between 2 and 6 players to start.',
            },
          });
          return;
        }
      } else {
        if (room.members.length < 2 || room.members.length > 10) {
          callback({
            success: false,
            error: { code: ERROR_CODES.NOT_ENOUGH_PLAYERS, message: 'At least 2 players are required to play.' },
          });
          return;
        }
      }

      // Check if non-host players are ready
      const nonHostMembers = room.members.filter((m) => m.guestId !== guestId);
      const allReady = nonHostMembers.every((m) => m.readyStatus);
      if (!allReady) {
        callback({
          success: false,
          error: { code: ERROR_CODES.PLAYERS_NOT_READY, message: 'All players must be ready before starting.' },
        });
        return;
      }

      // Cancel any active countdown for this room first
      cancelCountdownIfActive(room.roomCode, 'New countdown initiated');

      // Broadcast room:starting with 5-second countdown notification
      io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STARTING, {
        countdownSeconds: 5,
        version: room.version,
      });

      callback({ success: true, data: { starting: true } });

      // Start match after countdown (immediate bypass is strictly restricted to test environment)
      const isTestEnv = process.env.NODE_ENV === 'test';
      const allowImmediate = isTestEnv && (payload as { immediate?: boolean })?.immediate === true;
      const countdownMs = allowImmediate ? 0 : configuredCountdownMs;
      const timer = setTimeout(async () => {
        activeCountdownTimers.delete(room.roomCode);
        try {
          const currentRoom = await roomService.getRoomByCode(room.roomCode);
          if (!currentRoom || currentRoom.members.length < 2 || currentRoom.status === 'IN_GAME') {
            return;
          }

          // Verify non-host members are still all ready
          const nonHostMembers = currentRoom.members.filter((m) => m.guestId !== currentRoom.hostGuestId);
          const allReady = nonHostMembers.every((m) => m.readyStatus);
          if (!allReady) {
            logger.info('Aborting match start: not all non-host players are ready', { roomCode: room.roomCode });
            return;
          }

          // Transition room status to IN_GAME
          const updatedRoom = await roomService.updateRoomStatus(currentRoom.id, 'IN_GAME');

          // Initialize Match and GameState
          const roomSettings = (currentRoom.settings as Record<string, unknown>) || {};
          const variant = (roomSettings.variant as string) || 'classic';
          const gameState = await gameService.startMatch(
            currentRoom.id,
            currentRoom.roomCode,
            currentRoom.hostGuestId,
            currentRoom.members.map((m) => ({ guestId: m.guestId, username: m.username })),
            variant,
            roomSettings
          );

          // Broadcast game:started
          io.to(currentRoom.roomCode).emit(SOCKET_EVENTS.GAME_STARTED, {
            matchId: gameState.id,
            roomCode: currentRoom.roomCode,
            roundNumber: gameState.roundNumber,
          });

          // Sync room state with status: IN_GAME
          io.to(currentRoom.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, { room: updatedRoom });

          // Publish personalized states to all participants
          gameStatePublisher.publishToAllParticipants(gameState, guestSockets);
        } catch (err: unknown) {
          logger.error('Failed to initialize match after countdown', { error: String(err), roomCode: room.roomCode });
        }
      }, countdownMs);

      if (countdownMs > 0) {
        activeCountdownTimers.set(room.roomCode, timer);
      }
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to start game';
      const code = (err as { code?: string }).code || ERROR_CODES.INTERNAL_ERROR;
      callback({ success: false, error: { code, message } });
    }
  });

  // Handle socket disconnect with 30s grace period
  socket.on('disconnect', async () => {
    try {
      const guestId = socket.data.guestId;
      if (guestId) {
        if (guestSockets.get(guestId)?.id === socket.id) {
          guestSockets.delete(guestId);
        }

        const roomCode = socket.data.currentRoomCode || gameSessionManager.getRoomCodeForGuest(guestId);

        if (roomCode) {
          cancelCountdownIfActive(roomCode, 'Player disconnected during countdown');

          io.to(roomCode).emit(SOCKET_EVENTS.GAME_PLAYER_DISCONNECTED, {
            guestId,
            username: socket.data.username || 'Player',
            disconnectTimestamp: Date.now(),
            gracePeriodSeconds: Math.round(roomService.getReconnectGracePeriodMs() / 1000),
          });
        }

        await roomService.markDisconnected(guestId, {
          onGracePeriodExpired: async (expiredGuestId, expiredRoomCode, result) => {
            try {
              await gameService.handlePlayerDeparture(io, expiredGuestId, expiredRoomCode, 'DISCONNECT_TIMEOUT', guestSockets);
            } catch (err) {
              logger.error('Error handling game player departure on disconnect timeout', {
                guestId: expiredGuestId,
                roomCode: expiredRoomCode,
                error: String(err),
              });
            }

            if (result.roomDeleted) {
              gameSessionManager.removeSessionByRoomCode(expiredRoomCode);
              io.to(expiredRoomCode).emit(SOCKET_EVENTS.ROOM_CLOSED, {
                reason: 'Room closed after disconnected members departed.',
              });
            } else if (result.room) {
              if (result.newHostGuestId) {
                io.to(expiredRoomCode).emit(SOCKET_EVENTS.ROOM_HOST_CHANGED, {
                  newHostGuestId: result.newHostGuestId,
                  version: result.room.version,
                });
              }
              io.to(expiredRoomCode).emit(SOCKET_EVENTS.ROOM_PLAYER_LEFT, {
                guestId: expiredGuestId,
                newHostGuestId: result.newHostGuestId,
                version: result.room.version,
              });
              io.to(expiredRoomCode).emit(SOCKET_EVENTS.ROOM_STATE, { room: result.room });
            }
          },
        });

        // Broadcast disconnected status to room immediately
        if (roomCode) {
          const room = await roomService.getRoomByCode(roomCode);
          if (room) {
            io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, { room });
          }
        }
      }
    } catch (err) {
      logger.warn('Error handling socket disconnect event', { error: String(err) });
    }
  });
}
