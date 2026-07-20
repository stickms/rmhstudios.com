-- AlterTable
ALTER TABLE "notification_preference" ADD COLUMN     "matrix" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "quietEnd" INTEGER,
ADD COLUMN     "quietStart" INTEGER,
ADD COLUMN     "tz" VARCHAR(40);

-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "groupKey" VARCHAR(80);

-- CreateIndex
CREATE INDEX "notification_userId_groupKey_idx" ON "notification"("userId", "groupKey");

