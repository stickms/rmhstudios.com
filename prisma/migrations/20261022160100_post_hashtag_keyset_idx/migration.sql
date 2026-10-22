-- WS8: keyset scan of a tag's newest posts. (hashtagId, createdAt DESC,
-- rmheetId DESC) is exactly the tag feed's ORDER BY (the rmheetId tail makes the
-- tie-break the same as ORDER BY createdAt DESC, id DESC), so a page is an index
-- range scan that stops after LIMIT rows. Supersedes
-- post_hashtag_hashtagId_createdAt_idx (dropped in the next migration).
-- Single statement: CONCURRENTLY cannot run inside a multi-statement migration.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "post_hashtag_hashtagId_createdAt_rmheetId_idx"
  ON "post_hashtag"("hashtagId", "createdAt" DESC, "rmheetId" DESC);
