-- CreateTable
CREATE TABLE "game_thread" (
    "id" TEXT NOT NULL,
    "gameId" VARCHAR(64) NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPostAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "game_thread_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "game_thread_reply_count_nonneg" CHECK ("replyCount" >= 0)
);

-- CreateTable
CREATE TABLE "game_thread_post" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_thread_post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_thread_gameId_pinned_lastPostAt_idx" ON "game_thread"("gameId", "pinned" DESC, "lastPostAt" DESC);

-- CreateIndex
CREATE INDEX "game_thread_authorId_createdAt_idx" ON "game_thread"("authorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "game_thread_post_threadId_createdAt_idx" ON "game_thread_post"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "game_thread_post_authorId_createdAt_idx" ON "game_thread_post"("authorId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "game_thread" ADD CONSTRAINT "game_thread_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_thread_post" ADD CONSTRAINT "game_thread_post_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "game_thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_thread_post" ADD CONSTRAINT "game_thread_post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
