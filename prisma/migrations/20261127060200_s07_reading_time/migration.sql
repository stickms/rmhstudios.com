-- Opt-in reading time: a per-day, per-document seconds table and two reading_prefs columns.
-- Additive only: one new table, one defaulted column, one nullable column.

-- AlterTable
ALTER TABLE "reading_prefs" ADD COLUMN     "trackTime" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weeklyMinutesTarget" INTEGER;

-- CreateTable
CREATE TABLE "reading_time_day" (
    "userId" TEXT NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "docKind" "ReadingDocKind" NOT NULL,
    "docKey" VARCHAR(200) NOT NULL,
    "seconds" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_time_day_pkey" PRIMARY KEY ("userId","day","docKind","docKey")
);

-- CreateIndex
CREATE INDEX "reading_time_day_userId_day_idx" ON "reading_time_day"("userId", "day");

-- AddForeignKey
ALTER TABLE "reading_time_day" ADD CONSTRAINT "reading_time_day_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

