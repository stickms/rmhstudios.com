-- Expand RMHLadder source and delivery enums.
ALTER TYPE "LadderPlatform" ADD VALUE IF NOT EXISTS 'workday';
ALTER TYPE "LadderAlertChannel" ADD VALUE IF NOT EXISTS 'web_push';
ALTER TYPE "LadderAlertType" ADD VALUE IF NOT EXISTS 'saved_search';
ALTER TYPE "LadderAlertType" ADD VALUE IF NOT EXISTS 'follow_up';
ALTER TYPE "LadderAlertType" ADD VALUE IF NOT EXISTS 'interview';

CREATE TYPE "LadderResumeParseStatus" AS ENUM ('pending', 'processing', 'ready', 'needs_correction', 'failed');
CREATE TYPE "LadderResumeReviewStatus" AS ENUM ('pending', 'processing', 'complete', 'failed');
CREATE TYPE "LadderAiTaskKind" AS ENUM ('resume_parse', 'resume_review', 'job_profile', 'match_refresh');
CREATE TYPE "LadderAiTaskStatus" AS ENUM ('queued', 'processing', 'complete', 'failed');
CREATE TYPE "LadderAlertDeliveryStatus" AS ENUM ('pending', 'sent', 'skipped', 'failed');

-- Source health, probing, and platform-specific configuration.
ALTER TABLE "ladder_source"
  ADD COLUMN "config" JSONB,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lastProbedAt" TIMESTAMP(3),
  ADD COLUMN "nextProbeAt" TIMESTAMP(3),
  ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0;

-- Workday tenants can expose multiple independently paginated sites. Include
-- the site in the unique source slug so campus and general boards coexist.
UPDATE "ladder_source"
SET "slug" = ("config"->>'tenant') || ':' || ("config"->>'site')
WHERE "platform" = 'workday'
  AND "config"->>'tenant' IS NOT NULL
  AND "config"->>'site' IS NOT NULL;

-- Preserve authoritative source identity and structured job data.
ALTER TABLE "ladder_job"
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "descriptionText" TEXT,
  ADD COLUMN "contentHash" TEXT,
  ADD COLUMN "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "compensationMin" INTEGER,
  ADD COLUMN "compensationMax" INTEGER,
  ADD COLUMN "compensationCurrency" TEXT,
  ADD COLUMN "compensationInterval" TEXT,
  ADD COLUMN "sponsorshipStatus" TEXT,
  ADD COLUMN "lastSeenAt" TIMESTAMP(3);

WITH unique_sources AS (
  SELECT "companyId", "platform", MIN("id") AS "sourceId"
  FROM "ladder_source"
  GROUP BY "companyId", "platform"
  HAVING COUNT(*) = 1
)
UPDATE "ladder_job" AS job
SET "sourceId" = src."sourceId"
FROM unique_sources AS src
WHERE job."companyId" = src."companyId"
  AND job."sourcePlatform" = src."platform";

-- For companies with more than one board on the same ATS, recover source
-- identity from the exact board URL first, then from an unambiguous slug in
-- the stored source/posting URLs. Rows that cannot be assigned safely remain
-- nullable and can be reconciled by the normal duplicate-review workflow.
WITH exact_url_sources AS (
  SELECT job."id" AS "jobId", MIN(source."id") AS "sourceId"
  FROM "ladder_job" AS job
  JOIN "ladder_source" AS source
    ON source."companyId" = job."companyId"
   AND source."platform" = job."sourcePlatform"
   AND source."url" IS NOT NULL
   AND source."url" = job."sourceUrl"
  WHERE job."sourceId" IS NULL
  GROUP BY job."id"
  HAVING COUNT(*) = 1
)
UPDATE "ladder_job" AS job
SET "sourceId" = matched."sourceId"
FROM exact_url_sources AS matched
WHERE job."id" = matched."jobId";

WITH unambiguous_slug_sources AS (
  SELECT job."id" AS "jobId", MIN(source."id") AS "sourceId"
  FROM "ladder_job" AS job
  JOIN "ladder_source" AS source
    ON source."companyId" = job."companyId"
   AND source."platform" = job."sourcePlatform"
   AND source."slug" IS NOT NULL
   AND source."slug" <> ''
   AND (
     POSITION(LOWER(source."slug") IN LOWER(job."sourceUrl")) > 0
     OR POSITION(LOWER(source."slug") IN LOWER(job."originalPostingUrl")) > 0
   )
  WHERE job."sourceId" IS NULL
  GROUP BY job."id"
  HAVING COUNT(*) = 1
)
UPDATE "ladder_job" AS job
SET "sourceId" = matched."sourceId"
FROM unambiguous_slug_sources AS matched
WHERE job."id" = matched."jobId";

UPDATE "ladder_job"
SET "descriptionText" = "descriptionSummary",
    "lastSeenAt" = COALESCE("lastCheckedAt", "discoveredAt");

DROP INDEX IF EXISTS "ladder_job_dedupeHash_key";
CREATE INDEX "ladder_job_dedupeHash_idx" ON "ladder_job"("dedupeHash");

