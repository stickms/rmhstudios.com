-- CreateTable
CREATE TABLE "music_guess_puzzle" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "artist" VARCHAR(160) NOT NULL,
    "hints" JSONB NOT NULL,
    "acceptedAnswers" JSONB NOT NULL,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "solves" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "music_guess_puzzle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "music_guess_puzzle_createdAt_idx" ON "music_guess_puzzle"("createdAt" DESC);
ALTER TABLE "music_guess_puzzle" ADD CONSTRAINT "music_guess_puzzle_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "music_guess_attempt" (
    "id" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "solved" BOOLEAN NOT NULL DEFAULT false,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "music_guess_attempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "music_guess_attempt_puzzleId_userId_key" ON "music_guess_attempt"("puzzleId", "userId");
CREATE INDEX "music_guess_attempt_userId_idx" ON "music_guess_attempt"("userId");
ALTER TABLE "music_guess_attempt" ADD CONSTRAINT "music_guess_attempt_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "music_guess_puzzle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "music_guess_attempt" ADD CONSTRAINT "music_guess_attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
