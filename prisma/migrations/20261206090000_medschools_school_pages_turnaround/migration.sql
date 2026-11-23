-- CreateTable
CREATE TABLE "med_school_admissions_policy" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "program" "MedProgram" NOT NULL,
    "rolling" BOOLEAN NOT NULL,
    "evidence" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "checkedOn" DATE NOT NULL,
    "source" "MedPromptSource" NOT NULL DEFAULT 'SCHOOL',

    CONSTRAINT "med_school_admissions_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_secondary_turnaround" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "program" "MedProgram" NOT NULL,
    "asOf" DATE NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "members" INTEGER NOT NULL,
    "p25Days" INTEGER NOT NULL,
    "medianDays" INTEGER NOT NULL,
    "p75Days" INTEGER NOT NULL,

    CONSTRAINT "med_secondary_turnaround_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "med_school_admissions_policy_schoolId_program_key" ON "med_school_admissions_policy"("schoolId", "program");

-- CreateIndex
CREATE UNIQUE INDEX "med_secondary_turnaround_schoolId_program_key" ON "med_secondary_turnaround"("schoolId", "program");

-- AddForeignKey
ALTER TABLE "med_school_admissions_policy" ADD CONSTRAINT "med_school_admissions_policy_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_secondary_turnaround" ADD CONSTRAINT "med_secondary_turnaround_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;
