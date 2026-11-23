-- CreateEnum
CREATE TYPE "MedForecastMode" AS ENUM ('FULL', 'EARLY', 'NONE');

-- CreateTable
CREATE TABLE "med_forecast" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "program" "MedProgram" NOT NULL,
    "cycleYear" INTEGER NOT NULL,
    "eventType" "MedEventType" NOT NULL,
    "modelVersion" INTEGER NOT NULL,
    "mode" "MedForecastMode" NOT NULL,
    "source" "MedSource",
    "asOf" DATE NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "curve" JSONB NOT NULL,
    "summary" JSONB NOT NULL,

    CONSTRAINT "med_forecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "med_wait_curve" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "program" "MedProgram" NOT NULL,
    "asOf" DATE NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "members" INTEGER NOT NULL,
    "invited" INTEGER NOT NULL,
    "maxDay" INTEGER NOT NULL,
    "curve" JSONB NOT NULL,

    CONSTRAINT "med_wait_curve_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "med_forecast_cycleYear_idx" ON "med_forecast"("cycleYear");

-- CreateIndex
CREATE UNIQUE INDEX "med_forecast_schoolId_program_cycleYear_eventType_key" ON "med_forecast"("schoolId", "program", "cycleYear", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "med_wait_curve_schoolId_program_key" ON "med_wait_curve"("schoolId", "program");

-- AddForeignKey
ALTER TABLE "med_forecast" ADD CONSTRAINT "med_forecast_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "med_wait_curve" ADD CONSTRAINT "med_wait_curve_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;
