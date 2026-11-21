-- s06-18: away messages for direct messages (one per member) and the per-period reply claims.
-- Additive: two new tables, one unique index and one foreign key each.
-- CreateTable
CREATE TABLE "away_message" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" VARCHAR(300) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "tz" VARCHAR(64) NOT NULL,
    "showOnProfile" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "away_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "away_reply_sent" (
    "awayId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "away_reply_sent_pkey" PRIMARY KEY ("awayId","chatId")
);

-- CreateIndex
CREATE UNIQUE INDEX "away_message_userId_key" ON "away_message"("userId");

-- CreateIndex
CREATE INDEX "away_reply_sent_chatId_idx" ON "away_reply_sent"("chatId");

-- AddForeignKey
ALTER TABLE "away_message" ADD CONSTRAINT "away_message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "away_reply_sent" ADD CONSTRAINT "away_reply_sent_awayId_fkey" FOREIGN KEY ("awayId") REFERENCES "away_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

