-- AlterTable
ALTER TABLE "altair_meta_progress" ADD COLUMN "coinAllowance" INTEGER NOT NULL DEFAULT 8000,
ADD COLUMN "coinAllowanceAt" TIMESTAMP(3);
