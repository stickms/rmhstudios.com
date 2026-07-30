-- Indexes for five query predicates that had no usable index.
--
-- These came out of an audit of every `@relation(fields: [...])` column in the
-- schema against the queries that actually filter on it. 83 relation columns lead
-- no index, but most are only reachable by a hard parent delete that this codebase
-- never performs (account deletion scrubs the user row rather than deleting it,
-- and the post/comment cascade direction — rmheetId / commentId — is already
-- indexed). The five below are the ones a live read path hits.
--
-- IF NOT EXISTS so re-running against a database that already has them is a no-op.

-- Social presence (lib/presence.server.ts) asks "which of these online users are
-- in an open room" on a per-viewer ~45s poll. Both membership tables were indexed
-- only as (roomId, userId), so the userId-leading lookup seq-scanned each table.
CREATE INDEX IF NOT EXISTS "rmhtube_room_member_userId_leftAt_idx"
  ON "rmhtube_room_member" ("userId", "leftAt");

CREATE INDEX IF NOT EXISTS "rmh_music_room_member_userId_leftAt_idx"
  ON "rmh_music_room_member" ("userId", "leftAt");

-- createNotification's unread-dedupe findFirst and removeNotification's
-- retraction deleteMany match on (userId, actorId, type, entityType, entityId,
-- read=false). The best existing index was (userId, read, createdAt), so both
-- scanned every unread row the recipient holds — on every like, comment, follow
-- and unlike.
CREATE INDEX IF NOT EXISTS "notification_userId_read_type_entityId_idx"
  ON "notification" ("userId", "read", "type", "entityId");

-- SongComment carried no index whatsoever, so the song comment list
-- (where songId order by createdAt desc) scanned and sorted the whole table.
CREATE INDEX IF NOT EXISTS "SongComment_songId_createdAt_idx"
  ON "SongComment" ("songId", "createdAt" DESC);

-- Per-author pending-submission cap, counted on every prediction market creation.
CREATE INDEX IF NOT EXISTS "prediction_creatorId_status_idx"
  ON "prediction" ("creatorId", "status");
