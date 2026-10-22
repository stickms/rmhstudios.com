-- One-off rebuild of the hashtag registry to the public-only rule.
--
-- Since the post-merge review of #925, linkPostHashtagsIfPublic only links
-- PUBLIC posts outside private communities, because typeahead, trending and
-- tag counts read the registry for everyone. Links written before that still
-- include FOLLOWERS / SUPPORTERS / CIRCLE / PRIVATE posts and private-community
-- posts, so their tags (and counts) were visible to people who can't read them.
--
-- 1. Drop those links. The tag feed never showed these posts to a viewer who
--    couldn't read them (it re-checks audience), and new non-public posts are
--    no longer linked, so this makes old posts match new ones.
-- 2. Recompute each tag's postCount from its remaining links to non-deleted
--    posts (the column's documented meaning). Only rows whose count changes
--    are written.
--
-- Idempotent: re-running deletes nothing more and writes no counts.
DELETE FROM "post_hashtag" ph
USING "rmheet" r
WHERE r.id = ph."rmheetId"
  AND (
    r.audience <> 'PUBLIC'::"RMHarkAudience"
    OR (
      r."communityId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "community" c
        WHERE c.id = r."communityId" AND c."isPrivate"
      )
    )
  );

UPDATE "hashtag" h
SET "postCount" = sub.n, "updatedAt" = now()
FROM (
  SELECT h2.id, count(r.id) FILTER (WHERE r."deletedAt" IS NULL)::int AS n
  FROM "hashtag" h2
  LEFT JOIN "post_hashtag" ph ON ph."hashtagId" = h2.id
  LEFT JOIN "rmheet" r ON r.id = ph."rmheetId"
  GROUP BY h2.id
) sub
WHERE sub.id = h.id
  AND h."postCount" IS DISTINCT FROM sub.n;
