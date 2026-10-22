-- WS8: align post_hashtag."createdAt" with its post's "createdAt".
--
-- The tag feed orders by the POST's createdAt. To serve it from the tag's own
-- index (hashtagId, createdAt DESC, rmheetId DESC) and stop after one page, the
-- link's createdAt has to BE the post's createdAt. linkPostHashtags() now writes
-- it that way; this fixes links created earlier by a re-link (trash restore,
-- automod approval), which stamped the re-link time. Only mismatched rows are
-- touched (a no-op where the invariant already holds).
UPDATE "post_hashtag" ph
SET "createdAt" = r."createdAt"
FROM "rmheet" r
WHERE r.id = ph."rmheetId"
  AND ph."createdAt" IS DISTINCT FROM r."createdAt";
