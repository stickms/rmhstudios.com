-- AlterTable
ALTER TABLE "user_build" ADD COLUMN     "gameId" VARCHAR(64);

-- CreateIndex
-- migration-safety: acknowledged[create-index-not-concurrent] "user_build" holds member build submissions (not posts or events) and "gameId" is NULL on every existing row, so the plain build is instant
CREATE INDEX "user_build_gameId_visibility_publishedAt_idx" ON "user_build"("gameId", "visibility", "publishedAt" DESC);
