-- RMH Med Schools phase D: a member's own applicant stats. Additive: four new tables, nothing changed or dropped.

-- CreateTable
CREATE TABLE "med_applicant_profile" (
    "userId" TEXT NOT NULL,
    "gpaCumulative" DOUBLE PRECISION,
    "gpaScience" DOUBLE PRECISION,
    "gpaPostbacc" DOUBLE PRECISION,
    "postbaccType" VARCHAR(16),
    "gpaGraduate" DOUBLE PRECISION,
    "graduateType" VARCHAR(16),
    "missions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publications" INTEGER,
    "presentations" INTEGER,
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "med_applicant_profile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "med_mcat_attempt" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "day" INTEGER,
    "total" INTEGER,
    "cpbs" INTEGER,
    "cars" INTEGER,
    "bbls" INTEGER,
    "psbb" INTEGER,
    "position" INTEGER NOT NULL,

    CONSTRAINT "med_mcat_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_applicant_hours" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "category" VARCHAR(24) NOT NULL,
    "hours" INTEGER,
    "note" VARCHAR(300),

    CONSTRAINT "med_applicant_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_applicant_activity" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "category" VARCHAR(24) NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "hours" INTEGER,
    "note" VARCHAR(300),
    "position" INTEGER NOT NULL,

    CONSTRAINT "med_applicant_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "med_mcat_attempt_profileId_position_idx" ON "med_mcat_attempt"("profileId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "med_applicant_hours_profileId_category_key" ON "med_applicant_hours"("profileId", "category");

-- CreateIndex
CREATE INDEX "med_applicant_activity_profileId_position_idx" ON "med_applicant_activity"("profileId", "position");

-- AddForeignKey
ALTER TABLE "med_applicant_profile" ADD CONSTRAINT "med_applicant_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_mcat_attempt" ADD CONSTRAINT "med_mcat_attempt_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "med_applicant_profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_applicant_hours" ADD CONSTRAINT "med_applicant_hours_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "med_applicant_profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_applicant_activity" ADD CONSTRAINT "med_applicant_activity_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "med_applicant_profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
