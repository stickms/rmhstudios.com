-- CreateTable
CREATE TABLE "game_review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" VARCHAR(40) NOT NULL,
    "stars" INTEGER NOT NULL,
    "body" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_review_vote" (
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,

    CONSTRAINT "game_review_vote_pkey" PRIMARY KEY ("reviewId","userId")
);

-- CreateTable
CREATE TABLE "game_guide" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "gameId" VARCHAR(40) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_guide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_guide_revision" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "note" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_guide_revision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_review_gameId_createdAt_idx" ON "game_review"("gameId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "game_review_userId_gameId_key" ON "game_review"("userId", "gameId");

-- CreateIndex
CREATE INDEX "game_guide_gameId_published_updatedAt_idx" ON "game_guide"("gameId", "published", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "game_guide_revision_guideId_createdAt_idx" ON "game_guide_revision"("guideId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "game_review" ADD CONSTRAINT "game_review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_review_vote" ADD CONSTRAINT "game_review_vote_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "game_review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_review_vote" ADD CONSTRAINT "game_review_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_guide" ADD CONSTRAINT "game_guide_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_guide_revision" ADD CONSTRAINT "game_guide_revision_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "game_guide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

