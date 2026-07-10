-- CreateEnum
CREATE TYPE "LadderPlatform" AS ENUM ('greenhouse', 'lever', 'ashby', 'smartrecruiters', 'manual', 'generic');

-- CreateEnum
CREATE TYPE "LadderSourceStatus" AS ENUM ('active', 'unconfigured', 'blocked', 'error', 'disabled');

-- CreateEnum
CREATE TYPE "LadderJobStatus" AS ENUM ('active', 'expired', 'unknown');

-- CreateEnum
CREATE TYPE "LadderRemoteStatus" AS ENUM ('onsite', 'hybrid', 'remote_us');

-- CreateEnum
CREATE TYPE "LadderEmploymentType" AS ENUM ('internship', 'full_time');

-- CreateEnum
CREATE TYPE "LadderProgramType" AS ENUM ('internship', 'summer_analyst', 'summer_associate', 'analyst_program', 'rotational_program', 'new_grad', 'leadership_development', 'entry_level', 'mba', 'other');

-- CreateEnum
CREATE TYPE "LadderEarlyCareer" AS ENUM ('yes', 'probable', 'no', 'unclear');

-- CreateEnum
CREATE TYPE "LadderVerificationStatus" AS ENUM ('verified_active', 'verified_probable', 'unverified', 'expired', 'broken_link', 'duplicate', 'non_us_role', 'blocked_or_inaccessible', 'needs_manual_review');

-- CreateEnum
CREATE TYPE "LadderReviewReason" AS ENUM ('broken_link', 'blocked', 'js_required', 'possible_duplicate', 'ambiguous_early_career', 'ambiguous_us_location', 'low_confidence', 'aggregator_unconfirmed', 'mass_expiry_suspected');

