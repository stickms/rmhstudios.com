-- Fold post bookmarks into the unified saves table.
--
-- "saved_item" is the generic, foldered save — polymorphic over
-- (entity_type, entity_id), and its SAVE_ENTITY_TYPES has listed 'rmhark' since
-- it was built. "rmheet_bookmark" predates it and was never folded in, so a post
-- could be bookmarked AND saved independently, into two lists, on two pages
-- (/bookmarks and /saves), with neither aware the other existed. Asked where the
-- thing they saved went, a user had no correct answer.
--
-- Every bookmark becomes a save in the default folder (folder_id NULL), keeping
-- its original createdAt so the merged list stays in the order people built it.
-- ON CONFLICT DO NOTHING covers the rows that are already both — those users
-- pressed both buttons on the same post, and the save is the one that survives.
--
-- "rmheet_bookmark" is deliberately NOT dropped here. Nothing reads or writes it
-- after this release; leaving the rows in place for one deploy makes the change
-- reversible without a restore. Drop it in a follow-up once this has stuck.

-- The reverse lookup rmheet_bookmark carried as @@index([rmheetId]): the post
-- insights panel counts saves per post, which without this index is a full scan
-- of every save on the site. Created before the backfill so the copy lands into
-- an indexed table.
CREATE INDEX IF NOT EXISTS "saved_item_entityType_entityId_idx"
  ON "saved_item" ("entityType", "entityId");

INSERT INTO "saved_item" ("id", "userId", "folderId", "entityType", "entityId", "createdAt")
SELECT
  b."id",              -- reuse the cuid: stable, and makes the backfill idempotent
  b."userId",
  NULL,
  'rmhark',
  b."rmheetId",
  b."createdAt"
FROM "rmheet_bookmark" AS b
ON CONFLICT ("userId", "entityType", "entityId") DO NOTHING;
