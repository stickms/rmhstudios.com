-- Expand step: one Feed for every "show / notify me about these people, tags or
-- terms". Lists of accounts ("user_list" + "user_list_member"), saved universal
-- searches ("saved_search") and keyword alerts ("keyword_alert") become rows of
-- "custom_feed", told apart by "kind"; a feed's people move from the
-- "authorIds" array to "custom_feed_member" (the shape lists already had, with
-- its "lists you're on" index and per-member addedAt).
--
-- Additive only. The previous release keeps reading and writing the old tables
-- while the blue/green swap runs, so they are dropped in a LATER release
-- (contract), which must first re-run every copy statement below: each one
-- reuses the old row's id (cuids, unique across tables) and ends in ON CONFLICT
-- DO NOTHING, so a re-run copies only what the old release wrote after this one
-- ran and is otherwise a no-op.

-- migration-safety: acknowledged[create-index-not-concurrent] "custom_feed" is small (per member at most 10 feeds, 20 lists, 25 saved searches and 10 alerts); building its two indexes takes milliseconds, and the alert fan-out reads by anchor from the first post after deploy

-- AlterTable
ALTER TABLE "custom_feed" ADD COLUMN     "anchor" VARCHAR(64),
ADD COLUMN     "kind" VARCHAR(12) NOT NULL DEFAULT 'feed',
ADD COLUMN     "lastRunAt" TIMESTAMP(3),
ADD COLUMN     "notify" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "query" VARCHAR(200),
ADD COLUMN     "types" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "visibility" "ListVisibility" NOT NULL DEFAULT 'PRIVATE';

-- CreateTable
CREATE TABLE "custom_feed_member" (
    "feedId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_feed_member_pkey" PRIMARY KEY ("feedId","userId")
);

-- CreateIndex
CREATE INDEX "custom_feed_member_userId_idx" ON "custom_feed_member"("userId");

-- CreateIndex
CREATE INDEX "custom_feed_ownerId_kind_idx" ON "custom_feed"("ownerId", "kind");

-- CreateIndex
CREATE INDEX "custom_feed_anchor_idx" ON "custom_feed"("anchor");

-- AddForeignKey
ALTER TABLE "custom_feed_member" ADD CONSTRAINT "custom_feed_member_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "custom_feed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_feed_member" ADD CONSTRAINT "custom_feed_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Copy (idempotent; re-run it before the contract drops the old tables) ───

-- 1. Existing custom feeds: a public feed is PUBLIC; its people become members.
--    authorIds may name an account deleted since, which no member row can hold.
UPDATE "custom_feed" SET "visibility" = 'PUBLIC'
WHERE "kind" = 'feed' AND "isPublic" AND "visibility" <> 'PUBLIC';

INSERT INTO "custom_feed_member" ("feedId", "userId", "addedAt")
SELECT f."id", a."userId", f."createdAt"
FROM "custom_feed" AS f
CROSS JOIN LATERAL unnest(COALESCE(f."authorIds", ARRAY[]::TEXT[])) AS a("userId")
JOIN "user" AS u ON u."id" = a."userId"
WHERE f."kind" = 'feed'
ON CONFLICT DO NOTHING;

-- 2. Lists → kind 'list'. bio → description; visibility and pinned carry over;
--    only a PUBLIC list is discoverable (none are yet: PUBLIC is UI-gated).
INSERT INTO "custom_feed" (
  "id", "ownerId", "kind", "name", "description", "tags", "authorIds", "keywords",
  "isPublic", "visibility", "pinned", "types", "notify", "createdAt", "updatedAt"
)
SELECT
  l."id", l."ownerId", 'list', l."name", l."bio", ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[],
  l."visibility" = 'PUBLIC', l."visibility", l."pinned", ARRAY[]::TEXT[], false, l."createdAt", l."createdAt"
FROM "user_list" AS l
ON CONFLICT DO NOTHING;

INSERT INTO "custom_feed_member" ("feedId", "userId", "addedAt")
SELECT m."listId", m."userId", m."addedAt"
FROM "user_list_member" AS m
JOIN "custom_feed" AS f ON f."id" = m."listId" AND f."kind" = 'list'
ON CONFLICT DO NOTHING;

-- 3. Saved searches → kind 'search'. alerts → notify; the jsonb type chips
--    become text[]. Only the 'search' surface ever had a writer (the B8 saved
--    views module for the other surfaces was never called), so that is every
--    row; the contract step checks the remainder is empty before it drops.
INSERT INTO "custom_feed" (
  "id", "ownerId", "kind", "name", "description", "tags", "authorIds", "keywords",
  "isPublic", "visibility", "query", "types", "notify", "lastRunAt", "createdAt", "updatedAt"
)
SELECT
  s."id", s."userId", 'search', LEFT(COALESCE(NULLIF(s."name", ''), s."query"), 60), NULL,
  ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[], false, 'PRIVATE', s."query",
  CASE WHEN jsonb_typeof(s."types") = 'array'
    THEN ARRAY(SELECT jsonb_array_elements_text(s."types"))
    ELSE ARRAY[]::TEXT[] END,
  s."alerts", s."lastRunAt", s."createdAt", s."createdAt"
FROM "saved_search" AS s
WHERE s."surface" = 'search'
ON CONFLICT DO NOTHING;

-- 4. Keyword alerts → kind 'alert', notify on, with the same indexed anchor.
INSERT INTO "custom_feed" (
  "id", "ownerId", "kind", "name", "description", "tags", "authorIds", "keywords",
  "isPublic", "visibility", "query", "anchor", "types", "notify", "createdAt", "updatedAt"
)
SELECT
  k."id", k."userId", 'alert', LEFT(k."query", 60), NULL,
  ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[], false, 'PRIVATE', k."query", k."anchor",
  ARRAY[]::TEXT[], true, k."createdAt", k."createdAt"
FROM "keyword_alert" AS k
ON CONFLICT DO NOTHING;
