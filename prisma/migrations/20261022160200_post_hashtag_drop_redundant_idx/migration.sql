-- WS8: the (hashtagId, createdAt DESC) index is a strict prefix of
-- post_hashtag_hashtagId_createdAt_rmheetId_idx (previous migration); keeping both
-- only costs write amplification on every post with a hashtag.
DROP INDEX CONCURRENTLY IF EXISTS "post_hashtag_hashtagId_createdAt_idx";
