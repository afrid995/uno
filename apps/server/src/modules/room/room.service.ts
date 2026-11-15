import { prisma } from '@uno-ultimate/database';
import {
  ROOM_RULES,
  ERROR_CODES,
  HTTP_STATUS,
  RoomPublicDto,
  RoomMemberPublicDto,
  RoomStatus,
  RoomMemberRole,
  ConnectionStatus,
} from '@uno-ultimate/shared';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { generateRoomCode } from './room.utils';

export interface DisconnectTimerCallback {
  onGracePeriodExpired: (guestId: string, roomCode: string, result: LeaveRoomResult) => void;
}

export interface LeaveRoomResult {
  roomDeleted: boolean;
  roomCode: string;
  newHostGuestId?: string;
  room?: RoomPublicDto;
}

export class RoomService {
  // In-memory grace period timers for disconnected members (single instance)
  private disconnectTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Helper to format a Room database record with members into RoomPublicDto.
   */
  private formatRoom(room: {
    id: string;
    roomCode: string;
    hostGuestId: string;
    status: RoomStatus;
    maxPlayers: number;
    settings: unknown;
    version: number;
    createdAt: Date;
    expiresAt: Date;
    members: Array<{
      id: string;
      guestId: string;
      role: RoomMemberRole;
      readyStatus: boolean;
      connectionStatus: ConnectionStatus;
      joinedAt: Date;
      lastSeenAt: Date;
      guest: {
        username: string;
      };
    }>;
  }): RoomPublicDto {
    const formattedMembers: RoomMemberPublicDto[] = room.members.map((m) => ({
      id: m.id,
      guestId: m.guestId,
      username: m.guest.username,
      role: m.role,
      readyStatus: m.readyStatus,
      connectionStatus: m.connectionStatus,
      joinedAt: m.joinedAt.toISOString(),
      lastSeenAt: m.lastSeenAt.toISOString(),
    }));

    return {
      id: room.id,
      roomCode: room.roomCode,
      hostGuestId: room.hostGuestId,
      status: room.status,
      maxPlayers: room.maxPlayers,
      playerCount: formattedMembers.length,
      members: formattedMembers,
      settings: (room.settings as Record<string, unknown>) || {},
      version: room.version,
      createdAt: room.createdAt.toISOString(),
      expiresAt: room.expiresAt.toISOString(),
    };
  }

