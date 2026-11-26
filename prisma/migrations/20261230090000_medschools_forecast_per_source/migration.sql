-- One stored forecast per source (the header's CycleTrack / Admit.org toggle picks which one the Forecast tab shows).
-- The job never wrote a null source, so the delete is a guard; every existing row keeps its source and its key.
DELETE FROM "med_forecast" WHERE "source" IS NULL;

ALTER TABLE "med_forecast" ALTER COLUMN "source" SET NOT NULL;

DROP INDEX "med_forecast_schoolId_program_cycleYear_eventType_key";

CREATE UNIQUE INDEX "med_forecast_schoolId_program_cycleYear_eventType_source_key" ON "med_forecast"("schoolId", "program", "cycleYear", "eventType", "source");
