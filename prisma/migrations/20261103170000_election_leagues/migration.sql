-- CreateTable
CREATE TABLE "election_league" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "cycle" VARCHAR(10) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "election_league_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "election_league_member" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "picks" JSONB NOT NULL DEFAULT '{}',
    "pickedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "election_league_member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "election_league_code_key" ON "election_league"("code");

-- CreateIndex
CREATE INDEX "election_league_ownerId_createdAt_idx" ON "election_league"("ownerId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "election_league_member_leagueId_userId_key" ON "election_league_member"("leagueId", "userId");

-- CreateIndex
CREATE INDEX "election_league_member_userId_joinedAt_idx" ON "election_league_member"("userId", "joinedAt" DESC);

-- AddForeignKey
ALTER TABLE "election_league" ADD CONSTRAINT "election_league_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election_league_member" ADD CONSTRAINT "election_league_member_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "election_league"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "election_league_member" ADD CONSTRAINT "election_league_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
