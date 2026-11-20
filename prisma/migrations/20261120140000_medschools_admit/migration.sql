-- RMH Med Schools phase 2a (Admit.org): interview questions/profiles, stats source/residence, WITHDRAWN/HOLD.
-- Additive: enum values, new tables, nullable or defaulted columns. The stats unique key is widened
-- (old index dropped, new one created); program becomes nullable (DROP NOT NULL is not a breaking change).
-- CreateEnum
CREATE TYPE "MedResidence" AS ENUM ('GLOBAL', 'IN_STATE', 'OUT_OF_STATE');
-- migration-safety: acknowledged[create-index-not-concurrent] med_school_stats holds a few hundred rows (schools x programs x cycles) and is written only by the daily worker, so the brief SHARE lock is harmless.


-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MedEventType" ADD VALUE 'WITHDRAWN';
ALTER TYPE "MedEventType" ADD VALUE 'HOLD';

-- DropIndex
DROP INDEX "med_school_stats_schoolId_program_cycleYear_key";

-- AlterTable
ALTER TABLE "med_school_alias_miss" ADD COLUMN     "ignored" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "med_school_stats" ADD COLUMN     "admittedCount" INTEGER,
ADD COLUMN     "applicationCount" INTEGER,
ADD COLUMN     "applicationToInterviewPct" DOUBLE PRECISION,
ADD COLUMN     "clinicalHours" DOUBLE PRECISION,
ADD COLUMN     "contributors" INTEGER,
ADD COLUMN     "interviewCount" INTEGER,
ADD COLUMN     "nonClinicalHours" DOUBLE PRECISION,
ADD COLUMN     "researchHours" DOUBLE PRECISION,
ADD COLUMN     "residence" "MedResidence" NOT NULL DEFAULT 'GLOBAL',
ADD COLUMN     "source" "MedSource" NOT NULL DEFAULT 'CYCLETRACK',
ALTER COLUMN "program" DROP NOT NULL;

-- CreateTable
CREATE TABLE "med_interview_question" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" "MedSource" NOT NULL,
    "votes" INTEGER,
    "cycleYear" INTEGER,
    "dedupeHash" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "med_interview_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_interview_profile" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "source" "MedSource" NOT NULL,
    "format" TEXT,
    "fileType" TEXT,
    "avgDifficulty" DOUBLE PRECISION,
    "interviewCount" INTEGER,
    "feedbackPositive" TEXT[],
    "feedbackNegative" TEXT[],
    "feedbackBefore" TEXT[],
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "med_interview_profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "med_interview_question_dedupeHash_key" ON "med_interview_question"("dedupeHash");

-- CreateIndex
CREATE INDEX "med_interview_question_schoolId_source_idx" ON "med_interview_question"("schoolId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "med_interview_profile_schoolId_source_key" ON "med_interview_profile"("schoolId", "source");

-- CreateIndex
CREATE INDEX "med_school_stats_schoolId_cycleYear_source_idx" ON "med_school_stats"("schoolId", "cycleYear", "source");

-- CreateIndex
CREATE UNIQUE INDEX "med_school_stats_schoolId_program_cycleYear_source_residenc_key" ON "med_school_stats"("schoolId", "program", "cycleYear", "source", "residence");

-- AddForeignKey
ALTER TABLE "med_interview_question" ADD CONSTRAINT "med_interview_question_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_interview_profile" ADD CONSTRAINT "med_interview_profile_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;

