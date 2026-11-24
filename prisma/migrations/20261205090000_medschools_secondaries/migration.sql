-- AlterEnum: a private tracker milestone (never shared as a public event); additive, existing rows are untouched.
ALTER TYPE "MedMilestoneType" ADD VALUE 'SECONDARY_SUBMITTED' AFTER 'SECONDARY';

-- CreateEnum
CREATE TYPE "MedPromptSource" AS ENUM ('ADMIT', 'SDN', 'SCHOOL');

-- CreateEnum
CREATE TYPE "MedLimitKind" AS ENUM ('WORDS', 'CHARS');

-- CreateEnum
CREATE TYPE "MedCheckStatus" AS ENUM ('OK', 'EMPTY', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "med_secondary_prompt" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "program" "MedProgram" NOT NULL,
    "key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "themes" TEXT[],
    "themesVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "med_secondary_prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_secondary_observation" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "cycleYear" INTEGER NOT NULL,
    "source" "MedPromptSource" NOT NULL,
    "limitKind" "MedLimitKind",
    "limitValue" INTEGER,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "sourceRef" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "med_secondary_observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_secondary_check" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "source" "MedPromptSource" NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "status" "MedCheckStatus" NOT NULL,
    "promptCount" INTEGER NOT NULL,

    CONSTRAINT "med_secondary_check_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "med_secondary_prompt_schoolId_idx" ON "med_secondary_prompt"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "med_secondary_prompt_schoolId_program_key_key" ON "med_secondary_prompt"("schoolId", "program", "key");

-- CreateIndex
CREATE INDEX "med_secondary_observation_cycleYear_idx" ON "med_secondary_observation"("cycleYear");

-- CreateIndex
CREATE UNIQUE INDEX "med_secondary_observation_promptId_cycleYear_source_key" ON "med_secondary_observation"("promptId", "cycleYear", "source");

-- CreateIndex
CREATE UNIQUE INDEX "med_secondary_check_schoolId_source_key" ON "med_secondary_check"("schoolId", "source");

-- AddForeignKey
ALTER TABLE "med_secondary_prompt" ADD CONSTRAINT "med_secondary_prompt_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_secondary_observation" ADD CONSTRAINT "med_secondary_observation_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "med_secondary_prompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_secondary_check" ADD CONSTRAINT "med_secondary_check_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;
