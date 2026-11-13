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
import { logger } from '../utils/logger';

type UnoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type UnoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// Track active sockets per guest to prevent duplicate connections and handle replacement
const guestSockets = new Map<string, UnoSocket>();

export function registerRoomHandlers(io: UnoServer, socket: UnoSocket): void {
  const getAuthenticatedGuestId = (): string => {
    if (!socket.data.isAuthenticated || !socket.data.guestId) {
      throw new AppError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Authentication required');
    }
    return socket.data.guestId;
  };

  // Register socket in active guest map
  if (socket.data.guestId) {
    const existingSocket = guestSockets.get(socket.data.guestId);
    if (existingSocket && existingSocket.id !== socket.id) {
      logger.info('Replacing previous socket for guest', {
        guestId: socket.data.guestId,
        oldSocketId: existingSocket.id,
        newSocketId: socket.id,
      });
      existingSocket.emit(SOCKET_EVENTS.ROOM_ERROR, {
        code: 'SESSION_REPLACED',
        message: 'Your session has connected in another tab or device.',
      });
      existingSocket.disconnect(true);
    }
    guestSockets.set(socket.data.guestId, socket);

    // If guest was disconnected and reconnected, restore connection
    roomService.restoreConnection(socket.data.guestId).then((activeRoom) => {
      if (activeRoom) {
        socket.data.currentRoomCode = activeRoom.roomCode;
        socket.join(activeRoom.roomCode);
        io.to(activeRoom.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, { room: activeRoom });
        logger.info('Restored player connection in room on socket reconnect', {
          guestId: socket.data.guestId,
          roomCode: activeRoom.roomCode,
        });
      }
    });
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

      const { room } = await roomService.joinRoom(guestId, validated.roomCode);

      socket.data.currentRoomCode = room.roomCode;
      socket.join(room.roomCode);

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
      const roomCode = socket.data.currentRoomCode;

      const result = await roomService.leaveRoom(guestId, roomCode);

      if (roomCode) {
        socket.leave(roomCode);
        socket.data.currentRoomCode = undefined;

        if (result.roomDeleted) {
          io.to(roomCode).emit(SOCKET_EVENTS.ROOM_CLOSED, {
            reason: 'All players left the room.',
          });
        } else if (result.room) {
          if (result.newHostGuestId) {
            io.to(roomCode).emit(SOCKET_EVENTS.ROOM_HOST_CHANGED, {
              newHostGuestId: result.newHostGuestId,
              version: result.room.version,
            });
          }
          io.to(roomCode).emit(SOCKET_EVENTS.ROOM_PLAYER_LEFT, {
            guestId,
            newHostGuestId: result.newHostGuestId,
            version: result.room.version,
          });
          io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, { room: result.room });
        }
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
  socket.on(SOCKET_EVENTS.ROOM_START, async (_payload, callback) => {
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

      if (room.members.length < 2) {
        callback({
          success: false,
          error: { code: ERROR_CODES.NOT_ENOUGH_PLAYERS, message: 'At least 2 players are required to play.' },
        });
        return;
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

      // In Phase 2, card gameplay engine is coming in Phase 3.
      // Broadcast room:starting with 5-second countdown notification
      io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STARTING, {
        countdownSeconds: 5,
        version: room.version,
      });

      callback({ success: true, data: { starting: true } });
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

        await roomService.markDisconnected(guestId, {
          onGracePeriodExpired: (expiredGuestId, roomCode, result) => {
            if (result.roomDeleted) {
              io.to(roomCode).emit(SOCKET_EVENTS.ROOM_CLOSED, {
                reason: 'Room closed after disconnected members departed.',
              });
            } else if (result.room) {
              if (result.newHostGuestId) {
                io.to(roomCode).emit(SOCKET_EVENTS.ROOM_HOST_CHANGED, {
                  newHostGuestId: result.newHostGuestId,
                  version: result.room.version,
                });
              }
              io.to(roomCode).emit(SOCKET_EVENTS.ROOM_PLAYER_LEFT, {
                guestId: expiredGuestId,
                newHostGuestId: result.newHostGuestId,
                version: result.room.version,
              });
              io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, { room: result.room });
            }
          },
        });

        // Broadcast disconnected status to room immediately
        if (socket.data.currentRoomCode) {
          const room = await roomService.getRoomByCode(socket.data.currentRoomCode);
          if (room) {
            io.to(socket.data.currentRoomCode).emit(SOCKET_EVENTS.ROOM_STATE, { room });
          }
        }
      }
    } catch (err) {
      logger.warn('Error handling socket disconnect event', { error: String(err) });
    }
  });
}
