-- Contract step for the Listing, Chat and live-room consolidations, and the
-- custom_feed."authorIds" column.
--
-- rmh:contract-ok the expands 20261120030000_listings_one_model, 20261120040000_chat_unify and 20261120050100_live_rooms_expand are deployed, and custom_feed."authorIds" has been @ignore since 20261120090000; the release serving during this swap keeps the old models in its schema but runs no query on any of them (no prisma.<model>/tx.<model> call, no raw SQL other than its expiry sweep's DELETEs on "direct_message"/"group_message", which check to_regclass first and tolerate 42P01), and its client never names "authorIds".
-- migration-safety: acknowledged[drop-column] custom_feed."authorIds" is @ignore in the previous release's schema, so its client neither selects nor returns the column (people live in custom_feed_member since #1730/#1732); this release removes the field.
--
-- Why the drops are safe while the previous release still serves: Prisma
-- only touches a table through a model the code queries, and that release
-- queries none of market_listing, card_listing, storefront_product,
-- storefront_purchase, the nine chat tables, space or space_message. It reads
-- and writes "listing"/"listing_purchase", "chat"*, and "group_call"* only,
-- which this migration leaves as they are (minus the mirror triggers on
-- "listing"/"listing_purchase", which only wrote into the old tables).
--
-- Order, all in the one transaction Prisma runs this file in:
--   1. Listings: the four copy statements of 20261120030000_listings_one_model,
--      verbatim. That expand mirrors BOTH ways, synchronously, with no
--      exception handler (a failed mirror aborts the write that caused it), so
--      the old and new tables are identical and this re-run inserts nothing.
--      It is kept as the expand asked, as a cheap proof: if a row ever were
--      missing, it comes back here instead of being dropped with its table.
--   2. Chat: the copy of 20261120040000_chat_unify, re-run for the rows the
--      release before the expand wrote to the old tables during that swap
--      (see "Cutoff" below). Those were mirrored by triggers that turn every
--      error into a WARNING, so a failed mirror lost the row silently. The one
--      way that happens in practice: two people open the same DM on the two
--      releases at once, the old release's "conversation" insert loses to the
--      new "chat" row on "dmKey" (ON CONFLICT DO NOTHING), and every message
--      sent in it on the old release then fails the "chatId" foreign key. Those
--      messages are attached here to the chat that owns the pair.
--   3. Live rooms: the copy of 20261120050100_live_rooms_expand, re-run with
--      the same cutoff (its mirror triggers swallow errors the same way).
--   4. Drop the mirror triggers and their functions, then the old tables, the
--      SpaceStatus enum and custom_feed."authorIds". "chat_member_dm_cascade"
--      (trigger and function) is part of the new model and stays.
--
-- Cutoff. The expands' copies ran under a lock (chat) or before the triggers
-- were attached (live rooms) and copied every row that existed. A row of the
-- old tables that predates the expand and is missing from the new tables now
-- was therefore DELETED by the new release (a member who left, a group or room
-- that was removed, an expired message, a reaction taken back), and must stay
-- gone, which a verbatim ON CONFLICT DO NOTHING re-run would undo. So the
-- re-copy only considers rows created at or after the expand's
-- "_prisma_migrations".started_at, less one minute: Prisma stamps "createdAt"
-- before the statement is sent, so an insert that queued behind the expand's
-- lock can carry a time a moment earlier than started_at. Residual, accepted:
-- a row the old release created inside the swap window that the new release
-- then deleted again (within minutes) comes back; failed UPDATE/DELETE mirrors
-- (an edit, a leave) are not replayed, as nothing records which ones failed.
-- Rows already past their "expiresAt" are not re-copied: the sweep would only
-- delete them.

-- ═══ 1. Listings: the copy block of 20261120030000_listings_one_model, verbatim ═══

-- 1. Cosmetics market.
INSERT INTO "listing" (
  "id", "kind", "sellerId", "priceCoins", "status", "buyerId", "createdAt", "updatedAt",
  "closedAt", "reviewedAt", "inventoryId", "itemId"
)
SELECT
  m."id", 'COSMETIC', m."sellerId", m."priceCoins", m."status", m."buyerId", m."createdAt",
  COALESCE(m."closedAt", m."createdAt"), m."closedAt", m."reviewedAt", m."inventoryId", m."itemId"
FROM "market_listing" AS m
ON CONFLICT ("id") DO NOTHING;

-- 2. Trading-card market.
INSERT INTO "listing" (
  "id", "kind", "sellerId", "priceCoins", "status", "buyerId", "createdAt", "updatedAt",
  "closedAt", "gameId", "cardIndex", "foil"
)
SELECT
  c."id", 'CARD', c."sellerId", c."priceCoins", c."status", c."buyerId", c."createdAt",
  COALESCE(c."closedAt", c."createdAt"), c."closedAt", c."gameId", c."cardIndex", c."foil"
FROM "card_listing" AS c
ON CONFLICT ("id") DO NOTHING;

-- 3. Storefront products: price → priceCoins, creatorId → sellerId, active → status.
INSERT INTO "listing" (
  "id", "kind", "sellerId", "priceCoins", "status", "createdAt", "updatedAt",
  "title", "description", "deliverable", "salesCount"
)
SELECT
  p."id", 'PRODUCT', p."creatorId", p."price",
  CASE WHEN p."active" THEN 'ACTIVE'::"ListingStatus" ELSE 'CANCELED'::"ListingStatus" END,
  p."createdAt", p."updatedAt", p."title", p."description", p."deliverable", p."salesCount"
FROM "storefront_product" AS p
ON CONFLICT ("id") DO NOTHING;

-- 4. Storefront purchases (after the products they point at).
INSERT INTO "listing_purchase" ("id", "listingId", "buyerId", "pricePaid", "createdAt")
SELECT s."id", s."productId", s."buyerId", s."pricePaid", s."createdAt"
FROM "storefront_purchase" AS s
ON CONFLICT ("id") DO NOTHING;

-- ═══ 2 + 3. Chat and live rooms: the swap-window re-copy ═════════════════════

DO $$
DECLARE
  chat_cutoff timestamp(3);
  room_cutoff timestamp(3);
BEGIN
  SELECT (started_at AT TIME ZONE 'UTC')::timestamp(3) - interval '1 minute' INTO chat_cutoff
    FROM "_prisma_migrations"
   WHERE migration_name = '20261120040000_chat_unify' AND finished_at IS NOT NULL;
  IF chat_cutoff IS NULL THEN
    RAISE EXCEPTION 'expand migration 20261120040000_chat_unify has not run';
  END IF;
  SELECT (started_at AT TIME ZONE 'UTC')::timestamp(3) - interval '1 minute' INTO room_cutoff
    FROM "_prisma_migrations"
   WHERE migration_name = '20261120050100_live_rooms_expand' AND finished_at IS NOT NULL;
  IF room_cutoff IS NULL THEN
    RAISE EXCEPTION 'expand migration 20261120050100_live_rooms_expand has not run';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "_prisma_migrations"
                  WHERE migration_name = '20261120030000_listings_one_model' AND finished_at IS NOT NULL) THEN
    RAISE EXCEPTION 'expand migration 20261120030000_listings_one_model has not run';
  END IF;

  -- 2a. DMs (3a of the expand). A pair whose "dmKey" the new release already
  --     holds under another id is skipped here (the unique key); its members
  --     and messages go to that chat below.
  INSERT INTO "chat" ("id", "kind", "dmKey", "lastMessageAt", "createdAt", "disappearAfterSec", "themeKey")
  SELECT c."id", 'dm', c."participantOneId" || ':' || c."participantTwoId", c."lastMessageAt",
         c."createdAt", c."disappearAfterSec", c."themeKey"
  FROM "conversation" c
  WHERE c."createdAt" >= chat_cutoff
  ON CONFLICT DO NOTHING;

  INSERT INTO "chat_member" ("id", "chatId", "userId", "slot", "lastReadAt", "joinedAt")
  SELECT 'dm' || p."slot" || '_' || c."id", c."id", p."userId", p."slot",
         COALESCE(
           (SELECT max(m."createdAt") FROM "direct_message" m
            WHERE m."conversationId" = c."id" AND m."senderId" <> p."userId" AND m."read"),
           c."createdAt"),
         c."createdAt"
  FROM "conversation" c
  CROSS JOIN LATERAL (
    VALUES (1::SMALLINT, c."participantOneId"), (2::SMALLINT, c."participantTwoId")
  ) AS p("slot", "userId")
  WHERE (p."slot" = 1 OR c."participantTwoId" <> c."participantOneId")
    AND c."createdAt" >= chat_cutoff
    AND EXISTS (SELECT 1 FROM "chat" AS ch WHERE ch."id" = c."id")
  ON CONFLICT DO NOTHING;

  -- 2b. Group chats and their members (3b of the expand).
  INSERT INTO "chat" ("id", "kind", "name", "ownerId", "lastMessageAt", "createdAt", "disappearAfterSec", "themeKey")
  SELECT g."id", 'group', g."name", g."ownerId", g."lastMessageAt", g."createdAt", g."disappearAfterSec", g."themeKey"
  FROM "group_chat" g
  WHERE g."createdAt" >= chat_cutoff
  ON CONFLICT DO NOTHING;

  INSERT INTO "chat_member" ("id", "chatId", "userId", "slot", "lastReadAt", "joinedAt")
  SELECT m."id", m."groupId", m."userId", NULL, m."lastReadAt", m."joinedAt"
  FROM "group_chat_member" m
  WHERE m."joinedAt" >= chat_cutoff
    AND EXISTS (SELECT 1 FROM "chat" AS ch WHERE ch."id" = m."groupId" AND ch."kind" = 'group')
  ON CONFLICT DO NOTHING;

  -- 2c. Messages (3c of the expand). A DM message goes to the chat with the
  --     conversation's id, or else to the chat that holds the same pair.
  INSERT INTO "chat_message" (
    "id", "chatId", "senderId", "content", "gifUrl", "imageUrls", "read", "createdAt", "editedAt",
    "deletedAt", "deletedBy", "audioUrl", "audioDurationMs", "audioPeaks", "kind", "meta",
    "expiresAt", "attachFlags", "forwardCount"
  )
  SELECT m."id", t."chatId", m."senderId", m."content", m."gifUrl", m."imageUrls", m."read",
         m."createdAt", m."editedAt", m."deletedAt", m."deletedBy", m."audioUrl", m."audioDurationMs",
         m."audioPeaks", m."kind", m."meta", m."expiresAt", m."attachFlags", m."forwardCount"
  FROM "direct_message" m
  JOIN "conversation" cv ON cv."id" = m."conversationId"
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      (SELECT ch."id" FROM "chat" ch WHERE ch."id" = cv."id" AND ch."kind" = 'dm'),
      (SELECT ch."id" FROM "chat" ch
        WHERE ch."dmKey" = cv."participantOneId" || ':' || cv."participantTwoId" AND ch."kind" = 'dm')
    ) AS "chatId"
  ) AS t
  WHERE m."createdAt" >= chat_cutoff
    AND (m."expiresAt" IS NULL OR m."expiresAt" > CURRENT_TIMESTAMP)
    AND t."chatId" IS NOT NULL
  ON CONFLICT DO NOTHING;

  -- One statement, so a side-thread reply and its parent arrive together. A
  -- reply whose parent is in neither the new table nor this batch is skipped.
  INSERT INTO "chat_message" (
    "id", "chatId", "senderId", "content", "gifUrl", "imageUrls", "pollQuestion", "pollOptions",
    "read", "createdAt", "editedAt", "deletedAt", "deletedBy", "audioUrl", "audioDurationMs",
    "audioPeaks", "kind", "meta", "expiresAt", "attachFlags", "forwardCount", "threadParentId",
    "replyCount"
  )
  WITH batch AS (
    SELECT m.* FROM "group_message" m
    WHERE m."createdAt" >= chat_cutoff
      AND (m."expiresAt" IS NULL OR m."expiresAt" > CURRENT_TIMESTAMP)
      AND EXISTS (SELECT 1 FROM "chat" AS ch WHERE ch."id" = m."groupId" AND ch."kind" = 'group')
  )
  SELECT m."id", m."groupId", m."senderId", m."content", m."gifUrl", m."imageUrls", m."pollQuestion",
         m."pollOptions", false, m."createdAt", m."editedAt", m."deletedAt", m."deletedBy",
         m."audioUrl", m."audioDurationMs", m."audioPeaks", m."kind", m."meta", m."expiresAt",
         m."attachFlags", m."forwardCount", m."threadParentId", m."replyCount"
  FROM batch m
  WHERE m."threadParentId" IS NULL
     OR EXISTS (SELECT 1 FROM "chat_message" AS p WHERE p."id" = m."threadParentId")
     OR EXISTS (SELECT 1 FROM batch AS p WHERE p."id" = m."threadParentId" AND p."threadParentId" IS NULL)
  ON CONFLICT DO NOTHING;

  -- 2d. Reactions and poll votes (3d of the expand), on messages that exist.
  INSERT INTO "chat_message_reaction" ("id", "messageId", "userId", "emoji", "createdAt")
  SELECT r."id", r."messageId", r."userId", r."emoji", r."createdAt"
  FROM (
    SELECT r."id", r."messageId", r."userId", r."emoji", r."createdAt" FROM "direct_message_reaction" r
    UNION ALL
    SELECT r."id", r."messageId", r."userId", r."emoji", r."createdAt" FROM "group_message_reaction" r
  ) AS r
  WHERE r."createdAt" >= chat_cutoff
    AND EXISTS (SELECT 1 FROM "chat_message" AS m WHERE m."id" = r."messageId")
  ON CONFLICT DO NOTHING;

  INSERT INTO "chat_poll_vote" ("id", "messageId", "userId", "optionIdx", "createdAt")
  SELECT v."id", v."messageId", v."userId", v."optionIdx", v."createdAt"
  FROM (
    SELECT v."id", v."messageId", v."userId", v."optionIdx", v."createdAt" FROM "direct_poll_vote" v
    UNION ALL
    SELECT v."id", v."messageId", v."userId", v."optionIdx", v."createdAt" FROM "group_poll_vote" v
  ) AS v
  WHERE v."createdAt" >= chat_cutoff
    AND EXISTS (SELECT 1 FROM "chat_message" AS m WHERE m."id" = v."messageId")
  ON CONFLICT DO NOTHING;

  -- 3a. space -> group_call (step 1 of the live-rooms expand copy).
  INSERT INTO "group_call" (
    "id", "hostId", "origin", "communityId", "partyId", "conversationId", "status",
    "createdAt", "startedAt", "endedAt", "peakParticipants",
    "title", "scheduledAt", "pinned", "recordChat"
  )
  SELECT
    s."id", s."hostId",
    (CASE WHEN s."communityId" IS NULL THEN 'PROFILE' ELSE 'COMMUNITY' END)::"GroupCallOrigin",
    s."communityId", NULL, NULL,
    (CASE s."status"::text WHEN 'SCHEDULED' THEN 'SCHEDULED' WHEN 'LIVE' THEN 'ACTIVE' ELSE 'ENDED' END)::"GroupCallStatus",
    s."createdAt", s."startedAt", s."endedAt", 0,
    s."title", s."scheduledAt", s."pinned", s."recordChat"
  FROM "space" AS s
  WHERE s."createdAt" >= room_cutoff
  ON CONFLICT DO NOTHING;

  -- 3b. space_message -> group_call_message (step 2). A space message was
  --     only ever inserted, and only its room's id ties it to a group_call.
  INSERT INTO "group_call_message" ("id", "callId", "userId", "body", "createdAt")
  SELECT m."id", m."spaceId", m."userId", m."body", m."createdAt"
  FROM "space_message" AS m
  WHERE m."createdAt" >= room_cutoff
    AND EXISTS (SELECT 1 FROM "group_call" AS g WHERE g."id" = m."spaceId")
  ON CONFLICT DO NOTHING;
