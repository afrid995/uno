-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('INITIALIZING', 'IN_PROGRESS', 'COMPLETED', 'ABORTED');

-- CreateTable
CREATE TABLE "matches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "roomId" UUID NOT NULL,
    "variant" VARCHAR(50) NOT NULL DEFAULT 'classic',
    "status" "MatchStatus" NOT NULL DEFAULT 'INITIALIZING',
    "sequenceNumber" INTEGER NOT NULL DEFAULT 0,
    "turnNumber" INTEGER NOT NULL DEFAULT 1,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "winnerGuestId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_players" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "matchId" UUID NOT NULL,
    "guestId" UUID NOT NULL,
    "playerIndex" INTEGER NOT NULL,
    "cardCount" INTEGER NOT NULL DEFAULT 7,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "matchId" UUID NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "eventType" VARCHAR(50) NOT NULL,
    "guestId" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "matchId" UUID NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_matches_room_id" ON "matches"("roomId");
CREATE INDEX "idx_matches_status" ON "matches"("status");

-- CreateIndex
CREATE INDEX "idx_match_players_match_id" ON "match_players"("matchId");
CREATE INDEX "idx_match_players_guest_id" ON "match_players"("guestId");
CREATE UNIQUE INDEX "unique_match_guest" ON "match_players"("matchId", "guestId");
CREATE UNIQUE INDEX "unique_match_player_index" ON "match_players"("matchId", "playerIndex");

-- CreateIndex
CREATE INDEX "idx_game_events_match_id" ON "game_events"("matchId");
CREATE UNIQUE INDEX "unique_match_event_sequence" ON "game_events"("matchId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "idx_game_snapshots_match_id" ON "game_snapshots"("matchId");
CREATE UNIQUE INDEX "unique_match_snapshot_sequence" ON "game_snapshots"("matchId", "sequenceNumber");

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_winnerGuestId_fkey" FOREIGN KEY ("winnerGuestId") REFERENCES "guest_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guest_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_snapshots" ADD CONSTRAINT "game_snapshots_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
