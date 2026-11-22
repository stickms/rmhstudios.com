-- Deletion tombstones for the sync APIs (s09-10): ids, kind and time only. One new table; nothing existing changes.

-- CreateTable
CREATE TABLE "sync_tombstone" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "entityId" VARCHAR(200) NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_tombstone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_tombstone_userId_kind_deletedAt_idx" ON "sync_tombstone"("userId", "kind", "deletedAt");

-- CreateIndex
CREATE INDEX "sync_tombstone_deletedAt_idx" ON "sync_tombstone"("deletedAt");

-- AddForeignKey
ALTER TABLE "sync_tombstone" ADD CONSTRAINT "sync_tombstone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