END $$;

-- ═══ 4. Drop the mirrors, then what nothing reads any more ══════════════════

-- Listings (both directions).
DROP TRIGGER IF EXISTS "listing_mirror" ON "listing";
DROP TRIGGER IF EXISTS "listing_mirror" ON "listing_purchase";
DROP TRIGGER IF EXISTS "listing_mirror" ON "market_listing";
DROP TRIGGER IF EXISTS "listing_mirror" ON "card_listing";
DROP TRIGGER IF EXISTS "listing_mirror" ON "storefront_product";
DROP TRIGGER IF EXISTS "listing_mirror" ON "storefront_purchase";
DROP FUNCTION IF EXISTS "listing_mirror_to_legacy"();
DROP FUNCTION IF EXISTS "listing_purchase_mirror_to_legacy"();
DROP FUNCTION IF EXISTS "listing_mirror_from_market_listing"();
DROP FUNCTION IF EXISTS "listing_mirror_from_card_listing"();
DROP FUNCTION IF EXISTS "listing_mirror_from_storefront_product"();
DROP FUNCTION IF EXISTS "listing_mirror_from_storefront_purchase"();

-- Chat (old -> new only). "chat_member_dm_cascade" stays.
DROP TRIGGER IF EXISTS "chat_mirror" ON "conversation";
DROP TRIGGER IF EXISTS "chat_mirror" ON "group_chat";
DROP TRIGGER IF EXISTS "chat_mirror" ON "group_chat_member";
DROP TRIGGER IF EXISTS "chat_mirror" ON "direct_message";
DROP TRIGGER IF EXISTS "chat_mirror" ON "group_message";
DROP TRIGGER IF EXISTS "chat_mirror" ON "direct_message_reaction";
DROP TRIGGER IF EXISTS "chat_mirror" ON "group_message_reaction";
DROP TRIGGER IF EXISTS "chat_mirror" ON "direct_poll_vote";
DROP TRIGGER IF EXISTS "chat_mirror" ON "group_poll_vote";
DROP FUNCTION IF EXISTS "chat_mirror_conversation"();
DROP FUNCTION IF EXISTS "chat_mirror_group_chat"();
DROP FUNCTION IF EXISTS "chat_mirror_group_chat_member"();
DROP FUNCTION IF EXISTS "chat_mirror_direct_message"();
DROP FUNCTION IF EXISTS "chat_mirror_group_message"();
DROP FUNCTION IF EXISTS "chat_mirror_reaction"();
DROP FUNCTION IF EXISTS "chat_mirror_poll_vote"();

