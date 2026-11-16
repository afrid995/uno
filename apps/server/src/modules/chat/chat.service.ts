import { prisma } from '@uno-ultimate/database';
import {
  ChatMessageDto,
  ChatHistoryDto,
  sendChatMessageInputSchema,
} from '@uno-ultimate/game-protocol';
import { AppError } from '../../middleware/errorHandler';
import { HTTP_STATUS, ERROR_CODES } from '@uno-ultimate/shared';
import { logger } from '../../utils/logger';

interface RateLimitEntry {
  timestamps: number[];
  lastMessage: string;
  lastMessageTime: number;
}

export class ChatService {
  private rateLimits = new Map<string, RateLimitEntry>();
  private readonly MAX_MESSAGES_PER_WINDOW = 5;
  private readonly WINDOW_MS = 3000;
  private readonly DUPLICATE_COOLDOWN_MS = 1000;

  /**
   * Reset rate limit state (useful for tests)
   */
  clearRateLimitsForTesting(): void {
    this.rateLimits.clear();
  }

  /**
   * Verify membership and send a sanitized chat message to a room.
   */
  async sendMessage(
    guestId: string,
    roomCode: string,
    rawMessage: unknown
  ): Promise<ChatMessageDto> {
    if (!guestId) {
      throw new AppError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Authentication required.');
    }

    // 1. Validate payload schema
    const validated = await sendChatMessageInputSchema.parseAsync({ message: rawMessage });
    const trimmedMessage = validated.message;

    // 2. Rate limiting check
    const now = Date.now();
    let limitEntry = this.rateLimits.get(guestId);
    if (!limitEntry) {
      limitEntry = { timestamps: [], lastMessage: '', lastMessageTime: 0 };
      this.rateLimits.set(guestId, limitEntry);
    }

    // Filter out timestamps outside the sliding window
    limitEntry.timestamps = limitEntry.timestamps.filter((t) => now - t < this.WINDOW_MS);

    if (limitEntry.timestamps.length >= this.MAX_MESSAGES_PER_WINDOW) {
      logger.warn('Chat rate limit exceeded', { guestId, roomCode });
      throw new AppError(
        HTTP_STATUS.TOO_MANY_REQUESTS,
        'RATE_LIMIT_EXCEEDED',
        'Chat rate limit exceeded. Please wait a moment.'
      );
    }

    // 3. Duplicate message check within short cooldown
    if (
      limitEntry.lastMessage === trimmedMessage &&
      now - limitEntry.lastMessageTime < this.DUPLICATE_COOLDOWN_MS
    ) {
      logger.warn('Duplicate chat message detected', { guestId, roomCode });
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        'DUPLICATE_MESSAGE',
        'Duplicate message. Please wait a moment before sending the same message.'
      );
    }

    // 4. Verify room existence and sender membership
    const room = await prisma.room.findUnique({
      where: { roomCode: roomCode.toUpperCase() },
      include: {
        members: {
          where: { guestId },
        },
      },
    });

    if (!room) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.');
    }

    const membership = room.members[0];
    if (!membership) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.NOT_IN_ROOM,
        'You are not a member of this room.'
      );
    }

    // 5. Look up sender's authenticated guest session
    const guest = await prisma.guestSession.findUnique({
      where: { id: guestId },
    });

    if (!guest) {
      throw new AppError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Guest session not found.');
    }

    // 6. Sanitize message content to prevent HTML/XSS injection
    const sanitized = trimmedMessage
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    // 7. Persist message to database
    const saved = await prisma.chatMessage.create({
      data: {
        roomId: room.id,
        guestId: guest.id,
        username: guest.username,
        message: sanitized,
      },
    });

    // Update rate limit entry
    limitEntry.timestamps.push(now);
    limitEntry.lastMessage = trimmedMessage;
    limitEntry.lastMessageTime = now;

    const dto: ChatMessageDto = {
      id: saved.id,
      roomId: room.id,
      senderGuestId: guest.id,
      senderUsername: guest.username,
      message: saved.message,
      createdAt: saved.createdAt.toISOString(),
    };

    logger.info('Chat message created and persisted', {
      messageId: saved.id,
      roomId: room.id,
      roomCode,
      senderGuestId: guest.id,
    });

    return dto;
  }

  /**
   * Fetch recent chat history for an authenticated room member.
   */
  async getRecentMessages(
    guestId: string,
    roomCode: string,
    limit = 50
  ): Promise<ChatHistoryDto> {
    if (!guestId) {
      throw new AppError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED, 'Authentication required.');
    }

    const room = await prisma.room.findUnique({
      where: { roomCode: roomCode.toUpperCase() },
      include: {
        members: {
          where: { guestId },
        },
      },
    });

    if (!room) {
      throw new AppError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.');
    }

    if (!room.members[0]) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.NOT_IN_ROOM,
        'You are not a member of this room.'
      );
    }

    const messages = await prisma.chatMessage.findMany({
      where: { roomId: room.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(1, limit), 100),
    });

    // Reverse to return in chronological order (oldest to newest)
    const chronological = messages.reverse().map((m) => ({
      id: m.id,
      roomId: m.roomId,
      senderGuestId: m.guestId,
      senderUsername: m.username,
      message: m.message,
      createdAt: m.createdAt.toISOString(),
    }));

    return {
      roomId: room.id,
      messages: chronological,
    };
  }
}

export const chatService = new ChatService();
