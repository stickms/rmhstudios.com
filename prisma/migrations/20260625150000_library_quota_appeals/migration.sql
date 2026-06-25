-- Per-user library upload quota override (null → default cap).
ALTER TABLE "user" ADD COLUMN "libraryUploadQuota" INTEGER;

-- Quota-increase appeals, reviewed by an admin.
CREATE TABLE "library_quota_request" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestedTotal" INTEGER NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "decidedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "library_quota_request_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "library_quota_request_status_idx" ON "library_quota_request"("status");
CREATE INDEX "library_quota_request_userId_idx" ON "library_quota_request"("userId");
ALTER TABLE "library_quota_request"
  ADD CONSTRAINT "library_quota_request_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
