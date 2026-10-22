-- FK indexes for the two user-cascading columns of the (new, small) invite and
-- join-request tables, so deleting a user does not scan them, and a pending-list
-- index that matches the query's ORDER BY id (replaces the createdAt one).
--
-- migration-safety: acknowledged both tables shipped with this feature in the same
-- release train and hold a handful of rows, so the plain (non-concurrent) builds
-- take a SHARE lock for milliseconds; CONCURRENTLY would add four migrations plus
-- validity repairs for no benefit.
CREATE INDEX IF NOT EXISTS "community_invite_createdById_idx" ON "community_invite"("createdById");
CREATE INDEX IF NOT EXISTS "community_join_request_userId_idx" ON "community_join_request"("userId");
CREATE INDEX IF NOT EXISTS "community_join_request_communityId_status_id_idx" ON "community_join_request"("communityId", "status", "id");
DROP INDEX IF EXISTS "community_join_request_communityId_status_createdAt_idx";
