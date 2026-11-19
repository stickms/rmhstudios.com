-- Expand step 2 of 2: one live room model for "talk now".
--
-- A Space (space + space_message) becomes a titled group_call with its text in
-- the new group_call_message, so one row carries a room's voice roster and its
-- chat (owner-approved consolidation, 2026-11-19). This release reads and
-- writes only group_call / group_call_message; the previous release keeps
-- using space / space_message while the blue/green swap runs, so those are
-- dropped in a LATER release (contract), which first re-runs the copy block
-- below and then drops the two mirror triggers and their functions.
--
-- Nothing here drops, renames or tightens anything.

-- AlterTable
ALTER TABLE "group_call" ADD COLUMN IF NOT EXISTS "pinned" JSONB,
ADD COLUMN IF NOT EXISTS "recordChat" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "title" VARCHAR(120);

-- CreateTable
CREATE TABLE IF NOT EXISTS "group_call_message" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_call_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "group_call_message_callId_createdAt_idx" ON "group_call_message"("callId", "createdAt");

-- CreateIndex
-- migration-safety: acknowledged[create-index-not-concurrent] group_call holds one row per voice call (eight-person mesh rooms, a few per community per day), so the build is a brief lock on a small table; CONCURRENTLY cannot run inside the migration transaction
CREATE INDEX IF NOT EXISTS "group_call_status_startedAt_idx" ON "group_call"("status", "startedAt" DESC);

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "group_call_message" ADD CONSTRAINT "group_call_message_callId_fkey" FOREIGN KEY ("callId") REFERENCES "group_call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "group_call_message" ADD CONSTRAINT "group_call_message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─── Copy (idempotent; the contract release re-runs this block verbatim) ────
--
-- Every row keeps its id (space ids are cuids, group_call ids uuid v7, so they
-- cannot collide), and every INSERT ends in ON CONFLICT DO NOTHING, so a second
-- run inserts only rows the previous release wrote meanwhile and never
-- overwrites state this release has since written (a room it ended, a pin it
-- changed). Messages are guarded by EXISTS on their room.
--
-- Mapping: status SCHEDULED -> SCHEDULED, LIVE -> ACTIVE, ENDED -> ENDED; a
-- community space is origin COMMUNITY, a profile space origin PROFILE. A space
-- never had voice, so peakParticipants is 0 and it has no participant rows.

-- 1. space -> group_call (titled rooms).
INSERT INTO "group_call" (
  "id", "hostId", "origin", "communityId", "partyId", "conversationId", "status",
  "createdAt", "startedAt", "endedAt", "peakParticipants",
  "title", "scheduledAt", "pinned", "recordChat"
)
SELECT
  s."id", s."hostId",
  (CASE WHEN s."communityId" IS NULL THEN 'PROFILE' ELSE 'COMMUNITY' END)::"GroupCallOrigin",
  s."communityId", NULL, NULL,
  (CASE s."status"::text WHEN 'SCHEDULED' THEN 'SCHEDULED' WHEN 'LIVE' THEN 'ACTIVE' ELSE 'ENDED' END)::"GroupCallStatus",
  s."createdAt", s."startedAt", s."endedAt", 0,
  s."title", s."scheduledAt", s."pinned", s."recordChat"
FROM "space" AS s
ON CONFLICT DO NOTHING;

-- 2. space_message -> group_call_message.
INSERT INTO "group_call_message" ("id", "callId", "userId", "body", "createdAt")
SELECT m."id", m."spaceId", m."userId", m."body", m."createdAt"
FROM "space_message" AS m
WHERE EXISTS (SELECT 1 FROM "group_call" AS g WHERE g."id" = m."spaceId")
ON CONFLICT DO NOTHING;


-- ─── Swap-window mirror (the contract release removes these) ────────────────
--
-- Live rooms are short-lived, but a Space can be SCHEDULED days ahead, and
-- during the swap the previous web release still creates, starts, ends,
-- re-pins and removes spaces in the old table. A copy that ran only at migrate
-- time would lose those: a room scheduled on the old release would not exist
-- on the new one, and a room ended there would stay listed as live. So, in one
-- direction only (old -> new), these triggers replay every old-release write
-- into the new tables as it happens. The reverse is not mirrored: a room
-- created on the new release is invisible to the old one for the few minutes
-- it still serves, as is anything that did not exist yet.
--
-- A mirror failure must never fail the previous release's own write, so each
-- body turns its error into a WARNING. A room this release has ENDED is never
-- reopened by a late old-release update.

CREATE OR REPLACE FUNCTION "live_room_mirror_space"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      DELETE FROM "group_call" WHERE "id" = OLD."id" AND "title" IS NOT NULL;
      RETURN NULL;
    END IF;
    INSERT INTO "group_call" (
      "id", "hostId", "origin", "communityId", "status",
      "createdAt", "startedAt", "endedAt", "peakParticipants",
      "title", "scheduledAt", "pinned", "recordChat"
    ) VALUES (
      NEW."id", NEW."hostId",
      (CASE WHEN NEW."communityId" IS NULL THEN 'PROFILE' ELSE 'COMMUNITY' END)::"GroupCallOrigin",
      NEW."communityId",
      (CASE NEW."status"::text WHEN 'SCHEDULED' THEN 'SCHEDULED' WHEN 'LIVE' THEN 'ACTIVE' ELSE 'ENDED' END)::"GroupCallStatus",
      NEW."createdAt", NEW."startedAt", NEW."endedAt", 0,
      NEW."title", NEW."scheduledAt", NEW."pinned", NEW."recordChat"
    )
    ON CONFLICT ("id") DO UPDATE SET
      "title" = EXCLUDED."title",
      "communityId" = EXCLUDED."communityId",
      "status" = CASE WHEN "group_call"."status" = 'ENDED' THEN "group_call"."status" ELSE EXCLUDED."status" END,
      "startedAt" = COALESCE("group_call"."startedAt", EXCLUDED."startedAt"),
      "endedAt" = COALESCE("group_call"."endedAt", EXCLUDED."endedAt"),
      "scheduledAt" = EXCLUDED."scheduledAt",
      "pinned" = EXCLUDED."pinned",
      "recordChat" = EXCLUDED."recordChat"
    WHERE "group_call"."title" IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'live_room_mirror_space(%): %', TG_OP, SQLERRM;
  END;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION "live_room_mirror_space_message"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    INSERT INTO "group_call_message" ("id", "callId", "userId", "body", "createdAt")
    SELECT NEW."id", NEW."spaceId", NEW."userId", NEW."body", NEW."createdAt"
    WHERE EXISTS (SELECT 1 FROM "group_call" AS g WHERE g."id" = NEW."spaceId")
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'live_room_mirror_space_message: %', SQLERRM;
  END;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS "live_room_mirror_space" ON "space";
CREATE TRIGGER "live_room_mirror_space"
  AFTER INSERT OR UPDATE OR DELETE ON "space"
  FOR EACH ROW EXECUTE FUNCTION "live_room_mirror_space"();

DROP TRIGGER IF EXISTS "live_room_mirror_space_message" ON "space_message";
CREATE TRIGGER "live_room_mirror_space_message"
  AFTER INSERT ON "space_message"
  FOR EACH ROW EXECUTE FUNCTION "live_room_mirror_space_message"();
