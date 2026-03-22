-- AlterTable: Add Doctrine columns to "user"
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "doctrineTier" TEXT NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "doctrineTierChangedAt" TIMESTAMP(3);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "doctrineTimezone" TEXT NOT NULL DEFAULT 'America/New_York';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "doctrineRecruitedById" TEXT;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "DoctrinePuzzleMode" AS ENUM ('ALIBI', 'SPECTRUM', 'OUTCAST', 'CHAINLINK', 'IMPOSTOR', 'SAHUR_SPECIAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "DoctrineSafehouseType" AS ENUM ('DEV_LOG', 'BUILD', 'POSTMORTEM', 'DECISION', 'RAW_FOOTAGE', 'FINANCIAL', 'VOTE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "DoctrineDisclosureStatus" AS ENUM ('CLASSIFIED', 'TEASED', 'DISCLOSED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "DoctrineIncidentSeverity" AS ENUM ('COSMETIC', 'DEGRADED', 'CRITICAL', 'CATASTROPHIC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "DoctrineIncidentStatus" AS ENUM ('ACTIVE', 'MITIGATED', 'RESOLVED', 'LEGENDARY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "DoctrineReactionType" AS ENUM ('FIRE', 'BASED', 'MID', 'CRINGE', 'TRASH', 'TUNG');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "doctrine_reputation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coalitionScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "sahurCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "doctrine_reputation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "doctrine_reputation_ledger" (
    "id" TEXT NOT NULL,
    "reputationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "xpDelta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctrine_reputation_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "doctrine_puzzle" (
    "id" TEXT NOT NULL,
    "mode" "DoctrinePuzzleMode" NOT NULL,
    "date" DATE NOT NULL,
    "seed" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "difficulty" SMALLINT NOT NULL,
    "resetsAt" TIMESTAMP(3) NOT NULL,
    "isSahur" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctrine_puzzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "doctrine_puzzle_submission" (
    "id" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "timeMs" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctrine_puzzle_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "doctrine_puzzle_replay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "DoctrinePuzzleMode" NOT NULL,
    "seed" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "difficulty" SMALLINT NOT NULL,
    "answer" JSONB,
    "timeMs" INTEGER,
    "attempts" INTEGER,
    "correct" BOOLEAN,
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctrine_puzzle_replay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "doctrine_safehouse_content" (
    "id" TEXT NOT NULL,
    "type" "DoctrineSafehouseType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "minTier" TEXT NOT NULL DEFAULT 'INSIDER',
    "authorId" TEXT NOT NULL,
    "mediaUrls" TEXT[],
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctrine_safehouse_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "doctrine_access_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctrine_access_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "doctrine_disclosure" (
    "id" TEXT NOT NULL,
    "codename" TEXT NOT NULL,
    "publicTitle" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "minTierTeaser" TEXT NOT NULL DEFAULT 'OPERATOR',
    "status" "DoctrineDisclosureStatus" NOT NULL DEFAULT 'CLASSIFIED',
    "scheduledAt" TIMESTAMP(3),
    "teasedAt" TIMESTAMP(3),
    "disclosedAt" TIMESTAMP(3),
    "mediaUrls" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctrine_disclosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "doctrine_recruitment_code" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "recruiterId" TEXT NOT NULL,
    "personalMessage" TEXT NOT NULL,
    "targetSkills" TEXT[],
    "uses" INTEGER NOT NULL DEFAULT 0,
    "maxUses" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "convertedIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctrine_recruitment_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "doctrine_incident" (
    "id" TEXT NOT NULL,
    "codename" TEXT NOT NULL,
    "severity" "DoctrineIncidentSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "status" "DoctrineIncidentStatus" NOT NULL DEFAULT 'ACTIVE',
    "firstReporterId" TEXT,
    "postmortemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "doctrine_incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "doctrine_incident_event" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctrine_incident_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "doctrine_incident_report" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctrine_incident_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "doctrine_reaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reaction" "DoctrineReactionType" NOT NULL,
    "safehouseId" TEXT,
    "disclosureId" TEXT,
    "incidentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctrine_reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "doctrine_sahur_session" (
    "id" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),
    "participantCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "doctrine_sahur_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "doctrine_sahur_participation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "puzzlesCompleted" INTEGER NOT NULL DEFAULT 0,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "doctrine_sahur_participation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "doctrine_reputation_userId_key" ON "doctrine_reputation"("userId");
CREATE INDEX IF NOT EXISTS "doctrine_reputation_totalXp_idx" ON "doctrine_reputation"("totalXp" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "doctrine_reputation_ledger_reputationId_createdAt_idx" ON "doctrine_reputation_ledger"("reputationId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "doctrine_puzzle_mode_date_key" ON "doctrine_puzzle"("mode", "date");
CREATE INDEX IF NOT EXISTS "doctrine_puzzle_date_idx" ON "doctrine_puzzle"("date" DESC);
CREATE INDEX IF NOT EXISTS "doctrine_puzzle_mode_date_idx" ON "doctrine_puzzle"("mode", "date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "doctrine_puzzle_submission_puzzleId_userId_key" ON "doctrine_puzzle_submission"("puzzleId", "userId");
CREATE INDEX IF NOT EXISTS "doctrine_puzzle_submission_puzzleId_score_idx" ON "doctrine_puzzle_submission"("puzzleId", "score" DESC);
CREATE INDEX IF NOT EXISTS "doctrine_puzzle_submission_userId_createdAt_idx" ON "doctrine_puzzle_submission"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "doctrine_puzzle_replay_userId_mode_createdAt_idx" ON "doctrine_puzzle_replay"("userId", "mode", "createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "doctrine_safehouse_content_minTier_publishedAt_idx" ON "doctrine_safehouse_content"("minTier", "publishedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "doctrine_access_log_userId_contentId_key" ON "doctrine_access_log"("userId", "contentId");
CREATE INDEX IF NOT EXISTS "doctrine_access_log_contentId_idx" ON "doctrine_access_log"("contentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "doctrine_disclosure_status_scheduledAt_idx" ON "doctrine_disclosure"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "doctrine_recruitment_code_code_key" ON "doctrine_recruitment_code"("code");
CREATE INDEX IF NOT EXISTS "doctrine_recruitment_code_code_idx" ON "doctrine_recruitment_code"("code");
CREATE INDEX IF NOT EXISTS "doctrine_recruitment_code_recruiterId_idx" ON "doctrine_recruitment_code"("recruiterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "doctrine_incident_status_createdAt_idx" ON "doctrine_incident"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "doctrine_incident_event_incidentId_createdAt_idx" ON "doctrine_incident_event"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "doctrine_incident_report_incidentId_idx" ON "doctrine_incident_report"("incidentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "doctrine_reaction_userId_safehouseId_key" ON "doctrine_reaction"("userId", "safehouseId");
CREATE UNIQUE INDEX IF NOT EXISTS "doctrine_reaction_userId_disclosureId_key" ON "doctrine_reaction"("userId", "disclosureId");
CREATE UNIQUE INDEX IF NOT EXISTS "doctrine_reaction_userId_incidentId_key" ON "doctrine_reaction"("userId", "incidentId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "doctrine_sahur_session_dateKey_timezone_key" ON "doctrine_sahur_session"("dateKey", "timezone");
CREATE INDEX IF NOT EXISTS "doctrine_sahur_session_dateKey_idx" ON "doctrine_sahur_session"("dateKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "doctrine_sahur_participation_sessionId_userId_key" ON "doctrine_sahur_participation"("sessionId", "userId");

-- AddForeignKey (user self-referential for recruitment)
ALTER TABLE "user" ADD CONSTRAINT "user_doctrineRecruitedById_fkey" FOREIGN KEY ("doctrineRecruitedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctrine_reputation" ADD CONSTRAINT "doctrine_reputation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctrine_reputation_ledger" ADD CONSTRAINT "doctrine_reputation_ledger_reputationId_fkey" FOREIGN KEY ("reputationId") REFERENCES "doctrine_reputation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctrine_puzzle_submission" ADD CONSTRAINT "doctrine_puzzle_submission_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "doctrine_puzzle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctrine_puzzle_submission" ADD CONSTRAINT "doctrine_puzzle_submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctrine_puzzle_replay" ADD CONSTRAINT "doctrine_puzzle_replay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctrine_access_log" ADD CONSTRAINT "doctrine_access_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctrine_access_log" ADD CONSTRAINT "doctrine_access_log_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "doctrine_safehouse_content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctrine_recruitment_code" ADD CONSTRAINT "doctrine_recruitment_code_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctrine_incident_event" ADD CONSTRAINT "doctrine_incident_event_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "doctrine_incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctrine_incident_report" ADD CONSTRAINT "doctrine_incident_report_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "doctrine_incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctrine_incident_report" ADD CONSTRAINT "doctrine_incident_report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctrine_reaction" ADD CONSTRAINT "doctrine_reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "doctrine_reaction" ADD CONSTRAINT "doctrine_reaction_safehouseId_fkey" FOREIGN KEY ("safehouseId") REFERENCES "doctrine_safehouse_content"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "doctrine_reaction" ADD CONSTRAINT "doctrine_reaction_disclosureId_fkey" FOREIGN KEY ("disclosureId") REFERENCES "doctrine_disclosure"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "doctrine_reaction" ADD CONSTRAINT "doctrine_reaction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "doctrine_incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctrine_sahur_session" ADD CONSTRAINT "doctrine_sahur_session_pkey_exists" CHECK (true);

-- AddForeignKey
ALTER TABLE "doctrine_sahur_participation" ADD CONSTRAINT "doctrine_sahur_participation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "doctrine_sahur_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctrine_sahur_participation" ADD CONSTRAINT "doctrine_sahur_participation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
