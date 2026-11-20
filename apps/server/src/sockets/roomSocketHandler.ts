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
import { prisma } from '@uno-ultimate/database';
import { logger } from '../utils/logger';

export type UnoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type UnoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// Track active sockets per guest to prevent duplicate connections and handle replacement
export const guestSockets = new Map<string, UnoSocket>();

// Configurable countdown duration (default 0ms for instant game start)
export const PRODUCTION_COUNTDOWN_MS = 0;
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

// Track active room initialization locks to prevent concurrent match creation
export const startingRoomLocks = new Set<string>();

export function cancelAllCountdownTimersForTesting(): void {
  for (const timer of activeCountdownTimers.values()) {
    clearTimeout(timer);
  }
  activeCountdownTimers.clear();
  startingRoomLocks.clear();
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
        await gameService.checkAndRecoverStuckSession(room.roomCode, io, guestSockets);
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

  // Helper to execute match creation, persistence, and state publishing
  const executeMatchStart = async (
    targetRoomCode: string,
    initiatingGuestId?: string,
    cb?: (response: SocketAck<{ starting: boolean; matchId?: string }>) => void,
    options?: { isRematch?: boolean }
  ) => {
    const startReceivedTime = Date.now();
    if (startingRoomLocks.has(targetRoomCode)) {
      logger.warn('Duplicate match start execution rejected', { roomCode: targetRoomCode });
      cb?.({
        success: false,
        error: { code: ERROR_CODES.BAD_REQUEST, message: 'Game start is already in progress.' },
      });
      return;
    }
    startingRoomLocks.add(targetRoomCode);

    try {
      const currentRoom = await roomService.getRoomByCode(targetRoomCode);
      const isRematch = options?.isRematch === true;
      const activeMembers = (currentRoom?.members || []).filter((m) => m.connectionStatus !== 'DISCONNECTED');

      if (!currentRoom || activeMembers.length < 2 || currentRoom.status === 'IN_GAME') {
        cb?.({
          success: false,
          error: {
            code: ERROR_CODES.BAD_REQUEST,
            message: currentRoom?.status === 'IN_GAME' ? 'A match is already in progress for this room.' : 'Cannot start match yet.',
          },
        });
        return;
      }

      // Verify non-host members are still all ready (only required for initial lobby start, not for rematch)
      if (!isRematch) {
        const nonHostMembers = currentRoom.members.filter((m) => m.guestId !== currentRoom.hostGuestId);
        const allReady = nonHostMembers.every((m) => m.readyStatus);
        if (!allReady) {
          logger.info('Aborting match start: not all non-host players are ready', { roomCode: targetRoomCode });
          cb?.({
            success: false,
            error: { code: ERROR_CODES.PLAYERS_NOT_READY, message: 'All players must be ready before starting.' },
          });
          return;
        }
      }

      // Compute cumulative scores across completed matches in this room
      const completedMatches = await prisma.match.findMany({
        where: { roomId: currentRoom.id, status: 'COMPLETED' },
        include: { players: true },
      });
      const cumulativeScores = new Map<string, number>();
      for (const match of completedMatches) {
        for (const mp of match.players) {
          cumulativeScores.set(mp.guestId, (cumulativeScores.get(mp.guestId) || 0) + mp.score);
        }
      }

      // Notify clients that starting is executing
      io.to(targetRoomCode).emit(SOCKET_EVENTS.ROOM_STARTING, {
        countdownSeconds: 0,
        version: currentRoom.version,
      });

      const dbUpdateStart = Date.now();
      // Transition room status to IN_GAME and extend room expiration for the new match
      await prisma.room.update({
        where: { id: currentRoom.id },
        data: {
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        },
      });
      const updatedRoom = await roomService.updateRoomStatus(currentRoom.id, 'IN_GAME');
      const dbUpdateDurationMs = Date.now() - dbUpdateStart;

      // Initialize Match and GameState
      const roomSettings = (currentRoom.settings as Record<string, unknown>) || {};
      const variant = (roomSettings.variant as string) || 'classic';

      const engineStart = Date.now();
      const gameState = await gameService.startMatch(
        currentRoom.id,
        currentRoom.roomCode,
        currentRoom.hostGuestId,
        activeMembers.map((m) => ({ guestId: m.guestId, username: m.username })),
        variant,
        roomSettings,
        cumulativeScores
      );
      const engineAndPersistDurationMs = Date.now() - engineStart;

      const broadcastStart = Date.now();
      // Broadcast game:started
      io.to(currentRoom.roomCode).emit(SOCKET_EVENTS.GAME_STARTED, {
        matchId: gameState.id,
        roomCode: currentRoom.roomCode,
        roundNumber: gameState.roundNumber,
      });

      // Sync room state with status: IN_GAME
      io.to(currentRoom.roomCode).emit(SOCKET_EVENTS.ROOM_STATE, { room: updatedRoom });

      // Publish personalized states to all participants
      gameStatePublisher.publishToAllParticipants(gameState, guestSockets, io);
      const broadcastDurationMs = Date.now() - broadcastStart;

      // Acknowledge the start request upon complete successful initialization
      cb?.({ success: true, data: { starting: true, matchId: gameState.id } });

      const totalServerDurationMs = Date.now() - startReceivedTime;
      logger.info('Match started successfully', {
        roomCode: currentRoom.roomCode,
        matchId: gameState.id,
        variant,
        isRematch,
        playerCount: activeMembers.length,
        dbUpdateDurationMs,
        engineAndPersistDurationMs,
        broadcastDurationMs,
        totalServerDurationMs,
      });
    } catch (err: unknown) {
      logger.error('Failed to initialize match', { error: String(err), roomCode: targetRoomCode });
      cb?.({
        success: false,
        error: { code: ERROR_CODES.INTERNAL_ERROR, message: (err as Error).message || 'Failed to start game' },
      });
      io.to(targetRoomCode).emit(SOCKET_EVENTS.ROOM_ERROR, {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to start game. Please try again.',
      });
    } finally {
      startingRoomLocks.delete(targetRoomCode);
    }
  };

  // Handle room:start
  socket.on(SOCKET_EVENTS.ROOM_START, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = socket.data.currentRoomCode;
      if (!roomCode) {
        callback({ success: false, error: { code: ERROR_CODES.NOT_IN_ROOM, message: 'Not in a room.' } });
        return;
      }

      if (startingRoomLocks.has(roomCode)) {
        logger.warn('Duplicate game start request rejected', { roomCode, guestId });
        callback({
          success: false,
          error: { code: ERROR_CODES.BAD_REQUEST, message: 'Game start is already in progress.' },
        });
        return;
      }

      const room = await roomService.getRoomByCode(roomCode);
      if (!room) {
        callback({ success: false, error: { code: ERROR_CODES.ROOM_NOT_FOUND, message: 'Room not found.' } });
        return;
      }

      if (room.status === 'IN_GAME') {
        callback({
          success: false,
          error: { code: ERROR_CODES.BAD_REQUEST, message: 'A match is already in progress for this room.' },
        });
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

      // Determine countdown duration:
      // Default to 0ms (immediate start) unless explicitly requested via immediate: false
      const isExplicitCountdown = (payload as { immediate?: boolean })?.immediate === false;
      const countdownMs = isExplicitCountdown ? (configuredCountdownMs > 0 ? configuredCountdownMs : 5000) : 0;

      if (countdownMs > 0) {
        // Cancel any active countdown for this room first
        cancelCountdownIfActive(room.roomCode, 'New countdown initiated');

        // Broadcast room:starting with countdown notification
        io.to(room.roomCode).emit(SOCKET_EVENTS.ROOM_STARTING, {
          countdownSeconds: Math.ceil(countdownMs / 1000),
          version: room.version,
        });

        callback({ success: true, data: { starting: true } });

        const timer = setTimeout(async () => {
          activeCountdownTimers.delete(room.roomCode);
          await executeMatchStart(room.roomCode, guestId);
        }, countdownMs);

        activeCountdownTimers.set(room.roomCode, timer);
      } else {
        // Immediate start (no artificial delay)
        await executeMatchStart(room.roomCode, guestId, callback);
      }
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to start game';
      const code = (err as { code?: string }).code || ERROR_CODES.INTERNAL_ERROR;
      callback({ success: false, error: { code, message } });
    }
  });

  // Handle room:rematch
  socket.on(SOCKET_EVENTS.ROOM_REMATCH, async (payload, callback) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = socket.data.currentRoomCode;
      if (!roomCode) {
        cb({ success: false, error: { code: ERROR_CODES.NOT_IN_ROOM, message: 'Not in a room.' } });
        return;
      }

      if (startingRoomLocks.has(roomCode)) {
        logger.warn('Duplicate rematch request rejected', { roomCode, guestId });
        cb({
          success: false,
          error: { code: ERROR_CODES.BAD_REQUEST, message: 'Rematch is already starting.' },
        });
        return;
      }

      const room = await roomService.getRoomByCode(roomCode);
      if (!room) {
        cb({ success: false, error: { code: ERROR_CODES.ROOM_NOT_FOUND, message: 'Room not found.' } });
        return;
      }

      if (room.status === 'IN_GAME') {
        cb({
          success: false,
          error: { code: ERROR_CODES.BAD_REQUEST, message: 'A match is already in progress for this room.' },
        });
        return;
      }

      if (room.hostGuestId !== guestId) {
        cb({
          success: false,
          error: { code: ERROR_CODES.HOST_ONLY_ACTION, message: 'Only the host can start a rematch.' },
        });
        return;
      }

      const activeMembers = room.members.filter((m) => m.connectionStatus !== 'DISCONNECTED');
      const variant = ((room.settings as Record<string, unknown>)?.variant as string) || 'classic';
      if (variant === 'uno_show_em_no_mercy') {
        if (activeMembers.length < 2 || activeMembers.length > 6) {
          cb({
            success: false,
            error: {
              code: ERROR_CODES.BAD_REQUEST,
              message: 'UNO Show \'em No Mercy requires between 2 and 6 players for a rematch.',
            },
          });
          return;
        }
      } else if (variant === 'uno_teams') {
        if (activeMembers.length < 4 || activeMembers.length > 8 || activeMembers.length % 2 !== 0) {
          cb({
            success: false,
            error: {
              code: ERROR_CODES.BAD_REQUEST,
              message: 'UNO Teams requires 4, 6, or 8 players (teams of 2) for a rematch.',
            },
          });
          return;
        }
      } else {
        if (activeMembers.length < 2 || activeMembers.length > 10) {
          cb({
            success: false,
            error: { code: ERROR_CODES.NOT_ENOUGH_PLAYERS, message: 'At least 2 players are required for a rematch.' },
          });
          return;
        }
      }

      await executeMatchStart(room.roomCode, guestId, cb, { isRematch: true });
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to start rematch';
      const code = (err as { code?: string }).code || ERROR_CODES.INTERNAL_ERROR;
      cb({ success: false, error: { code, message } });
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
