/*
  Warnings:

  - You are about to drop the `CodeFile` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CodeProject` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserGitHubToken` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `assessment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `job` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `job_application` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `note` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `note_folder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `note_mood` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `note_reminder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `note_share` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `note_tag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `note_tag_relation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `note_template` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `note_version` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CodeFile" DROP CONSTRAINT "CodeFile_projectId_fkey";

-- DropForeignKey
ALTER TABLE "CodeFile" DROP CONSTRAINT "CodeFile_userId_fkey";

-- DropForeignKey
ALTER TABLE "CodeProject" DROP CONSTRAINT "CodeProject_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserGitHubToken" DROP CONSTRAINT "UserGitHubToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "assessment" DROP CONSTRAINT "assessment_applicationId_fkey";

-- DropForeignKey
ALTER TABLE "job_application" DROP CONSTRAINT "job_application_jobId_fkey";

-- DropForeignKey
ALTER TABLE "job_application" DROP CONSTRAINT "job_application_userId_fkey";

-- DropForeignKey
ALTER TABLE "note" DROP CONSTRAINT "note_folderId_fkey";

-- DropForeignKey
ALTER TABLE "note" DROP CONSTRAINT "note_userId_fkey";

-- DropForeignKey
ALTER TABLE "note_folder" DROP CONSTRAINT "note_folder_parentId_fkey";

-- DropForeignKey
ALTER TABLE "note_folder" DROP CONSTRAINT "note_folder_userId_fkey";

-- DropForeignKey
ALTER TABLE "note_mood" DROP CONSTRAINT "note_mood_userId_fkey";

-- DropForeignKey
ALTER TABLE "note_reminder" DROP CONSTRAINT "note_reminder_noteId_fkey";

-- DropForeignKey
ALTER TABLE "note_share" DROP CONSTRAINT "note_share_noteId_fkey";

-- DropForeignKey
ALTER TABLE "note_tag" DROP CONSTRAINT "note_tag_userId_fkey";

-- DropForeignKey
ALTER TABLE "note_tag_relation" DROP CONSTRAINT "note_tag_relation_noteId_fkey";

-- DropForeignKey
ALTER TABLE "note_tag_relation" DROP CONSTRAINT "note_tag_relation_tagId_fkey";

-- DropForeignKey
ALTER TABLE "note_template" DROP CONSTRAINT "note_template_userId_fkey";

-- DropForeignKey
ALTER TABLE "note_version" DROP CONSTRAINT "note_version_noteId_fkey";

-- DropTable
DROP TABLE "CodeFile";

-- DropTable
DROP TABLE "CodeProject";

-- DropTable
DROP TABLE "UserGitHubToken";

-- DropTable
DROP TABLE "assessment";

-- DropTable
DROP TABLE "job";

-- DropTable
DROP TABLE "job_application";

-- DropTable
DROP TABLE "note";

-- DropTable
DROP TABLE "note_folder";

-- DropTable
DROP TABLE "note_mood";

-- DropTable
DROP TABLE "note_reminder";

-- DropTable
DROP TABLE "note_share";

-- DropTable
DROP TABLE "note_tag";

-- DropTable
DROP TABLE "note_tag_relation";

-- DropTable
DROP TABLE "note_template";

-- DropTable
DROP TABLE "note_version";

-- CreateTable
CREATE TABLE "rmhtype_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "totalGamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "totalWins" INTEGER NOT NULL DEFAULT 0,
    "bestWpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgWpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bestAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCharsTyped" INTEGER NOT NULL DEFAULT 0,
    "totalTimeMs" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rmhtype_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtype_match" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "passageId" TEXT NOT NULL,
    "passageLength" TEXT NOT NULL,
    "rounds" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "winnerUserId" TEXT,
    "playerCount" INTEGER NOT NULL,
    "isSolo" BOOLEAN NOT NULL DEFAULT false,
    "results" JSONB NOT NULL,

    CONSTRAINT "rmhtype_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtype_match_player" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "wpm" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "timeMs" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "wasWinner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmhtype_match_player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhstudy_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalFocusTimeMs" BIGINT NOT NULL DEFAULT 0,
    "sessionsCompleted" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastStudyDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rmhstudy_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhstudy_session" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT,
    "focusTimeMs" INTEGER NOT NULL,
    "breakTimeMs" INTEGER NOT NULL,
    "sessionsInRun" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "rmhstudy_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rmhtype_profile_difficulty_bestWpm_idx" ON "rmhtype_profile"("difficulty", "bestWpm" DESC);

-- CreateIndex
CREATE INDEX "rmhtype_profile_totalWins_idx" ON "rmhtype_profile"("totalWins" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rmhtype_profile_userId_difficulty_key" ON "rmhtype_profile"("userId", "difficulty");

-- CreateIndex
CREATE INDEX "rmhtype_match_startedAt_idx" ON "rmhtype_match"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "rmhtype_match_winnerUserId_idx" ON "rmhtype_match"("winnerUserId");

-- CreateIndex
CREATE INDEX "rmhtype_match_player_profileId_idx" ON "rmhtype_match_player"("profileId");

-- CreateIndex
CREATE INDEX "rmhtype_match_player_userId_idx" ON "rmhtype_match_player"("userId");

-- CreateIndex
CREATE INDEX "rmhtype_match_player_wpm_idx" ON "rmhtype_match_player"("wpm" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rmhtype_match_player_matchId_userId_key" ON "rmhtype_match_player"("matchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "rmhstudy_profile_userId_key" ON "rmhstudy_profile"("userId");

-- CreateIndex
CREATE INDEX "rmhstudy_profile_totalFocusTimeMs_idx" ON "rmhstudy_profile"("totalFocusTimeMs" DESC);

-- CreateIndex
CREATE INDEX "rmhstudy_profile_sessionsCompleted_idx" ON "rmhstudy_profile"("sessionsCompleted" DESC);

-- CreateIndex
CREATE INDEX "rmhstudy_profile_currentStreak_idx" ON "rmhstudy_profile"("currentStreak" DESC);

-- CreateIndex
CREATE INDEX "rmhstudy_session_profileId_idx" ON "rmhstudy_session"("profileId");

-- CreateIndex
CREATE INDEX "rmhstudy_session_userId_idx" ON "rmhstudy_session"("userId");

-- CreateIndex
CREATE INDEX "rmhstudy_session_startedAt_idx" ON "rmhstudy_session"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "feedback_userId_idx" ON "feedback"("userId");

-- CreateIndex
CREATE INDEX "feedback_createdAt_idx" ON "feedback"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "rmhtype_profile" ADD CONSTRAINT "rmhtype_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtype_match_player" ADD CONSTRAINT "rmhtype_match_player_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "rmhtype_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtype_match_player" ADD CONSTRAINT "rmhtype_match_player_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "rmhtype_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhstudy_profile" ADD CONSTRAINT "rmhstudy_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhstudy_session" ADD CONSTRAINT "rmhstudy_session_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "rmhstudy_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
