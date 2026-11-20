-- RMH Med Schools phase 2b (SDN): per-thread cursor table and the SDN interview-profile columns.
-- Additive: one new table (cursorPostHash is an HMAC, never a raw post id) and six nullable columns.
-- AlterTable
ALTER TABLE "med_interview_profile" ADD COLUMN     "avgImpression" DOUBLE PRECISION,
ADD COLUMN     "avgStress" DOUBLE PRECISION,
ADD COLUMN     "inStateCount" INTEGER,
ADD COLUMN     "interviewLength" TEXT,
ADD COLUMN     "interviewStyle" TEXT,
ADD COLUMN     "outOfStateCount" INTEGER;


-- CreateTable
CREATE TABLE "med_sdn_thread" (
    "threadId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "cycleYear" INTEGER NOT NULL,
    "degree" "MedDegree" NOT NULL,
    "archive" BOOLEAN NOT NULL DEFAULT false,
    "repliesSeen" INTEGER NOT NULL DEFAULT 0,
    "repliesDone" INTEGER NOT NULL DEFAULT -1,
    "lastActivityAt" TIMESTAMP(3),
    "cursorPage" INTEGER NOT NULL DEFAULT 1,
    "cursorPostHash" TEXT,
    "postsProcessed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "med_sdn_thread_pkey" PRIMARY KEY ("threadId")
);

-- CreateIndex
CREATE INDEX "med_sdn_thread_archive_cycleYear_idx" ON "med_sdn_thread"("archive", "cycleYear");

-- CreateIndex
CREATE INDEX "med_sdn_thread_schoolId_cycleYear_idx" ON "med_sdn_thread"("schoolId", "cycleYear");

-- AddForeignKey
ALTER TABLE "med_sdn_thread" ADD CONSTRAINT "med_sdn_thread_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;
