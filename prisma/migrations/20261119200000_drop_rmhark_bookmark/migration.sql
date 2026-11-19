-- Drop the post-bookmark table that 20260803210000 folded into "saved_item".
--
-- That migration copied every "rmheet_bookmark" row into "saved_item"
-- (entityType 'rmhark', default folder) and left the table in place for one
-- deploy so the change could be reversed without a restore. It has stuck: every
-- reader and writer now uses "saved_item" (the feed's bookmarked bit, the bulk
-- "clear bookmarks" operation and the auto-delete exclusion were the last ones
-- still pointed at the old table, and were moved in the same change).
--
-- The copy is re-run first and is idempotent (the ids are the old cuids, and a
-- bare ON CONFLICT DO NOTHING skips a row that clashes on the id or on
-- (userId, entityType, entityId)), so a row that reached the old table after the
-- fold is carried over rather than lost.
INSERT INTO "saved_item" ("id", "userId", "folderId", "entityType", "entityId", "createdAt")
SELECT
  b."id",
  b."userId",
  NULL,
  'rmhark',
  b."rmheetId",
  b."createdAt"
FROM "rmheet_bookmark" AS b
ON CONFLICT DO NOTHING;

-- DropForeignKey
ALTER TABLE "rmheet_bookmark" DROP CONSTRAINT IF EXISTS "rmheet_bookmark_userId_fkey";

-- DropForeignKey
ALTER TABLE "rmheet_bookmark" DROP CONSTRAINT IF EXISTS "rmheet_bookmark_rmheetId_fkey";

-- DropTable
DROP TABLE "rmheet_bookmark";