-- Preserve every legacy row while ensuring an existing external-ID collision
-- cannot abort deployment. The most recently checked row keeps the canonical
-- ID. Older rows copy the original value into externalRequisitionId when that
-- field is empty, then clear externalId; PostgreSQL permits multiple NULLs in
-- the new unique index and the fuzzy duplicate-review path retains visibility.
WITH ranked_external_ids AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "sourceId", "externalId"
      ORDER BY "lastCheckedAt" DESC NULLS LAST, "discoveredAt" DESC, "id"
    ) AS rank
  FROM "ladder_job"
  WHERE "sourceId" IS NOT NULL AND "externalId" IS NOT NULL
)
UPDATE "ladder_job" AS job
SET "externalRequisitionId" = COALESCE(job."externalRequisitionId", job."externalId"),
    "externalId" = NULL
FROM ranked_external_ids AS ranked
WHERE job."id" = ranked."id" AND ranked.rank > 1;

CREATE UNIQUE INDEX "ladder_job_sourceId_externalId_key" ON "ladder_job"("sourceId", "externalId");
ALTER TABLE "ladder_job"
  ADD CONSTRAINT "ladder_job_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "ladder_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ladder_user_prefs"
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN "quietHoursStart" INTEGER,
  ADD COLUMN "quietHoursEnd" INTEGER,
  ADD COLUMN "resumeMatchThreshold" INTEGER;

ALTER TABLE "ladder_application"
  ADD COLUMN "resumeVersionId" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Private, immutable resume versions.
