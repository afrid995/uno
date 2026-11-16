import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { initializeSocketServer } from '../../src/sockets/socketServer';
import { guestService } from '../../src/modules/guest/guest.service';
import { cancelAllCountdownTimersForTesting } from '../../src/sockets/roomSocketHandler';
import { chatService } from '../../src/modules/chat/chat.service';
import {
  SOCKET_EVENTS,
  ChatMessageDto,
  ChatHistoryDto,
  SocketAck,
} from '@uno-ultimate/game-protocol';

describe('Real-Time Multiplayer Room Chat Socket Integration Tests', () => {
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  let activeClients: ClientSocket[] = [];

  beforeAll(async () => {
    httpServer = createServer(createApp());
    initializeSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 4033;
        resolve();
      });
    });
  });

  afterAll(async () => {
    for (const client of activeClients) {
      if (client.connected) client.disconnect();
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  afterEach(() => {
    cancelAllCountdownTimersForTesting();
    for (const client of activeClients) {
      if (client.connected) client.disconnect();
    }
    activeClients = [];
    chatService.clearRateLimitsForTesting();
  });

  const createClient = (token?: string): ClientSocket => {
    const socket = ioClient(`http://localhost:${port}`, {
      auth: token ? { token } : undefined,
      transports: ['websocket'],
      forceNew: true,
      autoConnect: true,
    });
    activeClients.push(socket);
    return socket;
  };

  const waitForConnect = (socket: ClientSocket): Promise<void> => {
    return new Promise((resolve) => {
      if (socket.connected) return resolve();
      socket.once('connect', () => resolve());
    });
  };

  const createRoomWithClients = async () => {
    const s1 = await guestService.createGuest(`Host_${Date.now()}_${Math.random()}`);
    const s2 = await guestService.createGuest(`Player2_${Date.now()}_${Math.random()}`);

    const c1 = createClient(s1.rawSessionToken);
    const c2 = createClient(s2.rawSessionToken);

    await Promise.all([waitForConnect(c1), waitForConnect(c2)]);

    const createAck = await new Promise<any>((resolve) => {
      c1.emit(
        SOCKET_EVENTS.ROOM_CREATE,
        { name: 'Chat Room', maxPlayers: 4, isPrivate: false, settings: { variant: 'classic' } },
        resolve
      );
    });
    expect(createAck.success).toBe(true);
    const roomCode = createAck.data.roomCode;
    const roomId = createAck.data.id;

    const joinAck = await new Promise<any>((resolve) => {
      c2.emit(SOCKET_EVENTS.ROOM_JOIN, { roomCode }, resolve);
    });
    expect(joinAck.success).toBe(true);

    return {
      c1,
      c2,
      s1,
      s2,
      roomCode,
      roomId,
    };
  };

  it('sends and receives chat messages in the same room', async () => {
    const { c1, c2, roomCode, s1 } = await createRoomWithClients();

    const receivedMessages: ChatMessageDto[] = [];
    c2.on(SOCKET_EVENTS.ROOM_CHAT_MESSAGE, (msg: ChatMessageDto) => {
      receivedMessages.push(msg);
    });

    const sendAck = await new Promise<SocketAck<ChatMessageDto>>((resolve) => {
      c1.emit(
        SOCKET_EVENTS.ROOM_CHAT_SEND,
        { message: 'Hello, room mates!' },
        (res: SocketAck<ChatMessageDto>) => resolve(res)
      );
    });

    expect(sendAck.success).toBe(true);
    expect(sendAck.data?.message).toBe('Hello, room mates!');
    expect(sendAck.data?.senderGuestId).toBe(s1.guest.id);
    expect(sendAck.data?.senderUsername).toBe(s1.guest.username);

    // Wait for c2 to receive broadcast
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (receivedMessages.length > 0) {
          clearInterval(interval);
          resolve();
        }
      }, 30);
    });

    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].message).toBe('Hello, room mates!');
    expect(receivedMessages[0].senderUsername).toBe(s1.guest.username);
  });

  it('guarantees room isolation: message from Room A never leaks to Room B', async () => {
    const roomA = await createRoomWithClients();
    const roomB = await createRoomWithClients();

    const roomBMessages: ChatMessageDto[] = [];
    roomB.c1.on(SOCKET_EVENTS.ROOM_CHAT_MESSAGE, (msg) => roomBMessages.push(msg));
    roomB.c2.on(SOCKET_EVENTS.ROOM_CHAT_MESSAGE, (msg) => roomBMessages.push(msg));

    // Send message in Room A
    const sendAck = await new Promise<SocketAck<ChatMessageDto>>((resolve) => {
      roomA.c1.emit(
        SOCKET_EVENTS.ROOM_CHAT_SEND,
        { message: 'Secret Room A Message' },
        (res: SocketAck<ChatMessageDto>) => resolve(res)
      );
    });
    expect(sendAck.success).toBe(true);

    // Wait 200ms to ensure no cross-room leakage
    await new Promise((r) => setTimeout(r, 200));
    expect(roomBMessages.length).toBe(0);
  });

  it('rejects users who are not room members', async () => {
    const outsider = await guestService.createGuest(`Outsider_${Date.now()}`);
    const outsiderClient = createClient(outsider.rawSessionToken);
    await waitForConnect(outsiderClient);

    const sendAck = await new Promise<SocketAck<ChatMessageDto>>((resolve) => {
      outsiderClient.emit(
        SOCKET_EVENTS.ROOM_CHAT_SEND,
        { message: 'I am not in any room!' },
        (res: SocketAck<ChatMessageDto>) => resolve(res)
      );
    });

    expect(sendAck.success).toBe(false);
    expect(sendAck.error?.code).toBe('ROOM_NOT_FOUND');
  });

  it('rejects empty and oversized messages', async () => {
    const { c1 } = await createRoomWithClients();

    // 1. Empty message
    const emptyAck = await new Promise<SocketAck<ChatMessageDto>>((resolve) => {
      c1.emit(
        SOCKET_EVENTS.ROOM_CHAT_SEND,
        { message: '   ' },
        (res: SocketAck<ChatMessageDto>) => resolve(res)
      );
    });
    expect(emptyAck.success).toBe(false);

    // 2. Oversized message (>300 characters)
    const longMessage = 'A'.repeat(301);
    const longAck = await new Promise<SocketAck<ChatMessageDto>>((resolve) => {
      c1.emit(
        SOCKET_EVENTS.ROOM_CHAT_SEND,
        { message: longMessage },
        (res: SocketAck<ChatMessageDto>) => resolve(res)
      );
    });
    expect(longAck.success).toBe(false);
  });

  it('enforces chat rate limiting', async () => {
    const { c1 } = await createRoomWithClients();

    // Send 5 messages in rapid succession (allowed)
    for (let i = 0; i < 5; i++) {
      const ack = await new Promise<SocketAck<ChatMessageDto>>((resolve) => {
        c1.emit(
          SOCKET_EVENTS.ROOM_CHAT_SEND,
          { message: `Message index ${i}` },
          (res: SocketAck<ChatMessageDto>) => resolve(res)
        );
      });
      expect(ack.success).toBe(true);
    }

    // 6th message exceeds rate limit
    const exceedAck = await new Promise<SocketAck<ChatMessageDto>>((resolve) => {
      c1.emit(
        SOCKET_EVENTS.ROOM_CHAT_SEND,
        { message: 'Message index 5 - Should fail rate limit' },
        (res: SocketAck<ChatMessageDto>) => resolve(res)
      );
    });
    expect(exceedAck.success).toBe(false);
    expect(exceedAck.error?.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('prevents rapid duplicate message submissions', async () => {
    const { c1 } = await createRoomWithClients();

    const ack1 = await new Promise<SocketAck<ChatMessageDto>>((resolve) => {
      c1.emit(
        SOCKET_EVENTS.ROOM_CHAT_SEND,
        { message: 'Identical message' },
        (res: SocketAck<ChatMessageDto>) => resolve(res)
      );
    });
    expect(ack1.success).toBe(true);

    // Immediate duplicate
    const ack2 = await new Promise<SocketAck<ChatMessageDto>>((resolve) => {
      c1.emit(
        SOCKET_EVENTS.ROOM_CHAT_SEND,
        { message: 'Identical message' },
        (res: SocketAck<ChatMessageDto>) => resolve(res)
      );
    });
    expect(ack2.success).toBe(false);
    expect(ack2.error?.code).toBe('DUPLICATE_MESSAGE');
  });

  it('fetches persistent chat history across reconnection', async () => {
    const { c1, roomCode, s2 } = await createRoomWithClients();

    // Send 2 messages from player 1
    await new Promise<SocketAck<ChatMessageDto>>((resolve) => {
      c1.emit(
        SOCKET_EVENTS.ROOM_CHAT_SEND,
        { message: 'History Message 1' },
        (res: SocketAck<ChatMessageDto>) => resolve(res)
      );
    });
    await new Promise<SocketAck<ChatMessageDto>>((resolve) => {
      c1.emit(
        SOCKET_EVENTS.ROOM_CHAT_SEND,
        { message: 'History Message 2' },
        (res: SocketAck<ChatMessageDto>) => resolve(res)
      );
    });

    // Simulate player 2 reconnecting with a fresh client socket
    const c2Reconnected = createClient(s2.rawSessionToken);
    await waitForConnect(c2Reconnected);

    // Resume room
    await new Promise<any>((resolve) => {
      c2Reconnected.emit(SOCKET_EVENTS.ROOM_RESUME, { roomCode }, resolve);
    });

    // Fetch history
    const historyAck = await new Promise<SocketAck<ChatHistoryDto>>((resolve) => {
      c2Reconnected.emit(
        SOCKET_EVENTS.ROOM_CHAT_GET_HISTORY,
        {},
        (res: SocketAck<ChatHistoryDto>) => resolve(res)
      );
    });

    expect(historyAck.success).toBe(true);
    expect(historyAck.data?.messages.length).toBeGreaterThanOrEqual(2);
    const messages = historyAck.data?.messages || [];
    expect(messages.some((m) => m.message === 'History Message 1')).toBe(true);
    expect(messages.some((m) => m.message === 'History Message 2')).toBe(true);
  });

  it('supports multiple simultaneous players chatting', async () => {
    const { c1, c2 } = await createRoomWithClients();

    const [ack1, ack2] = await Promise.all([
      new Promise<SocketAck<ChatMessageDto>>((resolve) => {
        c1.emit(
          SOCKET_EVENTS.ROOM_CHAT_SEND,
          { message: 'Simultaneous message from P1' },
          (res: SocketAck<ChatMessageDto>) => resolve(res)
        );
      }),
      new Promise<SocketAck<ChatMessageDto>>((resolve) => {
        c2.emit(
          SOCKET_EVENTS.ROOM_CHAT_SEND,
          { message: 'Simultaneous message from P2' },
          (res: SocketAck<ChatMessageDto>) => resolve(res)
        );
      }),
    ]);

    expect(ack1.success).toBe(true);
    expect(ack2.success).toBe(true);
  });
});
