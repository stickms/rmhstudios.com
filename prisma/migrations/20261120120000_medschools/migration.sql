-- RMH Med Schools: registry, daily counts, anonymous events, published stats, run log.
-- Additive only: new enums and tables, no change to existing ones.

-- CreateEnum
CREATE TYPE "MedDegree" AS ENUM ('MD', 'DO');

-- CreateEnum
CREATE TYPE "MedProgram" AS ENUM ('REG', 'PHD');

-- CreateEnum
CREATE TYPE "MedEventType" AS ENUM ('SECONDARY', 'INTERVIEW', 'WAITLIST', 'REJECTION', 'ACCEPTANCE');

-- CreateEnum
CREATE TYPE "MedSource" AS ENUM ('CYCLETRACK', 'ADMIT', 'SDN', 'MDAPPLICANTS', 'RMH');

-- CreateEnum
CREATE TYPE "MedRunStatus" AS ENUM ('RUNNING', 'OK', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "MedRunTrigger" AS ENUM ('CRON', 'MANUAL', 'BOOTSTRAP');

-- CreateTable
CREATE TABLE "med_school" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "degree" "MedDegree" NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "website" TEXT,
    "interviewFormat" TEXT,
    "interviewType" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "med_school_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_school_alias" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "source" "MedSource" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "med_school_alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_school_alias_miss" (
    "id" TEXT NOT NULL,
    "source" "MedSource" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "resolvedSchoolId" TEXT,

    CONSTRAINT "med_school_alias_miss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_cycle" (
    "cycleYear" INTEGER NOT NULL,
    "amcasOpensOn" DATE,
    "amcasSubmitOn" DATE,
    "aacomasOpensOn" DATE,
    "dayZeroOn" DATE NOT NULL,
    "dateEstimated" BOOLEAN NOT NULL,

    CONSTRAINT "med_cycle_pkey" PRIMARY KEY ("cycleYear")
);

-- CreateTable
CREATE TABLE "med_cycle_count" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "program" "MedProgram" NOT NULL,
    "cycleYear" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "eventType" "MedEventType" NOT NULL,
    "source" "MedSource" NOT NULL,
    "count" INTEGER NOT NULL,
    "contributors" INTEGER,

    CONSTRAINT "med_cycle_count_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_cycle_event" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "cycleYear" INTEGER NOT NULL,
    "eventType" "MedEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "source" "MedSource" NOT NULL,
    "dedupeHash" TEXT NOT NULL,
    "inState" BOOLEAN,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "med_cycle_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_school_stats" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "program" "MedProgram" NOT NULL,
    "cycleYear" INTEGER NOT NULL,
    "gpaMedian" DOUBLE PRECISION,
    "gpaLow" DOUBLE PRECISION,
    "gpaHigh" DOUBLE PRECISION,
    "mcatMedian" INTEGER,
    "mcatLow" INTEGER,
    "mcatHigh" INTEGER,
    "interviewToAcceptancePct" DOUBLE PRECISION,
    "firstSecondaryOn" DATE,
    "firstInterviewOn" DATE,
    "firstAcceptanceOn" DATE,
    "sourceUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "med_school_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_source_run" (
    "id" TEXT NOT NULL,
    "source" "MedSource" NOT NULL,
    "job" TEXT NOT NULL,
    "trigger" "MedRunTrigger" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "MedRunStatus" NOT NULL,
    "stats" JSONB,
    "error" TEXT,

    CONSTRAINT "med_source_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "med_school_slug_key" ON "med_school"("slug");

-- CreateIndex
CREATE INDEX "med_school_degree_state_idx" ON "med_school"("degree", "state");

-- CreateIndex
CREATE INDEX "med_school_alias_schoolId_idx" ON "med_school_alias"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "med_school_alias_source_sourceKey_key" ON "med_school_alias"("source", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "med_school_alias_miss_source_sourceKey_key" ON "med_school_alias_miss"("source", "sourceKey");

-- CreateIndex
CREATE INDEX "med_cycle_count_schoolId_cycleYear_idx" ON "med_cycle_count"("schoolId", "cycleYear");

-- CreateIndex
CREATE INDEX "med_cycle_count_cycleYear_date_idx" ON "med_cycle_count"("cycleYear", "date");

-- CreateIndex
CREATE UNIQUE INDEX "med_cycle_count_schoolId_program_cycleYear_date_eventType_s_key" ON "med_cycle_count"("schoolId", "program", "cycleYear", "date", "eventType", "source");

-- CreateIndex
CREATE UNIQUE INDEX "med_cycle_event_dedupeHash_key" ON "med_cycle_event"("dedupeHash");

-- CreateIndex
CREATE INDEX "med_cycle_event_occurredAt_idx" ON "med_cycle_event"("occurredAt");

-- CreateIndex
CREATE INDEX "med_cycle_event_schoolId_cycleYear_idx" ON "med_cycle_event"("schoolId", "cycleYear");

-- CreateIndex
CREATE UNIQUE INDEX "med_school_stats_schoolId_program_cycleYear_key" ON "med_school_stats"("schoolId", "program", "cycleYear");

-- CreateIndex
CREATE INDEX "med_source_run_source_job_startedAt_idx" ON "med_source_run"("source", "job", "startedAt");

-- AddForeignKey
ALTER TABLE "med_school_alias" ADD CONSTRAINT "med_school_alias_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_cycle_count" ADD CONSTRAINT "med_cycle_count_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_cycle_event" ADD CONSTRAINT "med_cycle_event_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_school_stats" ADD CONSTRAINT "med_school_stats_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;

