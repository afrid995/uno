import { Server, Socket } from 'socket.io';
import {
  SOCKET_EVENTS,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@uno-ultimate/game-protocol';
import { chatService } from './chat.service';
import { gameSessionManager } from '../game/game.session.manager';
import { logger } from '../../utils/logger';
import { ERROR_CODES } from '@uno-ultimate/shared';

type UnoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type UnoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function registerChatHandlers(io: UnoServer, socket: UnoSocket): void {
  const getAuthenticatedGuestId = (): string => {
    if (!socket.data?.isAuthenticated || !socket.data?.guestId) {
      throw { code: ERROR_CODES.UNAUTHORIZED, message: 'Authentication required.' };
    }
    return socket.data.guestId;
  };

  const getActiveRoomCode = (): string => {
    let roomCode = socket.data?.currentRoomCode;
    if (!roomCode && socket.data?.guestId) {
      const guestRoom = gameSessionManager.getRoomCodeForGuest(socket.data.guestId);
      if (guestRoom) {
        roomCode = guestRoom;
        socket.data.currentRoomCode = roomCode;
      }
    }
    if (!roomCode) {
      throw { code: ERROR_CODES.ROOM_NOT_FOUND, message: 'You are not currently in an active room.' };
    }
    return roomCode;
  };

  // 1. Handle room:chat-send
  socket.on(SOCKET_EVENTS.ROOM_CHAT_SEND, async (payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();

      const messageDto = await chatService.sendMessage(
        guestId,
        roomCode,
        payload?.message
      );

      // Broadcast to all sockets in this room
      io.to(roomCode).emit(SOCKET_EVENTS.ROOM_CHAT_MESSAGE, messageDto);

      if (typeof callback === 'function') {
        callback({ success: true, data: messageDto });
      }
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to send message';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      logger.warn('Failed to send chat message', {
        guestId: socket.data?.guestId,
        roomCode: socket.data?.currentRoomCode,
        code,
        error: message,
      });
      if (typeof callback === 'function') {
        callback({ success: false, error: { code, message } });
      }
    }
  });

  // 2. Handle room:chat-get-history
  socket.on(SOCKET_EVENTS.ROOM_CHAT_GET_HISTORY, async (_payload, callback) => {
    try {
      const guestId = getAuthenticatedGuestId();
      const roomCode = getActiveRoomCode();

      const history = await chatService.getRecentMessages(guestId, roomCode);

      if (typeof callback === 'function') {
        callback({ success: true, data: history });
      }
    } catch (err: unknown) {
      const message = (err as Error).message || 'Failed to fetch chat history';
      const code = (err as { code?: string }).code || ERROR_CODES.BAD_REQUEST;
      if (typeof callback === 'function') {
        callback({ success: false, error: { code, message } });
      }
    }
  });
}