CREATE TABLE "ladder_resume" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "activeVersionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ladder_resume_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ladder_resume_version" (
  "id" TEXT NOT NULL,
  "resumeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "parseStatus" "LadderResumeParseStatus" NOT NULL DEFAULT 'pending',
  "parseConfidence" INTEGER,
  "extractedTextEncrypted" TEXT,
  "redactedTextEncrypted" TEXT,
  "confirmedProfile" JSONB,
  "confirmedAt" TIMESTAMP(3),
  "matchesRefreshedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ladder_resume_version_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ladder_resume_activeVersionId_key" ON "ladder_resume"("activeVersionId");
CREATE INDEX "ladder_resume_userId_updatedAt_idx" ON "ladder_resume"("userId", "updatedAt");
CREATE UNIQUE INDEX "ladder_resume_version_resumeId_versionNumber_key" ON "ladder_resume_version"("resumeId", "versionNumber");
CREATE INDEX "ladder_resume_version_userId_createdAt_idx" ON "ladder_resume_version"("userId", "createdAt");
CREATE INDEX "ladder_resume_version_sha256_idx" ON "ladder_resume_version"("sha256");

ALTER TABLE "ladder_resume" ADD CONSTRAINT "ladder_resume_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ladder_resume_version" ADD CONSTRAINT "ladder_resume_version_resumeId_fkey"
  FOREIGN KEY ("resumeId") REFERENCES "ladder_resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ladder_resume_version" ADD CONSTRAINT "ladder_resume_version_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ladder_resume" ADD CONSTRAINT "ladder_resume_activeVersionId_fkey"
  FOREIGN KEY ("activeVersionId") REFERENCES "ladder_resume_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ladder_application" ADD CONSTRAINT "ladder_application_resumeVersionId_fkey"
  FOREIGN KEY ("resumeVersionId") REFERENCES "ladder_resume_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ladder_resume_review" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "resumeVersionId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" "LadderResumeReviewStatus" NOT NULL DEFAULT 'pending',
  "profile" JSONB,
  "review" JSONB,
  "promptVersion" TEXT NOT NULL DEFAULT '1',
  "schemaVersion" TEXT NOT NULL DEFAULT '1',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ladder_resume_review_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ladder_resume_review_userId_createdAt_idx" ON "ladder_resume_review"("userId", "createdAt");
CREATE INDEX "ladder_resume_review_resumeVersionId_createdAt_idx" ON "ladder_resume_review"("resumeVersionId", "createdAt");
ALTER TABLE "ladder_resume_review" ADD CONSTRAINT "ladder_resume_review_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ladder_resume_review" ADD CONSTRAINT "ladder_resume_review_resumeVersionId_fkey"
  FOREIGN KEY ("resumeVersionId") REFERENCES "ladder_resume_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ladder_job_profile" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "profile" JSONB NOT NULL,
  "profileVersion" TEXT NOT NULL DEFAULT '1',
  "sourceHash" TEXT NOT NULL,
  "provider" TEXT,
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ladder_job_profile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ladder_job_profile_jobId_key" ON "ladder_job_profile"("jobId");
CREATE INDEX "ladder_job_profile_sourceHash_idx" ON "ladder_job_profile"("sourceHash");
ALTER TABLE "ladder_job_profile" ADD CONSTRAINT "ladder_job_profile_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "ladder_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ladder_job_match" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "resumeVersionId" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "confidence" INTEGER NOT NULL,
  "breakdown" JSONB NOT NULL,
  "matchedSkills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "missingSkills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "explanation" TEXT,
  "scoreVersion" TEXT NOT NULL DEFAULT '1',
  "feedback" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ladder_job_match_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ladder_job_match_resumeVersionId_jobId_key" ON "ladder_job_match"("resumeVersionId", "jobId");
CREATE INDEX "ladder_job_match_userId_score_idx" ON "ladder_job_match"("userId", "score");
CREATE INDEX "ladder_job_match_jobId_score_idx" ON "ladder_job_match"("jobId", "score");
ALTER TABLE "ladder_job_match" ADD CONSTRAINT "ladder_job_match_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ladder_job_match" ADD CONSTRAINT "ladder_job_match_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "ladder_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ladder_job_match" ADD CONSTRAINT "ladder_job_match_resumeVersionId_fkey"
  FOREIGN KEY ("resumeVersionId") REFERENCES "ladder_resume_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ladder_ai_task" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "kind" "LadderAiTaskKind" NOT NULL,
  "status" "LadderAiTaskStatus" NOT NULL DEFAULT 'queued',
  "provider" TEXT,
  "resumeVersionId" TEXT,
  "jobId" TEXT,
  "inputRef" TEXT,
  "outputRef" TEXT,
  "dedupeKey" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "ladder_ai_task_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ladder_ai_task_status_createdAt_idx" ON "ladder_ai_task"("status", "createdAt");
CREATE INDEX "ladder_ai_task_userId_createdAt_idx" ON "ladder_ai_task"("userId", "createdAt");
CREATE UNIQUE INDEX "ladder_ai_task_dedupeKey_key" ON "ladder_ai_task"("dedupeKey");
ALTER TABLE "ladder_ai_task" ADD CONSTRAINT "ladder_ai_task_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ladder_ai_task" ADD CONSTRAINT "ladder_ai_task_resumeVersionId_fkey"
  FOREIGN KEY ("resumeVersionId") REFERENCES "ladder_resume_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ladder_ai_task" ADD CONSTRAINT "ladder_ai_task_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "ladder_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pipeline history, saved searches, event-based alerts, and privacy-safe analytics.
CREATE TABLE "ladder_application_event" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "fromStatus" "LadderApplicationStatus",
  "toStatus" "LadderApplicationStatus",
  "data" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ladder_application_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ladder_application_event_applicationId_createdAt_idx" ON "ladder_application_event"("applicationId", "createdAt");
CREATE INDEX "ladder_application_event_userId_createdAt_idx" ON "ladder_application_event"("userId", "createdAt");
ALTER TABLE "ladder_application_event" ADD CONSTRAINT "ladder_application_event_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "ladder_application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ladder_application_event" ADD CONSTRAINT "ladder_application_event_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ladder_saved_search" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "filters" JSONB NOT NULL,
  "alertsOn" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ladder_saved_search_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ladder_saved_search_userId_updatedAt_idx" ON "ladder_saved_search"("userId", "updatedAt");
ALTER TABLE "ladder_saved_search" ADD CONSTRAINT "ladder_saved_search_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ladder_alert_event" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "jobId" TEXT,
  "type" "LadderAlertType" NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "payload" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ladder_alert_event_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ladder_alert_event_userId_type_fingerprint_key" ON "ladder_alert_event"("userId", "type", "fingerprint");
CREATE INDEX "ladder_alert_event_userId_createdAt_idx" ON "ladder_alert_event"("userId", "createdAt");
ALTER TABLE "ladder_alert_event" ADD CONSTRAINT "ladder_alert_event_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ladder_alert_event" ADD CONSTRAINT "ladder_alert_event_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "ladder_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ladder_alert_delivery" (
  "id" TEXT NOT NULL,
  "alertId" TEXT NOT NULL,
  "channel" "LadderAlertChannel" NOT NULL,
  "status" "LadderAlertDeliveryStatus" NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ladder_alert_delivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ladder_alert_delivery_alertId_channel_key" ON "ladder_alert_delivery"("alertId", "channel");
CREATE INDEX "ladder_alert_delivery_status_createdAt_idx" ON "ladder_alert_delivery"("status", "createdAt");
ALTER TABLE "ladder_alert_delivery" ADD CONSTRAINT "ladder_alert_delivery_alertId_fkey"
  FOREIGN KEY ("alertId") REFERENCES "ladder_alert_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ladder_product_event" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "jobId" TEXT,
  "type" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ladder_product_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ladder_product_event_type_createdAt_idx" ON "ladder_product_event"("type", "createdAt");
CREATE INDEX "ladder_product_event_userId_createdAt_idx" ON "ladder_product_event"("userId", "createdAt");
ALTER TABLE "ladder_product_event" ADD CONSTRAINT "ladder_product_event_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ladder_product_event" ADD CONSTRAINT "ladder_product_event_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "ladder_job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ladder_worker_lease" (
  "name" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ladder_worker_lease_pkey" PRIMARY KEY ("name")
);
