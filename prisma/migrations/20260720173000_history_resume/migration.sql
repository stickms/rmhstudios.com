-- AlterTable
ALTER TABLE "user_profile" ADD COLUMN     "historyPaused" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "history_entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" VARCHAR(24) NOT NULL,
    "entityId" TEXT NOT NULL,
    "position" INTEGER,
    "duration" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "history_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "history_entry_userId_updatedAt_idx" ON "history_entry"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "history_entry_userId_entityType_entityId_key" ON "history_entry"("userId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "history_entry" ADD CONSTRAINT "history_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

