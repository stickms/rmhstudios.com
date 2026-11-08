-- CreateTable
CREATE TABLE "music_learn_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instrument" TEXT NOT NULL DEFAULT 'piano',
    "input" TEXT NOT NULL DEFAULT 'screen',
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "dailyGoal" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_learn_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_learn_lesson_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_learn_lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "music_learn_profile_userId_key" ON "music_learn_profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "music_learn_lesson_progress_userId_lessonId_key" ON "music_learn_lesson_progress"("userId", "lessonId");

-- AddForeignKey
ALTER TABLE "music_learn_profile" ADD CONSTRAINT "music_learn_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "music_learn_lesson_progress" ADD CONSTRAINT "music_learn_lesson_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

