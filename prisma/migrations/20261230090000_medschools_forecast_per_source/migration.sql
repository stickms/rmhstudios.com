-- rmh:contract-ok Two rows per forecast key cannot coexist with the old unique index, so this swap is a contract step by
-- nature. The previous release's only writer is the 06:40 forecast job (it always wrote a non-null source, so SET NOT NULL
-- rejects nothing); on a rollback that job fails until the next forward deploy and its reader serves a stored row. The
-- table is derived data, rebuilt in full by the next run.
-- migration-safety: acknowledged[set-not-null] the previous release always wrote a non-null source, so no insert is rejected
-- migration-safety: acknowledged[create-index-not-concurrent] med_forecast holds a few thousand derived rows and is written once a day at 06:40 UTC
-- One stored forecast per source (the header's CycleTrack / Admit.org toggle picks which one the Forecast tab shows).
-- The job never wrote a null source, so the delete is a guard; every existing row keeps its source and its key.
DELETE FROM "med_forecast" WHERE "source" IS NULL;

ALTER TABLE "med_forecast" ALTER COLUMN "source" SET NOT NULL;

DROP INDEX "med_forecast_schoolId_program_cycleYear_eventType_key";

CREATE UNIQUE INDEX "med_forecast_schoolId_program_cycleYear_eventType_source_key" ON "med_forecast"("schoolId", "program", "cycleYear", "eventType", "source");
