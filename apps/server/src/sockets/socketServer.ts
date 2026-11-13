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
import { logger } from '../utils/logger';
import { guestService } from '../modules/guest/guest.service';

export function initializeSocketServer(httpServer: HttpServer): Server {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  io.use(async (socket: Socket, next) => {
    // Initial handshake auth check (optional in Phase 1, ready for Phase 2 room joins)
    const token = socket.handshake.auth?.token;
    if (token && typeof token === 'string') {
      try {
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
      } catch (err) {
        logger.warn('Socket token validation failed', { socketId: socket.id, error: String(err) });
      }
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
          callback({ success: false, error: 'Session token required.' });
          return;
        }

        const guest = await guestService.validateTokenForSocket(payload.sessionToken);
        if (!guest) {
          callback({ success: false, error: 'Invalid or expired session token.' });
          return;
        }

        socket.data.guestId = guest.id;
        socket.data.username = guest.username;
        socket.data.isAuthenticated = true;

        socket.emit(SOCKET_EVENTS.AUTH_SUCCESS, {
          guestId: guest.id,
          username: guest.username,
        });

        callback({ success: true });
      } catch (error) {
        logger.error('Socket authentication error', { error: String(error) });
        callback({ success: false, error: 'Internal authentication error.' });
      }
    });

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

  return io;
}
