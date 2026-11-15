-- RMH Music sight reading (Sprint): freeplay bests per learner per level, and one daily challenge
-- row per learner per UTC date. Additive: two new tables, nothing existing changes.
-- A daily row is created when the scored run starts (score NULL) and filled once when it finishes;
-- a row whose score stays NULL is an abandoned run, so later runs that date are practice.

-- CreateTable
CREATE TABLE "music_sprint_best" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" VARCHAR(16) NOT NULL,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "bestAvgMs" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_sprint_best_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_sprint_daily" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "score" INTEGER,
    "avgMs" INTEGER,
    "played" INTEGER,
    "skipped" INTEGER,
    "results" JSONB,
    "scoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_sprint_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "music_sprint_best_userId_level_key" ON "music_sprint_best"("userId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "music_sprint_daily_userId_date_key" ON "music_sprint_daily"("userId", "date");

-- AddForeignKey
ALTER TABLE "music_sprint_best" ADD CONSTRAINT "music_sprint_best_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "music_sprint_daily" ADD CONSTRAINT "music_sprint_daily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
