-- Expand step for retiring "rmheet_bookmark". 20260803210000 copied it into
-- "saved_item" (entityType 'rmhark'); this release moves its last readers (the
-- feed's bookmarked bit, bulk "clear bookmarks", the auto-delete exclusion) onto
-- "saved_item". The previous release still reads the old table while the
-- blue/green swap runs, so the table is dropped in a LATER release (contract).
--
-- The copy is re-run here and is idempotent (the ids are the old cuids, and a
-- bare ON CONFLICT DO NOTHING skips a clash on the id or on
-- (userId, entityType, entityId)), so nothing that reached the old table after
-- the fold is lost.
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
