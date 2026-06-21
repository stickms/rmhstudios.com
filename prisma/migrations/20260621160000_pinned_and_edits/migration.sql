-- AlterTable
ALTER TABLE "rmheet" ADD COLUMN "pinnedAt" TIMESTAMP(3);
ALTER TABLE "rmheet" ADD COLUMN "editedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "rmheet_userId_pinnedAt_idx" ON "rmheet"("userId", "pinnedAt");

-- CreateTable
CREATE TABLE "rmheet_edit" (
    "id" TEXT NOT NULL,
    "rmheetId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rmheet_edit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "rmheet_edit_rmheetId_createdAt_idx" ON "rmheet_edit"("rmheetId", "createdAt" DESC);
ALTER TABLE "rmheet_edit" ADD CONSTRAINT "rmheet_edit_rmheetId_fkey" FOREIGN KEY ("rmheetId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
