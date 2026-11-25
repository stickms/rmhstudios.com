-- Read-alongs (s11-09): a library book read together in a community, in weekly parts.
-- Additive only: three new tables with their indexes and foreign keys.

-- CreateTable
CREATE TABLE "read_along" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "docSlug" VARCHAR(200) NOT NULL,
    "bookTitle" VARCHAR(200) NOT NULL,
    "weekday" INTEGER NOT NULL,
    "minuteOfDay" INTEGER NOT NULL,
    "timeZone" VARCHAR(64) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "pausedReason" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "read_along_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "read_along_part" (
    "id" TEXT NOT NULL,
    "readAlongId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "startPage" INTEGER NOT NULL,
    "endPage" INTEGER NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "postId" TEXT,
    "postedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "read_along_part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "read_along_reader" (
    "readAlongId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "lastPartDone" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "read_along_reader_pkey" PRIMARY KEY ("readAlongId","userId")
);

-- CreateIndex
CREATE INDEX "read_along_communityId_status_idx" ON "read_along"("communityId", "status");

-- CreateIndex
CREATE INDEX "read_along_part_postedAt_opensAt_idx" ON "read_along_part"("postedAt", "opensAt");

-- CreateIndex
CREATE UNIQUE INDEX "read_along_part_readAlongId_position_key" ON "read_along_part"("readAlongId", "position");

-- CreateIndex
CREATE INDEX "read_along_reader_userId_idx" ON "read_along_reader"("userId");

-- AddForeignKey
ALTER TABLE "read_along" ADD CONSTRAINT "read_along_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "read_along" ADD CONSTRAINT "read_along_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "read_along_part" ADD CONSTRAINT "read_along_part_readAlongId_fkey" FOREIGN KEY ("readAlongId") REFERENCES "read_along"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "read_along_reader" ADD CONSTRAINT "read_along_reader_readAlongId_fkey" FOREIGN KEY ("readAlongId") REFERENCES "read_along"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "read_along_reader" ADD CONSTRAINT "read_along_reader_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
