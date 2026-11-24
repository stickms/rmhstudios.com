-- CreateEnum
CREATE TYPE "MedFactSource" AS ENUM ('AAMC_MSAR_REPORT', 'SCHOOL_PROFILE');

-- CreateTable
CREATE TABLE "med_school_fact" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "program" "MedProgram" NOT NULL DEFAULT 'REG',
    "cycleYear" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "valueNum" DOUBLE PRECISION,
    "valueText" TEXT,
    "valueJson" JSONB,
    "note" TEXT,
    "source" "MedFactSource" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "reportId" INTEGER,
    "page" INTEGER,
    "checkedOn" DATE NOT NULL,

    CONSTRAINT "med_school_fact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "med_school_fact_schoolId_idx" ON "med_school_fact"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "med_school_fact_schoolId_program_cycleYear_kind_source_key" ON "med_school_fact"("schoolId", "program", "cycleYear", "kind", "source");

-- AddForeignKey
ALTER TABLE "med_school_fact" ADD CONSTRAINT "med_school_fact_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;
