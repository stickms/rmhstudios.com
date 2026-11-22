-- Touch-typing course progress for RMHType: one row per member and lesson, holding
-- the best speed, best accuracy and best stars (lib/rmhtype/lessons.server.ts).

-- CreateTable
CREATE TABLE "rmhtype_lesson_progress" (
    "userId" TEXT NOT NULL,
    "lessonId" VARCHAR(32) NOT NULL,
    "bestWpm" DOUBLE PRECISION NOT NULL,
    "bestAccuracy" DOUBLE PRECISION NOT NULL,
    "stars" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rmhtype_lesson_progress_pkey" PRIMARY KEY ("userId","lessonId")
);

-- AddForeignKey
ALTER TABLE "rmhtype_lesson_progress" ADD CONSTRAINT "rmhtype_lesson_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

