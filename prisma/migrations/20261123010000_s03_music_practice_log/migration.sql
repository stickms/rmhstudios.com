-- RMHMusic practice log: one append-only row per finished lesson, song run, sprint or card
-- review session, so practice over time and every song attempt can be shown (lib/rmhmusic/history.server.ts).

-- CreateTable
CREATE TABLE "music_practice_entry" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "refId" VARCHAR(80) NOT NULL,
    "mode" VARCHAR(8),
    "score" INTEGER,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_practice_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "music_practice_entry_userId_createdAt_idx" ON "music_practice_entry"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "music_practice_entry_userId_kind_refId_createdAt_idx" ON "music_practice_entry"("userId", "kind", "refId", "createdAt");

-- AddForeignKey
ALTER TABLE "music_practice_entry" ADD CONSTRAINT "music_practice_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

