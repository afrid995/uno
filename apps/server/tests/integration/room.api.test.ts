import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '@uno-ultimate/database';
import { guestService } from '../../src/modules/guest/guest.service';
import { roomService } from '../../src/modules/room/room.service';
import { env } from '../../src/config/env';

describe('Room API Integration Tests', () => {
  const app = createApp();
  let hostGuestId: string;
  let hostToken: string;
  let otherGuestId: string;
  let otherToken: string;
  let testRoomCode: string;

  beforeAll(async () => {
    // Clean up test data
    await prisma.roomMember.deleteMany({
      where: { guest: { username: { startsWith: 'RoomApi_' } } },
    });
    await prisma.room.deleteMany({
      where: { host: { username: { startsWith: 'RoomApi_' } } },
    });
    await prisma.guestSession.deleteMany({
      where: { username: { startsWith: 'RoomApi_' } },
    });

    // Create host session
    const hostRes = await guestService.createGuest('RoomApi_Host');
    hostGuestId = hostRes.guest.id;
    hostToken = hostRes.rawSessionToken;

    // Create other session
    const otherRes = await guestService.createGuest('RoomApi_Other');
    otherGuestId = otherRes.guest.id;
    otherToken = otherRes.rawSessionToken;

    // Create a room with host
    const room = await roomService.createRoom(hostGuestId, 3);
    testRoomCode = room.roomCode;
  });

  afterAll(async () => {
    await prisma.roomMember.deleteMany({
      where: { guest: { username: { startsWith: 'RoomApi_' } } },
    });
    await prisma.room.deleteMany({
      where: { host: { username: { startsWith: 'RoomApi_' } } },
    });
    await prisma.guestSession.deleteMany({
      where: { username: { startsWith: 'RoomApi_' } },
    });
    await prisma.$disconnect();
  });

  describe('GET /api/rooms/:roomCode', () => {
    it('returns exists: false for a non-existent room code', async () => {
      const res = await request(app).get('/api/rooms/NONEX9');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exists).toBe(false);
      expect(res.body.data.roomCode).toBe('NONEX9');
    });

    it('returns metadata for an existing active room', async () => {
      const res = await request(app).get(`/api/rooms/${testRoomCode}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.exists).toBe(true);
      expect(res.body.data.roomCode).toBe(testRoomCode);
      expect(res.body.data.status).toBe('WAITING');
      expect(res.body.data.playerCount).toBe(1);
      expect(res.body.data.maxPlayers).toBe(3);
      expect(res.body.data.isFull).toBe(false);
      expect(res.body.data.isExpired).toBe(false);
    });
  });

  describe('GET /api/rooms/:roomCode/state', () => {
    it('returns 401 Unauthorized when no auth credentials are provided', async () => {
      const res = await request(app).get(`/api/rooms/${testRoomCode}/state`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 404 when room code does not exist', async () => {
      const res = await request(app)
        .get('/api/rooms/NONEX9/state')
        .set('Authorization', `Bearer ${hostToken}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ROOM_NOT_FOUND');
    });

    it('returns 403 Forbidden when authenticated user is not a member of the room', async () => {
      const res = await request(app)
        .get(`/api/rooms/${testRoomCode}/state`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_IN_ROOM');
    });

    it('returns 200 with RoomPublicDto when user is a member (via Bearer token)', async () => {
      const res = await request(app)
        .get(`/api/rooms/${testRoomCode}/state`)
        .set('Authorization', `Bearer ${hostToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.roomCode).toBe(testRoomCode);
      expect(res.body.data.members).toHaveLength(1);
      expect(res.body.data.members[0].guestId).toBe(hostGuestId);
      expect(res.body.data.members[0].role).toBe('HOST');
    });

    it('returns 200 with RoomPublicDto when user is a member (via Cookie)', async () => {
      const res = await request(app)
        .get(`/api/rooms/${testRoomCode}/state`)
        .set('Cookie', [`${env.COOKIE_NAME}=${hostToken}`]);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.roomCode).toBe(testRoomCode);
      expect(res.body.data.members[0].username).toBe('RoomApi_Host');
    });
  });
});
