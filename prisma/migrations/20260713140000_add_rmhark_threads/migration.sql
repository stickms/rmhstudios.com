-- AlterTable
ALTER TABLE "rmheet" ADD COLUMN     "threadReplyCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "threadRootId" TEXT;

-- CreateIndex
CREATE INDEX "rmheet_threadRootId_idx" ON "rmheet"("threadRootId");

