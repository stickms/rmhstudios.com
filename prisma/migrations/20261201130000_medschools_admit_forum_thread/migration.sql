-- RMH Med Schools: Admit.org school-forum reading progress. Additive only: one table, no change to any existing one.
-- One row per school and cycle holds a read cursor (a post count and a keyed hash of the last processed post, never a
-- post id) and the thread's post count at the last look, so each run reads only new posts and a deploy resumes. It stores
-- no post text, author, username or avatar.

-- CreateTable
CREATE TABLE "med_admit_forum_thread" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "cycleYear" INTEGER NOT NULL,
    "remoteCount" INTEGER NOT NULL DEFAULT 0,
    "cursorOffset" INTEGER NOT NULL DEFAULT 0,
    "cursorPostHash" TEXT,
    "postsProcessed" INTEGER NOT NULL DEFAULT 0,
    "lastPostAt" TIMESTAMP(3),
    "parkedAt" TIMESTAMP(3),
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "med_admit_forum_thread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "med_admit_forum_thread_schoolId_cycleYear_key" ON "med_admit_forum_thread"("schoolId", "cycleYear");

-- CreateIndex
CREATE INDEX "med_admit_forum_thread_cycleYear_idx" ON "med_admit_forum_thread"("cycleYear");

-- AddForeignKey
ALTER TABLE "med_admit_forum_thread" ADD CONSTRAINT "med_admit_forum_thread_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "med_school"("id") ON DELETE CASCADE ON UPDATE CASCADE;
