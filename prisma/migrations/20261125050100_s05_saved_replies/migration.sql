-- Private saved replies for the DM and group composers (sprint 05 #13): one row per titled text.
-- Additive only: a new table, its owner index and the cascade foreign key.

-- CreateTable
CREATE TABLE "saved_reply" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(60) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "position" INTEGER NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_reply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_reply_userId_position_idx" ON "saved_reply"("userId", "position");

-- AddForeignKey
ALTER TABLE "saved_reply" ADD CONSTRAINT "saved_reply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

