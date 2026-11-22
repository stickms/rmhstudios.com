-- s07-07: opt-in theme voting for game jams: three columns on game_jam, the shortlist and one
-- approval mark per member per candidate. Additive only.
-- AlterTable
ALTER TABLE "game_jam" ADD COLUMN     "themeResolvedAt" TIMESTAMP(3),
ADD COLUMN     "themeVoteOpensAt" TIMESTAMP(3),
ADD COLUMN     "themeVoting" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "game_jam_theme_candidate" (
    "id" TEXT NOT NULL,
    "jamId" TEXT NOT NULL,
    "text" VARCHAR(120) NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_jam_theme_candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_jam_theme_vote" (
    "jamId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_jam_theme_vote_pkey" PRIMARY KEY ("candidateId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_jam_theme_candidate_jamId_position_key" ON "game_jam_theme_candidate"("jamId", "position");

-- CreateIndex
CREATE INDEX "game_jam_theme_vote_jamId_userId_idx" ON "game_jam_theme_vote"("jamId", "userId");

-- CreateIndex
CREATE INDEX "game_jam_theme_vote_jamId_candidateId_idx" ON "game_jam_theme_vote"("jamId", "candidateId");

-- AddForeignKey
ALTER TABLE "game_jam_theme_candidate" ADD CONSTRAINT "game_jam_theme_candidate_jamId_fkey" FOREIGN KEY ("jamId") REFERENCES "game_jam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_jam_theme_vote" ADD CONSTRAINT "game_jam_theme_vote_jamId_fkey" FOREIGN KEY ("jamId") REFERENCES "game_jam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_jam_theme_vote" ADD CONSTRAINT "game_jam_theme_vote_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "game_jam_theme_candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_jam_theme_vote" ADD CONSTRAINT "game_jam_theme_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

