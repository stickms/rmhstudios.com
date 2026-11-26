-- s15-16 removal-appeals: a record of each report takedown of a member's item, so its author is told and can ask once
-- for a second look. A new table, so nothing existing changes.
CREATE TABLE "content_removal" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "entityType" VARCHAR(32) NOT NULL,
    "entityId" VARCHAR(64) NOT NULL,
    "authorId" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversible" BOOLEAN NOT NULL,
    "reviewRequestedAt" TIMESTAMP(3),
    "reviewNote" VARCHAR(500),
    "reviewDecidedAt" TIMESTAMP(3),
    "reviewOutcome" VARCHAR(8),
    "reviewedById" TEXT,

    CONSTRAINT "content_removal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_removal_reportId_key" ON "content_removal"("reportId");

CREATE INDEX "content_removal_authorId_removedAt_idx" ON "content_removal"("authorId", "removedAt" DESC);

CREATE INDEX "content_removal_reviewDecidedAt_reviewRequestedAt_idx" ON "content_removal"("reviewDecidedAt", "reviewRequestedAt");

ALTER TABLE "content_removal" ADD CONSTRAINT "content_removal_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
