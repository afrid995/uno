import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import {
  SOCKET_EVENTS,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@uno-ultimate/game-protocol';
import { env } from '../config/env';
import { isOriginAllowed } from '../utils/cors';
import { logger } from '../utils/logger';
import { guestService } from '../modules/guest/guest.service';
import { registerRoomHandlers, registerAuthenticatedGuestSocket, guestSockets } from './roomSocketHandler';
import { registerGameHandlers } from '../modules/game/game.socket.handler';
import { registerChatHandlers } from '../modules/chat/chat.socket.handler';
import { roomService } from '../modules/room/room.service';
import { gameService } from '../modules/game/game.service';
import { gameSessionManager } from '../modules/game/game.session.manager';

function parseCookieHeader(cookieHeader: string): Record<string, string> {
  const list: Record<string, string> = {};
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join('='));
    }
  });
  return list;
}

export function initializeSocketServer(httpServer: HttpServer): Server {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: {
      origin: (requestOrigin, callback) => {
        if (isOriginAllowed(requestOrigin)) {
          callback(null, true);
        } else {
          callback(new Error(`Socket origin ${requestOrigin} not permitted by CORS`));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  io.use(async (socket: Socket, next) => {
    try {
      let token: string | undefined;

      // 1. Check handshake auth payload
      if (socket.handshake.auth?.token && typeof socket.handshake.auth.token === 'string') {
        token = socket.handshake.auth.token;
      }

      // 2. Fallback to handshake cookie
      if (!token && socket.handshake.headers.cookie) {
        const parsedCookies = parseCookieHeader(socket.handshake.headers.cookie);
        if (parsedCookies[env.COOKIE_NAME]) {
          token = parsedCookies[env.COOKIE_NAME];
        }
      }

      if (token) {
        const guest = await guestService.validateTokenForSocket(token);
        if (guest) {
          socket.data = {
            guestId: guest.id,
            username: guest.username,
            isAuthenticated: true,
          };
          logger.info('Socket authenticated during handshake', {
            socketId: socket.id,
            guestId: guest.id,
            username: guest.username,
          });
        }
      }
    } catch (err) {
      logger.warn('Socket handshake authentication error', { socketId: socket.id, error: String(err) });
    }

    if (!socket.data) {
      socket.data = { isAuthenticated: false };
    }

    next();
  });

  io.on('connection', (socket: Socket) => {
    logger.info('Socket client connected', {
      socketId: socket.id,
      guestId: socket.data.guestId,
      isAuthenticated: socket.data.isAuthenticated,
    });

    // Handle authentication event
    socket.on(SOCKET_EVENTS.AUTH_AUTHENTICATE, async (payload, callback) => {
      try {
        if (!payload?.sessionToken) {
          callback({ success: false, error: { code: 'SESSION_INVALID', message: 'Session token required.' } });
          return;
        }

        const guest = await guestService.validateTokenForSocket(payload.sessionToken);
        if (!guest) {
          callback({
            success: false,
            error: { code: 'SESSION_INVALID', message: 'Invalid or expired session token.' },
          });
          return;
        }

        socket.data.guestId = guest.id;
        socket.data.username = guest.username;
        socket.data.isAuthenticated = true;

        await registerAuthenticatedGuestSocket(io, socket, guest.id);

        socket.emit(SOCKET_EVENTS.AUTH_SUCCESS, {
          guestId: guest.id,
          username: guest.username,
        });

        callback({ success: true, data: { guestId: guest.id, username: guest.username } });
      } catch (error) {
        logger.error('Socket authentication error', { error: String(error) });
        callback({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal authentication error.' } });
      }
    });

    // Register Room Event Handlers
    registerRoomHandlers(io, socket);

    // Register Game Action Handlers
    registerGameHandlers(io, socket, guestSockets);

    // Register Chat Event Handlers
    registerChatHandlers(io, socket);

    // Ping / Pong heartbeat test
    socket.on(SOCKET_EVENTS.PING, () => {
      socket.emit(SOCKET_EVENTS.PONG, { timestamp: Date.now() });
    });

    socket.on('disconnect', (reason) => {
      logger.info('Socket client disconnected', {
        socketId: socket.id,
        guestId: socket.data.guestId,
        reason,
      });
    });
  });

  // Reconcile durable disconnect timers from previous server process on startup
  roomService.reconcileDurableDisconnects({
    onGracePeriodExpired: async (expiredGuestId, expiredRoomCode, result) => {
      try {
        await gameService.handlePlayerDeparture(io, expiredGuestId, expiredRoomCode, 'DISCONNECT_TIMEOUT', guestSockets);
      } catch (err) {
        logger.error('Error handling game player departure on startup durable disconnect expiration', {
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
  }).catch((err) => {
    logger.warn('Initial durable disconnect reconciliation error', { error: String(err) });
  });

  return io;
}
