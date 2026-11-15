import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@uno-ultimate/database';
import { guestService } from '../../src/modules/guest/guest.service';
import { roomService } from '../../src/modules/room/room.service';
import { generateRoomCode } from '../../src/modules/room/room.utils';
import { ROOM_RULES, ERROR_CODES } from '@uno-ultimate/shared';
import { AppError } from '../../src/middleware/errorHandler';

describe('RoomService Unit Tests', () => {
  let hostGuestId: string;
  let player1GuestId: string;
  let player2GuestId: string;

  beforeAll(async () => {
    // Clean up test data
    await prisma.roomMember.deleteMany({});
    await prisma.room.deleteMany({});
    await prisma.guestSession.deleteMany({
      where: { username: { startsWith: 'RoomTest_' } },
    });

    const host = await guestService.createGuest('RoomTest_Host');
    const p1 = await guestService.createGuest('RoomTest_Player1');
    const p2 = await guestService.createGuest('RoomTest_Player2');

    hostGuestId = host.guest.id;
    player1GuestId = p1.guest.id;
    player2GuestId = p2.guest.id;
  });

  afterAll(async () => {
    roomService.shutdown();
    await prisma.roomMember.deleteMany({});
    await prisma.room.deleteMany({});
    await prisma.guestSession.deleteMany({
      where: { username: { startsWith: 'RoomTest_' } },
    });
    await prisma.$disconnect();
  });

  it('generates a 6-character room code from the unambiguous alphabet', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(ROOM_RULES.CODE_LENGTH);
    expect(ROOM_RULES.CODE_PATTERN.test(code)).toBe(true);
    // Must not contain ambiguous characters (0, O, 1, I)
    expect(/[0O1I]/.test(code)).toBe(false);
  });

  it('creates a private room with the creator as host and status WAITING', async () => {
    const room = await roomService.createRoom(hostGuestId, 4, { testSetting: true });

    expect(room).toBeDefined();
    expect(room.roomCode).toHaveLength(6);
    expect(room.hostGuestId).toBe(hostGuestId);
    expect(room.maxPlayers).toBe(4);
    expect(room.status).toBe('WAITING');
    expect(room.playerCount).toBe(1);
    expect(room.members).toHaveLength(1);
    expect(room.members[0].guestId).toBe(hostGuestId);
    expect(room.members[0].role).toBe('HOST');
    expect(room.members[0].connectionStatus).toBe('CONNECTED');
    expect(room.settings).toEqual({ testSetting: true });
    expect(room.version).toBe(1);
  });

  it('allows another player to join the room', async () => {
    const hostRoom = await roomService.createRoom(hostGuestId, 4);
    const { room, isNewJoin } = await roomService.joinRoom(player1GuestId, hostRoom.roomCode);

    expect(isNewJoin).toBe(true);
    expect(room.playerCount).toBe(2);
    expect(room.members.some((m) => m.guestId === player1GuestId)).toBe(true);
    const p1Member = room.members.find((m) => m.guestId === player1GuestId);
    expect(p1Member?.role).toBe('PLAYER');
    expect(p1Member?.readyStatus).toBe(false);
    expect(room.version).toBeGreaterThan(1);
  });

  it('handles idempotent join for already joined member without duplicating', async () => {
    const hostRoom = await roomService.createRoom(hostGuestId, 4);
    await roomService.joinRoom(player1GuestId, hostRoom.roomCode);

    // Second join attempt by the same player
    const { room, isNewJoin } = await roomService.joinRoom(player1GuestId, hostRoom.roomCode);
    expect(isNewJoin).toBe(false);
    expect(room.playerCount).toBe(2);
    expect(room.members.filter((m) => m.guestId === player1GuestId)).toHaveLength(1);
  });

  it('enforces room capacity and rejects joins when full', async () => {
    // Room with maxPlayers = 2
    const smallRoom = await roomService.createRoom(hostGuestId, 2);
    await roomService.joinRoom(player1GuestId, smallRoom.roomCode);

    // Third player tries to join
    await expect(roomService.joinRoom(player2GuestId, smallRoom.roomCode)).rejects.toThrow(AppError);

    try {
      await roomService.joinRoom(player2GuestId, smallRoom.roomCode);
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe(ERROR_CODES.ROOM_FULL);
    }
  });

  it('rejects joining a non-existent room code', async () => {
    await expect(roomService.joinRoom(player1GuestId, 'NONEX1')).rejects.toThrow(AppError);

    try {
      await roomService.joinRoom(player1GuestId, 'NONEX1');
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe(ERROR_CODES.ROOM_NOT_FOUND);
    }
  });

  it('allows a player to toggle ready status', async () => {
    const room = await roomService.createRoom(hostGuestId, 4);
    await roomService.joinRoom(player1GuestId, room.roomCode);

    const updatedRoom = await roomService.setReadyStatus(player1GuestId, true);
    const p1 = updatedRoom.members.find((m) => m.guestId === player1GuestId);
    expect(p1?.readyStatus).toBe(true);

    const unreadyRoom = await roomService.setReadyStatus(player1GuestId, false);
    const p1Unready = unreadyRoom.members.find((m) => m.guestId === player1GuestId);
    expect(p1Unready?.readyStatus).toBe(false);
  });

  it('allows host to update settings and rejects non-host updates', async () => {
    const room = await roomService.createRoom(hostGuestId, 4);
    await roomService.joinRoom(player1GuestId, room.roomCode);

    // Host updates settings
    const updated = await roomService.updateSettings(hostGuestId, { drawToMatch: true });
    expect((updated.settings as Record<string, unknown>).drawToMatch).toBe(true);

    // Host updates attackCustomizableCount to 1 and 3 (allowed)
    const updated1 = await roomService.updateSettings(hostGuestId, { attackCustomizableCount: 1 });
    expect((updated1.settings as Record<string, unknown>).attackCustomizableCount).toBe(1);

    const updated3 = await roomService.updateSettings(hostGuestId, { attackCustomizableCount: 3 });
    expect((updated3.settings as Record<string, unknown>).attackCustomizableCount).toBe(3);

    // Host attempts to set attackCustomizableCount to 2 (invalid - only 1 or 3 permitted)
    await expect(roomService.updateSettings(hostGuestId, { attackCustomizableCount: 2 as any })).rejects.toThrow(AppError);
    try {
      await roomService.updateSettings(hostGuestId, { attackCustomizableCount: 2 as any });
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    }

    // Non-host attempts settings update
    await expect(roomService.updateSettings(player1GuestId, { drawToMatch: false })).rejects.toThrow(AppError);

    try {
      await roomService.updateSettings(player1GuestId, { drawToMatch: false });
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.code).toBe(ERROR_CODES.HOST_ONLY_ACTION);
    }
  });

  it('transfers host deterministically to the earliest remaining member when host leaves', async () => {
    const room = await roomService.createRoom(hostGuestId, 4);
    await roomService.joinRoom(player1GuestId, room.roomCode);
    await roomService.joinRoom(player2GuestId, room.roomCode);

    // Host leaves room
    const result = await roomService.leaveRoom(hostGuestId, room.roomCode);

    expect(result.roomDeleted).toBe(false);
    expect(result.newHostGuestId).toBe(player1GuestId); // player 1 joined before player 2
    expect(result.room?.hostGuestId).toBe(player1GuestId);
    expect(result.room?.playerCount).toBe(2);

    const newHostMember = result.room?.members.find((m) => m.guestId === player1GuestId);
    expect(newHostMember?.role).toBe('HOST');
  });

  it('marks room FINISHED and cleans up when all members leave', async () => {
    const room = await roomService.createRoom(hostGuestId, 4);
    const result = await roomService.leaveRoom(hostGuestId, room.roomCode);

    expect(result.roomDeleted).toBe(true);

    const dbRoom = await prisma.room.findUnique({
      where: { roomCode: room.roomCode },
    });
    expect(dbRoom?.status).toBe('FINISHED');
  });

  it('marks connection DISCONNECTED on disconnect and restores on reconnect', async () => {
    const room = await roomService.createRoom(hostGuestId, 4);
    await roomService.joinRoom(player1GuestId, room.roomCode);

    // Disconnect player1
    const discResult = await roomService.markDisconnected(player1GuestId);
    expect(discResult?.roomCode).toBe(room.roomCode);

    const disconnectedRoom = await roomService.getRoomByCode(room.roomCode);
    const p1Disc = disconnectedRoom?.members.find((m) => m.guestId === player1GuestId);
    expect(p1Disc?.connectionStatus).toBe('DISCONNECTED');

    // Reconnect player1
    const restoredRoom = await roomService.restoreConnection(player1GuestId);
    const p1Restored = restoredRoom?.members.find((m) => m.guestId === player1GuestId);
    expect(p1Restored?.connectionStatus).toBe('CONNECTED');
  });
});
