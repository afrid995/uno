-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('WAITING', 'STARTING', 'IN_GAME', 'FINISHED');

-- CreateEnum
CREATE TYPE "RoomMemberRole" AS ENUM ('HOST', 'PLAYER');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "roomCode" VARCHAR(10) NOT NULL,
    "hostGuestId" UUID NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'WAITING',
    "maxPlayers" INTEGER NOT NULL DEFAULT 6,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "roomId" UUID NOT NULL,
    "guestId" UUID NOT NULL,
    "role" "RoomMemberRole" NOT NULL DEFAULT 'PLAYER',
    "readyStatus" BOOLEAN NOT NULL DEFAULT false,
    "connectionStatus" "ConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rooms_roomCode_key" ON "rooms"("roomCode");
CREATE INDEX "idx_rooms_room_code" ON "rooms"("roomCode");
CREATE INDEX "idx_rooms_status" ON "rooms"("status");
CREATE INDEX "idx_rooms_expires_at" ON "rooms"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "unique_room_guest_membership" ON "room_members"("roomId", "guestId");
CREATE INDEX "idx_room_members_room_id" ON "room_members"("roomId");
CREATE INDEX "idx_room_members_guest_id" ON "room_members"("guestId");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hostGuestId_fkey" FOREIGN KEY ("hostGuestId") REFERENCES "guest_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guest_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
