-- CreateTable
CREATE TABLE "world_snapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "world_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "world_postcard" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" VARCHAR(160) NOT NULL,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "world_postcard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garden_watering" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "garden_watering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_festival_entry" (
    "id" TEXT NOT NULL,
    "festivalKey" VARCHAR(32) NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "score" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farm_festival_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "world_snapshot_code_key" ON "world_snapshot"("code");

-- CreateIndex
CREATE UNIQUE INDEX "world_snapshot_userId_kind_key" ON "world_snapshot"("userId", "kind");

-- CreateIndex
CREATE INDEX "world_postcard_snapshotId_createdAt_idx" ON "world_postcard"("snapshotId", "createdAt");

-- CreateIndex
CREATE INDEX "world_postcard_authorId_idx" ON "world_postcard"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "world_postcard_snapshotId_authorId_key" ON "world_postcard"("snapshotId", "authorId");

-- CreateIndex
CREATE INDEX "garden_watering_snapshotId_appliedAt_idx" ON "garden_watering"("snapshotId", "appliedAt");

-- CreateIndex
CREATE INDEX "garden_watering_visitorId_idx" ON "garden_watering"("visitorId");

-- CreateIndex
CREATE UNIQUE INDEX "garden_watering_snapshotId_visitorId_day_key" ON "garden_watering"("snapshotId", "visitorId", "day");

-- CreateIndex
CREATE INDEX "farm_festival_entry_festivalKey_score_idx" ON "farm_festival_entry"("festivalKey", "score");

-- CreateIndex
CREATE UNIQUE INDEX "farm_festival_entry_festivalKey_userId_key" ON "farm_festival_entry"("festivalKey", "userId");

-- AddForeignKey
ALTER TABLE "world_snapshot" ADD CONSTRAINT "world_snapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "world_postcard" ADD CONSTRAINT "world_postcard_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "world_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "world_postcard" ADD CONSTRAINT "world_postcard_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_watering" ADD CONSTRAINT "garden_watering_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "world_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garden_watering" ADD CONSTRAINT "garden_watering_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_festival_entry" ADD CONSTRAINT "farm_festival_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

