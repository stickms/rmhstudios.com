-- Session write-ups, and announcements that clear themselves.
--
-- `pf2e_recap` is one row per PERSON per session, not one per session: the GM
-- remembers the plot and a player remembers their character nearly dying, and a
-- single shared text field means whoever types second silently overwrites the
-- first. They are also the raw material for `pf2e_session.recapSummary`, which
-- is keyed by a hash of the entries it was written from, so adding an account
-- rewrites the summary and nothing else does.
--
-- On `pf2e_announcement`:
--   * `sessionId` is the night a note is about — set directly for a note the
--     board writes after a change, and inferred from the text (DeepSeek) for one
--     a person writes. ON DELETE SET NULL rather than CASCADE: deleting a
--     session should not silently delete the note explaining why it went.
--   * `expiresAt` is when the note stops being shown, normally that session's
--     end. Null means "until someone removes it", which is every existing row —
--     nothing is back-filled, so no note that is currently up disappears on
--     deploy.
--   * `automated` marks a note the board wrote itself, so the UI can say so.
--
-- The `expiresAt` index exists because the board read filters on it every time.
--
-- migration-safety: acknowledged[create-index-not-concurrent] `pf2e_announcement` is one
-- hobby group's notice board — tens of rows, capped at 40 by the only query that reads it,
-- and written to a handful of times a month. The SHARE lock a plain CREATE INDEX takes is
-- measured in milliseconds on a table that size, and CONCURRENTLY cannot run inside the
-- migration transaction, so using it here would trade an unmeasurable pause for a migration
-- that can leave an INVALID index behind if it fails. The `pf2e_recap` index below is not
-- flagged because that table is created in this same migration and has no writers yet.

-- AlterTable
ALTER TABLE "pf2e_session" ADD COLUMN     "recapAt" TIMESTAMP(3),
ADD COLUMN     "recapKey" VARCHAR(64),
ADD COLUMN     "recapSummary" VARCHAR(2000);

-- AlterTable
ALTER TABLE "pf2e_announcement" ADD COLUMN     "automated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "pf2e_recap" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pf2e_recap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pf2e_recap_sessionId_createdAt_idx" ON "pf2e_recap"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "pf2e_announcement_expiresAt_idx" ON "pf2e_announcement"("expiresAt");

-- AddForeignKey
ALTER TABLE "pf2e_announcement" ADD CONSTRAINT "pf2e_announcement_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "pf2e_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pf2e_recap" ADD CONSTRAINT "pf2e_recap_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "pf2e_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pf2e_recap" ADD CONSTRAINT "pf2e_recap_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
