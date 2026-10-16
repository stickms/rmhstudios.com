-- P22 ladder-homes (F6 F7 F8 F9): additive only — four nullable pay columns on
-- "ladder_job" and four new tables.
--
-- migration-safety: acknowledged[create-index-not-concurrent] the one index on
-- "ladder_job" (status, payMaxAnnual) takes a SHARE lock (reads continue, writes wait);
-- the table is the curated early-career job catalogue (thousands of rows, written only
-- by the scheduled scrape worker), so the build is sub-second. The rest are new, empty tables.

-- AlterTable
ALTER TABLE "ladder_job" ADD COLUMN     "payCurrency" VARCHAR(3),
ADD COLUMN     "payMaxAnnual" INTEGER,
ADD COLUMN     "payMinAnnual" INTEGER,
ADD COLUMN     "payPeriod" VARCHAR(8);

-- CreateTable
CREATE TABLE "ladder_referral_offer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" VARCHAR(120) NOT NULL,
    "normalizedCompany" VARCHAR(120) NOT NULL,
    "roles" VARCHAR(200) NOT NULL,
    "note" VARCHAR(500),
    "capacity" INTEGER NOT NULL DEFAULT 3,
    "status" VARCHAR(8) NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ladder_referral_offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_referral_request" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "pitch" VARCHAR(600) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ladder_referral_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ladder_interview_report" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "roleTitle" VARCHAR(120) NOT NULL,
    "rounds" INTEGER NOT NULL,
    "questionTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outcome" VARCHAR(10) NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "body" VARCHAR(2000),
    "status" VARCHAR(8) NOT NULL DEFAULT 'visible',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ladder_interview_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_roommate_profile" (
    "userId" TEXT NOT NULL,
    "sleep" INTEGER NOT NULL,
    "guests" INTEGER NOT NULL,
    "cleanliness" INTEGER NOT NULL,
    "noise" INTEGER NOT NULL,
    "pets" VARCHAR(5) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_roommate_profile_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "ladder_referral_offer_status_normalizedCompany_createdAt_idx" ON "ladder_referral_offer"("status", "normalizedCompany", "createdAt");

-- CreateIndex
CREATE INDEX "ladder_referral_offer_userId_status_idx" ON "ladder_referral_offer"("userId", "status");

-- CreateIndex
CREATE INDEX "ladder_referral_request_offerId_status_createdAt_idx" ON "ladder_referral_request"("offerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ladder_referral_request_applicantId_status_createdAt_idx" ON "ladder_referral_request"("applicantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ladder_referral_request_offerId_applicantId_key" ON "ladder_referral_request"("offerId", "applicantId");

-- CreateIndex
CREATE INDEX "ladder_interview_report_companyId_status_createdAt_idx" ON "ladder_interview_report"("companyId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ladder_interview_report_userId_createdAt_idx" ON "ladder_interview_report"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ladder_job_status_payMaxAnnual_idx" ON "ladder_job"("status", "payMaxAnnual");

-- AddForeignKey
ALTER TABLE "ladder_referral_offer" ADD CONSTRAINT "ladder_referral_offer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_referral_request" ADD CONSTRAINT "ladder_referral_request_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ladder_referral_offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_referral_request" ADD CONSTRAINT "ladder_referral_request_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_interview_report" ADD CONSTRAINT "ladder_interview_report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ladder_interview_report" ADD CONSTRAINT "ladder_interview_report_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ladder_company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_roommate_profile" ADD CONSTRAINT "home_roommate_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