-- Live rooms (old -> new only).
DROP TRIGGER IF EXISTS "live_room_mirror_space" ON "space";
DROP TRIGGER IF EXISTS "live_room_mirror_space_message" ON "space_message";
DROP FUNCTION IF EXISTS "live_room_mirror_space"();
DROP FUNCTION IF EXISTS "live_room_mirror_space_message"();

-- Listings. Purchases first: they reference the products.
DROP TABLE IF EXISTS "storefront_purchase";
DROP TABLE IF EXISTS "storefront_product";
DROP TABLE IF EXISTS "market_listing";
DROP TABLE IF EXISTS "card_listing";

-- Chat. Children first: votes and reactions, messages, members, then chats.
DROP TABLE IF EXISTS "direct_poll_vote";
DROP TABLE IF EXISTS "group_poll_vote";
DROP TABLE IF EXISTS "direct_message_reaction";
DROP TABLE IF EXISTS "group_message_reaction";
DROP TABLE IF EXISTS "direct_message";
DROP TABLE IF EXISTS "group_message";
DROP TABLE IF EXISTS "group_chat_member";
DROP TABLE IF EXISTS "group_chat";
DROP TABLE IF EXISTS "conversation";

-- Live rooms; the enum once no column uses it.
DROP TABLE IF EXISTS "space_message";
DROP TABLE IF EXISTS "space";
DROP TYPE IF EXISTS "SpaceStatus";

-- Feeds (#1730/#1732): people live in custom_feed_member.
ALTER TABLE "custom_feed" DROP COLUMN IF EXISTS "authorIds";
