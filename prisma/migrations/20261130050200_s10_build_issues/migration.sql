-- Bug reports on user builds (s10-09). Additive: two new tables.
CREATE TABLE "build_issue" (
    "id" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "steps" VARCHAR(2000),
    "versionId" TEXT,
    "platform" VARCHAR(10) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "fixedInId" TEXT,
    "wontFixReason" VARCHAR(200),
    "duplicateOfId" TEXT,
    "hiddenAt" TIMESTAMP(3),
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "statusChangedAt" TIMESTAMP(3),

    CONSTRAINT "build_issue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "build_issue_vote" (
    "issueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "build_issue_vote_pkey" PRIMARY KEY ("issueId","userId")
);

CREATE INDEX "build_issue_buildId_status_createdAt_idx" ON "build_issue"("buildId", "status", "createdAt");
CREATE INDEX "build_issue_reporterId_createdAt_idx" ON "build_issue"("reporterId", "createdAt");
CREATE INDEX "build_issue_vote_userId_idx" ON "build_issue_vote"("userId");

ALTER TABLE "build_issue" ADD CONSTRAINT "build_issue_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "user_build"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "build_issue" ADD CONSTRAINT "build_issue_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "build_issue" ADD CONSTRAINT "build_issue_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "build_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "build_issue" ADD CONSTRAINT "build_issue_fixedInId_fkey" FOREIGN KEY ("fixedInId") REFERENCES "build_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "build_issue" ADD CONSTRAINT "build_issue_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "build_issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "build_issue_vote" ADD CONSTRAINT "build_issue_vote_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "build_issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "build_issue_vote" ADD CONSTRAINT "build_issue_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
