-- Slice It: the solo modes (S1 daily challenge, S8 setlists).
--
-- ## `slice_daily_entry` — S1
--
-- The day's song, difficulty and modifier set are deliberately NOT in this
-- table. They are a pure function of the UTC day key (`dailySelection()` in
-- `lib/slice-it/daily.server.ts`), so every web process, every worker and the
-- browser agree on today's challenge with no coordinating row and no write that
-- has to happen at midnight. What a function cannot derive — who played, what
-- they scored, and that they only got one attempt — is what lands here.
--
-- `slice_daily_entry_day_user_key` is the one-attempt rule. Not a UI check, not
-- a SELECT-then-INSERT: the second INSERT fails, which is the only version that
-- survives two tabs racing each other. `submitDailyEntry()` catches P2002 and
-- reports "already played today".
--
-- BIGSERIAL rather than a `cuid()` text key, per the new-table PK policy in
-- `lib/CLAUDE.md` §Database — one row per player per day forever, always read in
-- day order, so insert locality is free and no second index is needed to scan
-- it.
--
-- ## `slice_setlist` — S8
--
-- `song_ids TEXT[]` and not a join table with a `position` column. A setlist is
-- read whole, written whole, and its order IS the data; a join table would need
-- a position column, a reorder transaction and a GROUP BY to express the same
-- thing. The cost is a dangling id when a song is deleted — readers filter to
-- the ids that resolve, so a setlist quietly shrinks instead of erroring.
--
-- `song_ids` holds SONG ids (`cuid()` text), not chart ids: every run-start path
-- in this game takes a song id, so a setlist of chart ids would not be playable.
--
-- The PK is `uuid` with a `gen_random_uuid()` default, matching `chart` — the
-- time-sortable v7 value is generated application-side by `uuidv7()` and this
-- default is only the fallback for a row inserted without one.
--
-- NOTE: this file has never been executed against a database. There is no
-- Postgres in this environment; it was verified with `prisma validate` and
-- `prisma generate` only.

-- CreateTable
CREATE TABLE "slice_daily_entry" (
    "id" BIGSERIAL NOT NULL,
    "dayKey" VARCHAR(10) NOT NULL,
    "userId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "chartId" UUID,
    "score" INTEGER NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "maxCombo" INTEGER NOT NULL,
    "cleared" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slice_daily_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slice_setlist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(300),
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "songIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slice_setlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: the one-attempt rule.
CREATE UNIQUE INDEX "slice_daily_entry_dayKey_userId_key" ON "slice_daily_entry"("dayKey", "userId");

-- CreateIndex: the board read — one day, ordered by score.
CREATE INDEX "slice_daily_entry_dayKey_score_idx" ON "slice_daily_entry"("dayKey", "score" DESC);

-- CreateIndex
CREATE INDEX "slice_setlist_ownerId_createdAt_idx" ON "slice_setlist"("ownerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "slice_setlist_isPublic_createdAt_idx" ON "slice_setlist"("isPublic", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "slice_daily_entry" ADD CONSTRAINT "slice_daily_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slice_daily_entry" ADD CONSTRAINT "slice_daily_entry_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slice_setlist" ADD CONSTRAINT "slice_setlist_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
