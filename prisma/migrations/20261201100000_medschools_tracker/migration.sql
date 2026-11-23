-- RMH Med Schools phase 4: private tracker, school lists and preferences.
-- Additive only: three enums and six tables. Nothing in `med_cycle_event` changes: an anonymous shared event has no
-- column that points at a tracker row (its hash is recomputed from the server secret, never stored here).

-- CreateEnum
CREATE TYPE "MedMilestoneType" AS ENUM ('SUBMITTED', 'COMPLETE', 'SECONDARY', 'INTERVIEW', 'WAITLIST', 'REJECTION', 'ACCEPTANCE', 'WITHDRAWN', 'HOLD');

-- CreateEnum
CREATE TYPE "MedProgramFilter" AS ENUM ('ALL', 'REG', 'PHD');

-- CreateEnum
CREATE TYPE "MedListProgram" AS ENUM ('ANY', 'REG', 'PHD');

-- CreateTable
CREATE TABLE "med_tracker_cycle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cycleYear" INTEGER NOT NULL,
    "homeState" VARCHAR(2),
    "shareAnonymously" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "med_tracker_cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_tracker_application" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "program" "MedProgram" NOT NULL,
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "med_tracker_application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_tracker_milestone" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "MedMilestoneType" NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "med_tracker_milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_school_list" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "med_school_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_school_list_item" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "program" "MedListProgram" NOT NULL DEFAULT 'ANY',
    "position" INTEGER NOT NULL,
    "note" VARCHAR(500),
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "med_school_list_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_user_prefs" (
    "userId" TEXT NOT NULL,
    "programFilter" "MedProgramFilter" NOT NULL DEFAULT 'ALL',
    "degree" "MedDegree",
    "homeState" VARCHAR(2),
    "chartCategories" "MedEventType"[] DEFAULT ARRAY[]::"MedEventType"[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "med_user_prefs_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "med_tracker_cycle_userId_idx" ON "med_tracker_cycle"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "med_tracker_cycle_userId_cycleYear_key" ON "med_tracker_cycle"("userId", "cycleYear");

-- CreateIndex
CREATE INDEX "med_tracker_application_schoolId_idx" ON "med_tracker_application"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "med_tracker_application_cycleId_schoolId_program_key" ON "med_tracker_application"("cycleId", "schoolId", "program");

-- CreateIndex
CREATE UNIQUE INDEX "med_tracker_milestone_applicationId_type_key" ON "med_tracker_milestone"("applicationId", "type");

-- CreateIndex
CREATE INDEX "med_school_list_userId_position_idx" ON "med_school_list"("userId", "position");

-- CreateIndex
CREATE INDEX "med_school_list_item_listId_position_idx" ON "med_school_list_item"("listId", "position");

-- CreateIndex
CREATE INDEX "med_school_list_item_schoolId_idx" ON "med_school_list_item"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "med_school_list_item_listId_schoolId_program_key" ON "med_school_list_item"("listId", "schoolId", "program");

-- AddForeignKey
ALTER TABLE "med_tracker_cycle" ADD CONSTRAINT "med_tracker_cycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_tracker_application" ADD CONSTRAINT "med_tracker_application_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "med_tracker_cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_tracker_application" ADD CONSTRAINT "med_tracker_application_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_tracker_milestone" ADD CONSTRAINT "med_tracker_milestone_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "med_tracker_application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_school_list" ADD CONSTRAINT "med_school_list_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_school_list_item" ADD CONSTRAINT "med_school_list_item_listId_fkey" FOREIGN KEY ("listId") REFERENCES "med_school_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_school_list_item" ADD CONSTRAINT "med_school_list_item_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_user_prefs" ADD CONSTRAINT "med_user_prefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
