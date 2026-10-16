-- CreateTable
CREATE TABLE "delight_setting" (
    "key" VARCHAR(40) NOT NULL,
    "value" VARCHAR(200) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delight_setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "hunt" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hunt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hunt_clue" (
    "id" TEXT NOT NULL,
    "huntId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "clueText" VARCHAR(500) NOT NULL,
    "hint" VARCHAR(300) NOT NULL DEFAULT '',
    "answer" VARCHAR(120) NOT NULL,
    "hiddenPath" VARCHAR(200) NOT NULL,

    CONSTRAINT "hunt_clue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hunt_progress" (
    "id" TEXT NOT NULL,
    "huntId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "solved" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "hunt_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_era" (
    "id" TEXT NOT NULL,
    "eraDate" DATE NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "imageUrl" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_era_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fortune_cookie" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" VARCHAR(140) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "runDate" VARCHAR(10),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "fortune_cookie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_nomination" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" VARCHAR(10) NOT NULL,
    "imageUrl" VARCHAR(500) NOT NULL,
    "caption" VARCHAR(140) NOT NULL DEFAULT '',
    "votes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_nomination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_vote" (
    "id" TEXT NOT NULL,
    "nominationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translation_suggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "ns" VARCHAR(64) NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "text" VARCHAR(1000) NOT NULL,
    "votes" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "translation_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translation_vote" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "translation_vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hunt_active_idx" ON "hunt"("active");

-- CreateIndex
CREATE UNIQUE INDEX "hunt_clue_huntId_position_key" ON "hunt_clue"("huntId", "position");

-- CreateIndex
CREATE INDEX "hunt_progress_huntId_durationMs_idx" ON "hunt_progress"("huntId", "durationMs");

-- CreateIndex
CREATE INDEX "hunt_progress_userId_idx" ON "hunt_progress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "hunt_progress_huntId_userId_key" ON "hunt_progress"("huntId", "userId");

-- CreateIndex
CREATE INDEX "site_era_eraDate_idx" ON "site_era"("eraDate");

-- CreateIndex
CREATE UNIQUE INDEX "fortune_cookie_runDate_key" ON "fortune_cookie"("runDate");

-- CreateIndex
CREATE INDEX "fortune_cookie_status_createdAt_idx" ON "fortune_cookie"("status", "createdAt");

-- CreateIndex
CREATE INDEX "fortune_cookie_userId_createdAt_idx" ON "fortune_cookie"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "photo_nomination_dayKey_votes_createdAt_idx" ON "photo_nomination"("dayKey", "votes" DESC, "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "photo_nomination_userId_dayKey_key" ON "photo_nomination"("userId", "dayKey");

-- CreateIndex
CREATE INDEX "photo_vote_nominationId_idx" ON "photo_vote"("nominationId");

-- CreateIndex
CREATE UNIQUE INDEX "photo_vote_userId_dayKey_key" ON "photo_vote"("userId", "dayKey");

-- CreateIndex
CREATE INDEX "translation_suggestion_locale_ns_key_idx" ON "translation_suggestion"("locale", "ns", "key");

-- CreateIndex
CREATE INDEX "translation_suggestion_locale_status_idx" ON "translation_suggestion"("locale", "status");

-- CreateIndex
CREATE UNIQUE INDEX "translation_suggestion_userId_locale_ns_key_key" ON "translation_suggestion"("userId", "locale", "ns", "key");

-- CreateIndex
CREATE INDEX "translation_vote_userId_idx" ON "translation_vote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "translation_vote_suggestionId_userId_key" ON "translation_vote"("suggestionId", "userId");

-- AddForeignKey
ALTER TABLE "hunt_clue" ADD CONSTRAINT "hunt_clue_huntId_fkey" FOREIGN KEY ("huntId") REFERENCES "hunt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hunt_progress" ADD CONSTRAINT "hunt_progress_huntId_fkey" FOREIGN KEY ("huntId") REFERENCES "hunt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hunt_progress" ADD CONSTRAINT "hunt_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fortune_cookie" ADD CONSTRAINT "fortune_cookie_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_nomination" ADD CONSTRAINT "photo_nomination_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_vote" ADD CONSTRAINT "photo_vote_nominationId_fkey" FOREIGN KEY ("nominationId") REFERENCES "photo_nomination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_vote" ADD CONSTRAINT "photo_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translation_suggestion" ADD CONSTRAINT "translation_suggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translation_vote" ADD CONSTRAINT "translation_vote_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "translation_suggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translation_vote" ADD CONSTRAINT "translation_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