-- CreateEnum
CREATE TYPE "LadderReviewStatus" AS ENUM ('open', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "LadderRunTrigger" AS ENUM ('cron', 'manual');

-- CreateEnum
CREATE TYPE "LadderKeywordType" AS ENUM ('boost', 'block');

-- CreateEnum
CREATE TYPE "LadderJobActionType" AS ENUM ('saved', 'applied', 'ignored');

-- CreateEnum
CREATE TYPE "LadderApplicationStatus" AS ENUM ('not_applied', 'planning', 'applied', 'networking', 'interviewing', 'final_round', 'rejected', 'offer', 'withdrawn');

-- CreateEnum
CREATE TYPE "LadderAlertChannel" AS ENUM ('in_app', 'email', 'discord');

-- CreateEnum
CREATE TYPE "LadderAlertType" AS ENUM ('immediate', 'daily_digest', 'weekly_digest', 'deadline', 'changed', 'expired', 'review_needed');

-- CreateEnum
CREATE TYPE "LadderDigestFrequency" AS ENUM ('immediate', 'daily', 'weekly');

-- AlterTable
ALTER TABLE "user_quest" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "ladder_company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "firmType" TEXT NOT NULL,
    "priorityLevel" INTEGER NOT NULL DEFAULT 3,
    "careerUrl" TEXT,
    "usEarlyCareerUrl" TEXT,
    "campusUrl" TEXT,
    "notes" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ladder_company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_source" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "platform" "LadderPlatform" NOT NULL,
    "slug" TEXT,
    "url" TEXT,
    "status" "LadderSourceStatus" NOT NULL DEFAULT 'unconfigured',
    "lastSuccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ladder_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_job" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "roleCategory" TEXT,
    "programType" "LadderProgramType" NOT NULL DEFAULT 'other',
    "industry" TEXT,
    "locationRaw" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "remoteStatus" "LadderRemoteStatus" NOT NULL DEFAULT 'onsite',
    "employmentType" "LadderEmploymentType" NOT NULL DEFAULT 'internship',
    "postingDate" TIMESTAMP(3),
    "applicationDeadline" TIMESTAMP(3),
    "startSeason" TEXT,
    "graduationYearTarget" INTEGER,
    "schoolYearTarget" TEXT,
    "sourcePlatform" "LadderPlatform" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "originalPostingUrl" TEXT NOT NULL,
    "canonicalApplyUrl" TEXT,
    "externalRequisitionId" TEXT,
    "externalId" TEXT,
    "descriptionSummary" TEXT,
    "fullDescription" TEXT,
    "dedupeHash" TEXT NOT NULL,
    "alternateUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matchingKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "LadderJobStatus" NOT NULL DEFAULT 'unknown',
    "failedCheckCount" INTEGER NOT NULL DEFAULT 0,
    "earlyCareerScore" INTEGER NOT NULL DEFAULT 0,
    "earlyCareerClassification" "LadderEarlyCareer" NOT NULL DEFAULT 'unclear',
    "usLocationConfidence" INTEGER NOT NULL DEFAULT 0,
    "relevanceScoreBase" INTEGER NOT NULL DEFAULT 0,
    "urgencyFlag" BOOLEAN NOT NULL DEFAULT false,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),

    CONSTRAINT "ladder_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_verification" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "LadderVerificationStatus" NOT NULL,
    "confidence" INTEGER NOT NULL,
    "evidence" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ladder_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_scrape_run" (
    "id" TEXT NOT NULL,
    "trigger" "LadderRunTrigger" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedCount" INTEGER NOT NULL DEFAULT 0,
    "expiredCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "stats" JSONB,

    CONSTRAINT "ladder_scrape_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_source_error" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "errorClass" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ladder_source_error_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_review_task" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "sourceId" TEXT,
    "reason" "LadderReviewReason" NOT NULL,
    "status" "LadderReviewStatus" NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ladder_review_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_relevance_rule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ladder_relevance_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_user_prefs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "relevanceThreshold" INTEGER NOT NULL DEFAULT 60,
    "preferredCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredProgramTypes" "LadderProgramType"[] DEFAULT ARRAY[]::"LadderProgramType"[],
    "digestFrequency" "LadderDigestFrequency" NOT NULL DEFAULT 'daily',
    "channelInApp" BOOLEAN NOT NULL DEFAULT true,
    "channelEmail" BOOLEAN NOT NULL DEFAULT false,
    "channelDiscord" BOOLEAN NOT NULL DEFAULT false,
    "discordUserId" TEXT,

    CONSTRAINT "ladder_user_prefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_keyword" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 10,
    "type" "LadderKeywordType" NOT NULL DEFAULT 'boost',

    CONSTRAINT "ladder_keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_watchlist_entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "ladder_watchlist_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_job_action" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "action" "LadderJobActionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ladder_job_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "LadderApplicationStatus" NOT NULL DEFAULT 'not_applied',
    "appliedDate" TIMESTAMP(3),
    "resumeVersion" TEXT,
    "coverLetter" TEXT,
    "referralName" TEXT,
    "contactEmail" TEXT,
    "notes" TEXT,
    "followUpDate" TIMESTAMP(3),
    "interviewDates" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[],
    "outcome" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ladder_application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "channel" "LadderAlertChannel" NOT NULL,
    "type" "LadderAlertType" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "ladder_alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ladder_company_normalizedName_key" ON "ladder_company"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "ladder_source_companyId_platform_slug_key" ON "ladder_source"("companyId", "platform", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ladder_job_dedupeHash_key" ON "ladder_job"("dedupeHash");

-- CreateIndex
CREATE INDEX "ladder_job_status_earlyCareerClassification_idx" ON "ladder_job"("status", "earlyCareerClassification");

-- CreateIndex
CREATE INDEX "ladder_job_companyId_status_idx" ON "ladder_job"("companyId", "status");

-- CreateIndex
CREATE INDEX "ladder_verification_jobId_checkedAt_idx" ON "ladder_verification"("jobId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ladder_relevance_rule_key_key" ON "ladder_relevance_rule"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ladder_user_prefs_userId_key" ON "ladder_user_prefs"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ladder_keyword_userId_keyword_type_key" ON "ladder_keyword"("userId", "keyword", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ladder_watchlist_entry_userId_companyId_key" ON "ladder_watchlist_entry"("userId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ladder_job_action_userId_jobId_key" ON "ladder_job_action"("userId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ladder_application_userId_jobId_key" ON "ladder_application"("userId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ladder_alert_userId_jobId_type_key" ON "ladder_alert"("userId", "jobId", "type");

-- AddForeignKey
ALTER TABLE "ladder_source" ADD CONSTRAINT "ladder_source_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ladder_company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_job" ADD CONSTRAINT "ladder_job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ladder_company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_verification" ADD CONSTRAINT "ladder_verification_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ladder_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_source_error" ADD CONSTRAINT "ladder_source_error_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ladder_scrape_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_source_error" ADD CONSTRAINT "ladder_source_error_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ladder_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_review_task" ADD CONSTRAINT "ladder_review_task_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ladder_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_review_task" ADD CONSTRAINT "ladder_review_task_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ladder_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_user_prefs" ADD CONSTRAINT "ladder_user_prefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_keyword" ADD CONSTRAINT "ladder_keyword_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_watchlist_entry" ADD CONSTRAINT "ladder_watchlist_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_watchlist_entry" ADD CONSTRAINT "ladder_watchlist_entry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ladder_company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_job_action" ADD CONSTRAINT "ladder_job_action_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_job_action" ADD CONSTRAINT "ladder_job_action_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ladder_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_application" ADD CONSTRAINT "ladder_application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_application" ADD CONSTRAINT "ladder_application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ladder_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_alert" ADD CONSTRAINT "ladder_alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_alert" ADD CONSTRAINT "ladder_alert_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ladder_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

