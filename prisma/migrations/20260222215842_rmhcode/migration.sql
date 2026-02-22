-- CreateEnum
CREATE TYPE "SSLobbyStatus" AS ENUM ('WAITING', 'IN_MATCH', 'CLOSED');

-- CreateEnum
CREATE TYPE "SSMatchStatus" AS ENUM ('RUNNING', 'FINISHED');

-- CreateTable
CREATE TABLE "synapse_storm_player" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "highScore" INTEGER NOT NULL DEFAULT 0,
    "puzzlesSolved" INTEGER NOT NULL DEFAULT 0,
    "maxCombo" INTEGER NOT NULL DEFAULT 0,
    "peakDifficulty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "totalTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "synapse_storm_player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ss_lobby" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "SSLobbyStatus" NOT NULL DEFAULT 'WAITING',
    "hostUserId" TEXT NOT NULL,

    CONSTRAINT "ss_lobby_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ss_lobby_member" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isReady" BOOLEAN NOT NULL DEFAULT false,
    "isHost" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ss_lobby_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ss_match" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "status" "SSMatchStatus" NOT NULL DEFAULT 'RUNNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ss_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ss_player_match" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "maxCombo" INTEGER NOT NULL DEFAULT 0,
    "puzzlesSolved" INTEGER NOT NULL DEFAULT 0,
    "puzzlesMissed" INTEGER NOT NULL DEFAULT 0,
    "finishedAt" TIMESTAMP(3),
    "lastUpdateAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ss_player_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGitHubToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGitHubToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gitOwner" TEXT,
    "gitRepo" TEXT,
    "gitBranch" TEXT DEFAULT 'main',
    "gitLastSyncAt" TIMESTAMP(3),

    CONSTRAINT "CodeProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeFile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "language" TEXT,
    "gitSha" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "synapse_storm_player_userId_key" ON "synapse_storm_player"("userId");

-- CreateIndex
CREATE INDEX "synapse_storm_player_highScore_idx" ON "synapse_storm_player"("highScore" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ss_lobby_code_key" ON "ss_lobby"("code");

-- CreateIndex
CREATE INDEX "ss_lobby_member_lobbyId_idx" ON "ss_lobby_member"("lobbyId");

-- CreateIndex
CREATE UNIQUE INDEX "ss_lobby_member_lobbyId_userId_key" ON "ss_lobby_member"("lobbyId", "userId");

-- CreateIndex
CREATE INDEX "ss_match_lobbyId_idx" ON "ss_match"("lobbyId");

-- CreateIndex
CREATE INDEX "ss_player_match_matchId_idx" ON "ss_player_match"("matchId");

-- CreateIndex
CREATE INDEX "ss_player_match_lobbyId_idx" ON "ss_player_match"("lobbyId");

-- CreateIndex
CREATE UNIQUE INDEX "ss_player_match_matchId_userId_key" ON "ss_player_match"("matchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserGitHubToken_userId_key" ON "UserGitHubToken"("userId");

-- CreateIndex
CREATE INDEX "CodeProject_userId_idx" ON "CodeProject"("userId");

-- CreateIndex
CREATE INDEX "CodeFile_projectId_idx" ON "CodeFile"("projectId");

-- CreateIndex
CREATE INDEX "CodeFile_userId_idx" ON "CodeFile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CodeFile_projectId_path_key" ON "CodeFile"("projectId", "path");

-- AddForeignKey
ALTER TABLE "synapse_storm_player" ADD CONSTRAINT "synapse_storm_player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ss_lobby_member" ADD CONSTRAINT "ss_lobby_member_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "ss_lobby"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ss_match" ADD CONSTRAINT "ss_match_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "ss_lobby"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ss_player_match" ADD CONSTRAINT "ss_player_match_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "ss_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGitHubToken" ADD CONSTRAINT "UserGitHubToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeProject" ADD CONSTRAINT "CodeProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeFile" ADD CONSTRAINT "CodeFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "CodeProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeFile" ADD CONSTRAINT "CodeFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
