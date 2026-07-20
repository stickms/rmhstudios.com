-- CreateTable
CREATE TABLE "content_award" (
    "id" TEXT NOT NULL,
    "awardId" VARCHAR(32) NOT NULL,
    "giverId" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "entityType" VARCHAR(24) NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_award_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_award_entityType_entityId_idx" ON "content_award"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "content_award_giverId_createdAt_idx" ON "content_award"("giverId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "content_award" ADD CONSTRAINT "content_award_giverId_fkey" FOREIGN KEY ("giverId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

