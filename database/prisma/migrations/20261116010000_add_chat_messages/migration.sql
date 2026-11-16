-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "roomId" UUID NOT NULL,
    "guestId" UUID NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "message" VARCHAR(300) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_chat_messages_room_created_at" ON "chat_messages"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_chat_messages_guest_id" ON "chat_messages"("guestId");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guest_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