  /**
   * Generates a unique room code, retrying up to 5 times if collisions occur.
   */
  async generateUniqueRoomCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateRoomCode();
      const existing = await prisma.room.findUnique({
        where: { roomCode: code },
        select: { id: true },
      });
      if (!existing) {
        return code;
      }
    }
    throw new AppError(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to generate a unique room code. Please try again.'
    );
  }

  /**
   * Creates a new private room.
   */
  async createRoom(
    hostGuestId: string,
    maxPlayers: number = ROOM_RULES.DEFAULT_MAX_PLAYERS,
    settings: Record<string, unknown> = {}
  ): Promise<RoomPublicDto> {
    if (
      settings.variant !== undefined &&
      settings.variant !== 'classic' &&
      settings.variant !== 'uno_flip' &&
      settings.variant !== 'uno_show_em_no_mercy' &&
      settings.variant !== 'uno_all_wild' &&
      settings.variant !== 'uno_flex' &&
      settings.variant !== 'uno_teams' &&
      settings.variant !== 'uno_attack'
    ) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid game variant. Supported variants are classic, uno_flip, uno_show_em_no_mercy, uno_all_wild, uno_flex, uno_teams, and uno_attack.'
      );
    }

    const effectiveMaxPlayers =
      settings.variant === 'uno_show_em_no_mercy'
        ? Math.min(maxPlayers, 6)
        : settings.variant === 'uno_flex' || settings.variant === 'uno_teams'
          ? Math.min(maxPlayers, 8)
          : maxPlayers;

    // Verify host guest exists
    const hostGuest = await prisma.guestSession.findUnique({
      where: { id: hostGuestId },
    });
    if (!hostGuest) {
      throw new AppError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.SESSION_NOT_FOUND, 'Guest session not found.');
    }

    // Leave any existing room first
    await this.leaveActiveRoomsForGuest(hostGuestId);

    const roomCode = await this.generateUniqueRoomCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ROOM_RULES.DEFAULT_TTL_HOURS * 3600 * 1000);

    const room = await prisma.$transaction(async (tx) => {
      const createdRoom = await tx.room.create({
        data: {
          roomCode,
          hostGuestId,
          maxPlayers: effectiveMaxPlayers,
          settings: settings as object,
          status: 'WAITING',
          version: 1,
          createdAt: now,
          expiresAt,
        },
      });

      await tx.roomMember.create({
        data: {
          roomId: createdRoom.id,
          guestId: hostGuestId,
          role: 'HOST',
          readyStatus: false,
          connectionStatus: 'CONNECTED',
          joinedAt: now,
          lastSeenAt: now,
        },
      });

      return tx.room.findUniqueOrThrow({
        where: { id: createdRoom.id },
        include: {
          members: {
            include: { guest: { select: { username: true } } },
            orderBy: { joinedAt: 'asc' },
          },
        },
      });
    });

    logger.info('Private room created', {
      roomCode: room.roomCode,
      hostGuestId,
      maxPlayers,
    });

    return this.formatRoom(room);
  }

  /**
   * Joins a player to a room using room code.
   */
  async joinRoom(guestId: string, rawRoomCode: string): Promise<{ room: RoomPublicDto; isNewJoin: boolean }> {
    const roomCode = rawRoomCode.trim().toUpperCase();

    // Verify guest exists
    const guest = await prisma.guestSession.findUnique({
      where: { id: guestId },
    });
    if (!guest) {
      throw new AppError(HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.SESSION_NOT_FOUND, 'Guest session not found.');
    }

    // Cancel any active disconnect timer for this guest
    this.cancelDisconnectTimer(guestId);

    return prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({
        where: { roomCode },
        include: {
          members: {
            include: { guest: { select: { username: true } } },
            orderBy: { joinedAt: 'asc' },
          },
        },
      });

      if (!room) {
        throw new AppError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.ROOM_NOT_FOUND, 'Room not found.');
      }

      if (room.status === 'FINISHED' || room.expiresAt.getTime() <= Date.now()) {
        throw new AppError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.ROOM_EXPIRED, 'Room has expired or finished.');
      }

      if (room.status !== 'WAITING') {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.ROOM_NOT_ACCEPTING,
          'Room is already in progress and not accepting new players.'
        );
      }

      // Check if guest is already a member of this room
      const existingMember = room.members.find((m) => m.guestId === guestId);

      if (existingMember) {
        // Idempotent join / reconnect: mark connected & update lastSeenAt
        const now = new Date();
        await tx.roomMember.update({
          where: { id: existingMember.id },
          data: {
            connectionStatus: 'CONNECTED',
            lastSeenAt: now,
          },
        });

        const updatedRoom = await tx.room.findUniqueOrThrow({
          where: { id: room.id },
          include: {
            members: {
              include: { guest: { select: { username: true } } },
              orderBy: { joinedAt: 'asc' },
            },
          },
        });

        return {
          room: this.formatRoom(updatedRoom),
          isNewJoin: false,
        };
      }

      // Check capacity
      const variant = ((room.settings as Record<string, unknown>)?.variant as string) || 'classic';
      const effectiveMaxPlayers =
        variant === 'uno_show_em_no_mercy' ? Math.min(room.maxPlayers, 6) : room.maxPlayers;
      if (room.members.length >= effectiveMaxPlayers) {
        throw new AppError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.ROOM_FULL, 'Room is currently full.');
      }

      // Leave any other active room first
      await tx.roomMember.deleteMany({
        where: {
          guestId,
          roomId: { not: room.id },
        },
      });

      const now = new Date();
      await tx.roomMember.upsert({
        where: {
          roomId_guestId: {
            roomId: room.id,
            guestId,
          },
        },
        create: {
          roomId: room.id,
          guestId,
          role: 'PLAYER',
          readyStatus: false,
          connectionStatus: 'CONNECTED',
          joinedAt: now,
          lastSeenAt: now,
        },
        update: {
          connectionStatus: 'CONNECTED',
          lastSeenAt: now,
        },
      });

      // Increment room revision/version
      const updatedRoom = await tx.room.update({
        where: { id: room.id },
        data: {
          version: { increment: 1 },
        },
        include: {
          members: {
            include: { guest: { select: { username: true } } },
            orderBy: { joinedAt: 'asc' },
          },
        },
      });

      logger.info('Player joined room', {
        roomCode,
        guestId,
        username: guest.username,
        playerCount: updatedRoom.members.length,
      });

      return {
        room: this.formatRoom(updatedRoom),
        isNewJoin: true,
      };
    });
  }

  /**
   * Leaves a room voluntarily or due to timer expiration.
   */
  async leaveRoom(guestId: string, roomCode?: string): Promise<LeaveRoomResult> {
    this.cancelDisconnectTimer(guestId);

    return prisma.$transaction(async (tx) => {
      // Find the member record
      const member = await tx.roomMember.findFirst({
        where: {
          guestId,
          ...(roomCode ? { room: { roomCode } } : {}),
        },
        include: { room: true },
      });

      if (!member) {
        return { roomDeleted: false, roomCode: roomCode || '' };
      }

      const currentRoomId = member.roomId;
      const currentRoomCode = member.room.roomCode;
      const wasHost = member.role === 'HOST';

      // Remove this member
      await tx.roomMember.delete({
        where: { id: member.id },
      });

      // Check remaining members
      const remainingMembers = await tx.roomMember.findMany({
        where: { roomId: currentRoomId },
        include: { guest: { select: { username: true } } },
        orderBy: { joinedAt: 'asc' },
      });

      // If room is now empty, delete/finish the room
      if (remainingMembers.length === 0) {
        await tx.room.update({
          where: { id: currentRoomId },
          data: { status: 'FINISHED' },
        });

        logger.info('Room closed because all players left', { roomCode: currentRoomCode });

        return {
          roomDeleted: true,
          roomCode: currentRoomCode,
        };
      }

      let newHostGuestId: string | undefined;

      // Deterministic host transfer if host left
      if (wasHost) {
        // Earliest joined remaining member becomes host
        const newHost = remainingMembers[0];
        newHostGuestId = newHost.guestId;

        await tx.roomMember.update({
          where: { id: newHost.id },
          data: { role: 'HOST' },
        });

        await tx.room.update({
          where: { id: currentRoomId },
          data: {
            hostGuestId: newHost.guestId,
            version: { increment: 1 },
          },
        });

        logger.info('Host transferred deterministically', {
          roomCode: currentRoomCode,
          oldHostGuestId: guestId,
          newHostGuestId,
        });
      } else {
        // Increment version
        await tx.room.update({
          where: { id: currentRoomId },
          data: {
            version: { increment: 1 },
          },
        });
      }

      const updatedRoom = await tx.room.findUniqueOrThrow({
        where: { id: currentRoomId },
        include: {
          members: {
            include: { guest: { select: { username: true } } },
            orderBy: { joinedAt: 'asc' },
          },
        },
      });

      return {
        roomDeleted: false,
        roomCode: currentRoomCode,
        newHostGuestId,
        room: this.formatRoom(updatedRoom),
      };
    });
  }

  /**
   * Toggles ready status for a player in a room.
   */
  async setReadyStatus(guestId: string, isReady: boolean): Promise<RoomPublicDto> {
    return prisma.$transaction(async (tx) => {
      const member = await tx.roomMember.findFirst({
        where: { guestId },
        include: { room: true },
      });

      if (!member) {
        throw new AppError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_IN_ROOM, 'You are not in a room.');
      }

      await tx.roomMember.update({
        where: { id: member.id },
        data: {
          readyStatus: isReady,
          lastSeenAt: new Date(),
        },
      });

      const updatedRoom = await tx.room.update({
        where: { id: member.roomId },
        data: {
          version: { increment: 1 },
        },
        include: {
          members: {
            include: { guest: { select: { username: true } } },
            orderBy: { joinedAt: 'asc' },
          },
        },
      });

      return this.formatRoom(updatedRoom);
    });
  }

  /**
   * Updates room lifecycle status (e.g. WAITING -> IN_GAME).
   */
  async updateRoomStatus(roomId: string, status: RoomStatus): Promise<RoomPublicDto> {
    const updated = await prisma.room.update({
      where: { id: roomId },
      data: {
        status,
        version: { increment: 1 },
      },
      include: {
        members: {
          include: { guest: { select: { username: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    return this.formatRoom(updated);
  }

  /**
   * Updates room settings (host-only).
   */
  async updateSettings(guestId: string, settings: Record<string, unknown>): Promise<RoomPublicDto> {
    return prisma.$transaction(async (tx) => {
      const member = await tx.roomMember.findFirst({
        where: { guestId },
        include: { room: true },
      });

      if (!member) {
        throw new AppError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_IN_ROOM, 'You are not in a room.');
      }

      if (member.role !== 'HOST') {
        throw new AppError(
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.HOST_ONLY_ACTION,
          'Only the host can modify room settings.'
        );
      }

      if (member.room.status !== 'WAITING') {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.BAD_REQUEST,
          'Cannot modify room settings while a match is in progress.'
        );
      }

      if (
        settings.variant !== undefined &&
        settings.variant !== 'classic' &&
        settings.variant !== 'uno_flip' &&
        settings.variant !== 'uno_show_em_no_mercy' &&
        settings.variant !== 'uno_all_wild' &&
        settings.variant !== 'uno_flex' &&
        settings.variant !== 'uno_teams' &&
        settings.variant !== 'uno_attack'
      ) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
          'Invalid game variant. Supported variants are classic, uno_flip, uno_show_em_no_mercy, uno_all_wild, uno_flex, uno_teams, and uno_attack.'
        );
      }

      if (
        settings.attackCustomizableCount !== undefined &&
        settings.attackCustomizableCount !== 1 &&
        settings.attackCustomizableCount !== 3
      ) {
        throw new AppError(
          HTTP_STATUS.BAD_REQUEST,
          ERROR_CODES.VALIDATION_ERROR,
          'Invalid attackCustomizableCount. Official Mattel GTX66 rules strictly permit only 1 or 3 Wild Customizable cards.'
        );
      }

      const mergedSettings = {
        ...((member.room.settings as Record<string, unknown>) || {}),
        ...settings,
      };

      const updatedRoom = await tx.room.update({
        where: { id: member.roomId },
        data: {
          settings: mergedSettings as object,
          version: { increment: 1 },
        },
        include: {
          members: {
            include: { guest: { select: { username: true } } },
            orderBy: { joinedAt: 'asc' },
          },
        },
      });

      return this.formatRoom(updatedRoom);
    });
  }

  /**
   * Retrieves a room by room code.
   */
  async getRoomByCode(rawRoomCode: string): Promise<RoomPublicDto | null> {
    const roomCode = rawRoomCode.trim().toUpperCase();
    const room = await prisma.room.findUnique({
      where: { roomCode },
      include: {
        members: {
          include: { guest: { select: { username: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!room) return null;
    return this.formatRoom(room);
  }

  /**
   * Retrieves public metadata for an invitation link pre-check.
   */
  async getRoomMetadata(rawRoomCode: string) {
    const roomCode = rawRoomCode.trim().toUpperCase();
    const room = await prisma.room.findUnique({
      where: { roomCode },
      include: {
        members: { select: { id: true } },
      },
    });

    if (!room) {
      return { exists: false, roomCode, error: 'Room not found' };
    }

    const isExpired = room.status === 'FINISHED' || room.expiresAt.getTime() <= Date.now();
    return {
      exists: !isExpired,
      roomCode: room.roomCode,
      status: room.status,
      playerCount: room.members.length,
      maxPlayers: room.maxPlayers,
      isFull: room.members.length >= room.maxPlayers,
      isExpired,
    };
  }

  /**
   * Marks a player as DISCONNECTED and schedules a 30-second grace period timer.
   */
  async markDisconnected(
    guestId: string,
    callback?: DisconnectTimerCallback
  ): Promise<{ roomCode: string; version: number } | null> {
    const member = await prisma.roomMember.findFirst({
      where: { guestId },
      include: { room: true },
    });

    if (!member) return null;

    const roomId = member.roomId;
    const roomCode = member.room.roomCode;

    try {
      await prisma.roomMember.update({
        where: { id: member.id },
        data: { connectionStatus: 'DISCONNECTED', lastSeenAt: new Date() },
      });

      const updatedRoom = await prisma.room.update({
        where: { id: roomId },
        data: { version: { increment: 1 } },
      });

      // Schedule 30s grace timer
      this.cancelDisconnectTimer(guestId);

      const timer = setTimeout(async () => {
        this.disconnectTimers.delete(guestId);
        logger.info('Reconnection grace period expired', { guestId, roomCode });
        try {
          const result = await this.leaveRoom(guestId, roomCode);
          if (callback) {
            callback.onGracePeriodExpired(guestId, roomCode, result);
          }
        } catch (err) {
          logger.error('Error handling expired disconnect timer', { error: String(err) });
        }
      }, ROOM_RULES.RECONNECT_GRACE_PERIOD_MS);

      this.disconnectTimers.set(guestId, timer);

      return { roomCode, version: updatedRoom.version };
    } catch (err) {
      logger.warn('Failed to mark member as disconnected', { guestId, error: String(err) });
      return null;
    }
  }

  /**
   * Restores a member's status to CONNECTED upon successful socket reconnect.
   */
  async restoreConnection(guestId: string): Promise<RoomPublicDto | null> {
    this.cancelDisconnectTimer(guestId);

    const member = await prisma.roomMember.findFirst({
      where: { guestId },
      include: { room: true },
    });

    if (!member) return null;

    if (member.connectionStatus === 'DISCONNECTED') {
      try {
        await prisma.roomMember.update({
          where: { id: member.id },
          data: { connectionStatus: 'CONNECTED', lastSeenAt: new Date() },
        });

        await prisma.room.update({
          where: { id: member.roomId },
          data: { version: { increment: 1 } },
        });
      } catch {
        // Record may have been removed concurrently
        return null;
      }
    }

    return this.getRoomByCode(member.room.roomCode);
  }

  private cancelDisconnectTimer(guestId: string): void {
    const existing = this.disconnectTimers.get(guestId);
    if (existing) {
      clearTimeout(existing);
      this.disconnectTimers.delete(guestId);
    }
  }

  private async leaveActiveRoomsForGuest(guestId: string): Promise<void> {
    const existingMemberships = await prisma.roomMember.findMany({
      where: { guestId },
      include: { room: true },
    });

    for (const m of existingMemberships) {
      await this.leaveRoom(guestId, m.room.roomCode);
    }
  }

  /**
   * Clear all active timers on shutdown.
   */
  shutdown(): void {
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
  }
}

export const roomService = new RoomService();
