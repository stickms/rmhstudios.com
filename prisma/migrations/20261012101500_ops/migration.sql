-- CreateTable
CREATE TABLE "cohort_retention" (
    "cohortWeek" DATE NOT NULL,
    "weeksLater" INTEGER NOT NULL,
    "cohortSize" INTEGER NOT NULL,
    "active" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cohort_retention_pkey" PRIMARY KEY ("cohortWeek","weeksLater")
);

-- CreateTable
CREATE TABLE "targeted_notice" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "linkUrl" VARCHAR(300),
    "segment" VARCHAR(12) NOT NULL,
    "segmentValue" VARCHAR(64),
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "targeted_notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "targeted_notice_dismissal" (
    "noticeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "targeted_notice_dismissal_pkey" PRIMARY KEY ("noticeId","userId")
);

-- CreateTable
CREATE TABLE "route_view_day" (
    "route" VARCHAR(120) NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "route_view_day_pkey" PRIMARY KEY ("route","day")
);

-- CreateTable
CREATE TABLE "client_error_group" (
    "id" TEXT NOT NULL,
    "fingerprint" VARCHAR(40) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "topFrame" VARCHAR(300) NOT NULL,
    "source" VARCHAR(64) NOT NULL,
    "sampleUrl" VARCHAR(500) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstRelease" VARCHAR(40) NOT NULL,
    "lastRelease" VARCHAR(40) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "regressedAt" TIMESTAMP(3),

    CONSTRAINT "client_error_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    "testPct" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),

    CONSTRAINT "experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_exposure" (
    "experimentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "variant" VARCHAR(8) NOT NULL,
    "exposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" TIMESTAMP(3),

    CONSTRAINT "experiment_exposure_pkey" PRIMARY KEY ("experimentId","userId")
);

-- CreateIndex
CREATE INDEX "targeted_notice_archivedAt_startsAt_idx" ON "targeted_notice"("archivedAt", "startsAt");

-- CreateIndex
CREATE INDEX "targeted_notice_dismissal_userId_idx" ON "targeted_notice_dismissal"("userId");

-- CreateIndex
CREATE INDEX "route_view_day_day_idx" ON "route_view_day"("day");

-- CreateIndex
CREATE UNIQUE INDEX "client_error_group_fingerprint_key" ON "client_error_group"("fingerprint");

-- CreateIndex
CREATE INDEX "client_error_group_lastSeenAt_idx" ON "client_error_group"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_key_key" ON "experiment"("key");

-- CreateIndex
CREATE INDEX "experiment_exposure_experimentId_variant_idx" ON "experiment_exposure"("experimentId", "variant");

-- CreateIndex
CREATE INDEX "experiment_exposure_userId_idx" ON "experiment_exposure"("userId");

-- AddForeignKey
ALTER TABLE "targeted_notice_dismissal" ADD CONSTRAINT "targeted_notice_dismissal_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "targeted_notice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "targeted_notice_dismissal" ADD CONSTRAINT "targeted_notice_dismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_exposure" ADD CONSTRAINT "experiment_exposure_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_exposure" ADD CONSTRAINT "experiment_exposure_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

