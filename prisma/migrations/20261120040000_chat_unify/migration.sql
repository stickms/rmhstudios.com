-- Expand step: one chat model for direct messages and group chats.
--
-- "conversation" + "direct_message" + "direct_message_reaction" +
-- "direct_poll_vote" and "group_chat" + "group_chat_member" + "group_message" +
-- "group_message_reaction" + "group_poll_vote" stored the same things twice.
-- They become "chat" (kind 'dm' | 'group'), "chat_member" (a DM's participants
-- are its members), "chat_message", "chat_message_reaction" and
-- "chat_poll_vote". Every row keeps its old id; the ids of the two families
-- are cuids and are checked below never to collide (the migration aborts, and
-- the deploy with it, before anything is written if one ever did).
--
-- Additive only, and in this order, in the one transaction a migration runs in:
--   1. The old tables are locked against writes (EXCLUSIVE: reads go on). The
--      previous release's writes queue for the length of this migration — a
--      few seconds — instead of landing between the copy and the triggers,
--      which would lose them.
--   2. The new tables are created and every row is copied (step 3 below is
--      re-runnable as is: ON CONFLICT DO NOTHING on reused ids).
--   3. MIRROR TRIGGERS on the old tables are created, so from the commit on,
--      every write the previous release makes during the blue/green swap
--      reaches the new tables, which are all the new release reads or writes:
--        * INSERT — the row is inserted with its old id.
--        * UPDATE — applied as a DELTA: only the columns the old release
--                   changed are written, so an edit, unsend, read mark,
--                   checklist toggle or timer change made on the old release
--                   does not overwrite a different change the new release
--                   made to the same row. "lastMessageAt" and "lastReadAt"
--                   only move forward; "replyCount" and "forwardCount" take the
--                   old release's increment. An UPDATE never creates a row: a
--                   row missing from the new tables after the copy was deleted
--                   by the new release (a member who left, an expired
--                   message), and must stay gone.
--        * DELETE — the same row is deleted (hard deletes are the expiry
--                   sweep, removing a reaction or vote, leaving or deleting a
--                   group; unsend is an UPDATE). A membership is removed by
--                   (chat, user), never by row id, so a member who left or was
--                   removed on the old release is never left in the new chat.
--      A mirror trigger never fails the old release's statement: an error is
--      a WARNING, and the contract's re-run of the copy fills the row in.
--
-- Read state carries over exactly: a DM's is per message ("read", copied
-- as is), a group's is the member's "lastReadAt" (copied as is).
--
-- The contract (a later release) re-runs the copy in section 3, drops the
-- triggers and functions, then the old tables.

-- ─── 1. Hold the previous release's writes for the length of the copy ───────
LOCK TABLE "conversation", "direct_message", "direct_message_reaction", "direct_poll_vote",
           "group_chat", "group_chat_member", "group_message", "group_message_reaction",
           "group_poll_vote"
  IN EXCLUSIVE MODE;

-- The two families share the new tables' id spaces. cuids do not collide, but
-- a seed or a hand-written row could; abort before writing anything if any id
-- is in both (nothing is half-copied: the whole migration rolls back).
DO $$
DECLARE n BIGINT;
BEGIN
  SELECT
    (SELECT count(*) FROM "conversation" c JOIN "group_chat" g ON g."id" = c."id") +
    (SELECT count(*) FROM "direct_message" d JOIN "group_message" g ON g."id" = d."id") +
    (SELECT count(*) FROM "direct_message_reaction" d JOIN "group_message_reaction" g ON g."id" = d."id") +
    (SELECT count(*) FROM "direct_poll_vote" d JOIN "group_poll_vote" g ON g."id" = d."id") +
    (SELECT count(*) FROM "group_chat_member" g WHERE g."id" LIKE 'dm1\_%' OR g."id" LIKE 'dm2\_%')
  INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'chat unify: % id(s) exist in both the DM and the group tables; map them before copying', n;
  END IF;
END $$;

-- ─── 2. The new tables ──────────────────────────────────────────────────────

CREATE TABLE "chat" (
    "id" TEXT NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "dmKey" VARCHAR(80),
    "name" VARCHAR(60),
    "ownerId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disappearAfterSec" INTEGER,
    "themeKey" VARCHAR(24),

    CONSTRAINT "chat_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "chat_member" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slot" SMALLINT,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_member_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "chat_message" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "gifUrl" TEXT,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pollQuestion" VARCHAR(300),
    "pollOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(12),
    "audioUrl" VARCHAR(500),
    "audioDurationMs" INTEGER,
    "audioPeaks" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "kind" VARCHAR(16) NOT NULL DEFAULT 'text',
    "meta" JSONB,
    "expiresAt" TIMESTAMP(3),
    "attachFlags" INTEGER NOT NULL DEFAULT 0,
    "forwardCount" INTEGER NOT NULL DEFAULT 0,
    "threadParentId" TEXT,
    "replyCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "chat_message_reaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_reaction_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "chat_poll_vote" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionIdx" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_poll_vote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "chat_dmKey_key" ON "chat"("dmKey");
CREATE INDEX "chat_ownerId_idx" ON "chat"("ownerId");
CREATE INDEX "chat_member_userId_idx" ON "chat_member"("userId");
CREATE UNIQUE INDEX "chat_member_chatId_userId_key" ON "chat_member"("chatId", "userId");
CREATE INDEX "chat_message_chatId_createdAt_idx" ON "chat_message"("chatId", "createdAt");
CREATE INDEX "chat_message_senderId_idx" ON "chat_message"("senderId");
CREATE INDEX "chat_message_chatId_attachFlags_createdAt_idx" ON "chat_message"("chatId", "attachFlags", "createdAt");
CREATE INDEX "chat_message_threadParentId_createdAt_idx" ON "chat_message"("threadParentId", "createdAt");
CREATE INDEX "chat_message_expiresAt_idx" ON "chat_message"("expiresAt");
CREATE INDEX "chat_message_chatId_read_senderId_idx" ON "chat_message"("chatId", "read", "senderId");
CREATE INDEX "chat_message_reaction_messageId_idx" ON "chat_message_reaction"("messageId");
CREATE UNIQUE INDEX "chat_message_reaction_messageId_userId_emoji_key" ON "chat_message_reaction"("messageId", "userId", "emoji");
CREATE INDEX "chat_poll_vote_messageId_idx" ON "chat_poll_vote"("messageId");
CREATE UNIQUE INDEX "chat_poll_vote_messageId_userId_key" ON "chat_poll_vote"("messageId", "userId");
ALTER TABLE "chat" ADD CONSTRAINT "chat_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_member" ADD CONSTRAINT "chat_member_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_member" ADD CONSTRAINT "chat_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_threadParentId_fkey" FOREIGN KEY ("threadParentId") REFERENCES "chat_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_message_reaction" ADD CONSTRAINT "chat_message_reaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_message_reaction" ADD CONSTRAINT "chat_message_reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_poll_vote" ADD CONSTRAINT "chat_poll_vote_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_poll_vote" ADD CONSTRAINT "chat_poll_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 3. Copy (idempotent; the contract re-runs this section before dropping) ─

-- 3a. DMs. dmKey is the ordered pair the old unique constraint was on, so every
--     conversation maps to exactly one key (callers keep sorting the pair).
INSERT INTO "chat" ("id", "kind", "dmKey", "lastMessageAt", "createdAt", "disappearAfterSec", "themeKey")
SELECT c."id", 'dm', c."participantOneId" || ':' || c."participantTwoId", c."lastMessageAt",
       c."createdAt", c."disappearAfterSec", c."themeKey"
FROM "conversation" c
ON CONFLICT DO NOTHING;

-- Both participants (one row for Saved Messages, a conversation with yourself).
-- A DM's read state stays per message; lastReadAt is filled with the newest
-- message from the other side this member has read, for information only.
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
WHERE p."slot" = 1 OR c."participantTwoId" <> c."participantOneId"
ON CONFLICT DO NOTHING;

-- 3b. Group chats and their members (lastReadAt is the read state: as is).
INSERT INTO "chat" ("id", "kind", "name", "ownerId", "lastMessageAt", "createdAt", "disappearAfterSec", "themeKey")
SELECT g."id", 'group', g."name", g."ownerId", g."lastMessageAt", g."createdAt", g."disappearAfterSec", g."themeKey"
FROM "group_chat" g
ON CONFLICT DO NOTHING;

INSERT INTO "chat_member" ("id", "chatId", "userId", "slot", "lastReadAt", "joinedAt")
SELECT m."id", m."groupId", m."userId", NULL, m."lastReadAt", m."joinedAt"
FROM "group_chat_member" m
ON CONFLICT DO NOTHING;

-- 3c. Messages, tombstones (deletedAt/deletedBy), edits and read flags as is.
INSERT INTO "chat_message" (
  "id", "chatId", "senderId", "content", "gifUrl", "imageUrls", "read", "createdAt", "editedAt",
  "deletedAt", "deletedBy", "audioUrl", "audioDurationMs", "audioPeaks", "kind", "meta",
  "expiresAt", "attachFlags", "forwardCount"
)
SELECT m."id", m."conversationId", m."senderId", m."content", m."gifUrl", m."imageUrls", m."read",
       m."createdAt", m."editedAt", m."deletedAt", m."deletedBy", m."audioUrl", m."audioDurationMs",
       m."audioPeaks", m."kind", m."meta", m."expiresAt", m."attachFlags", m."forwardCount"
FROM "direct_message" m
ON CONFLICT DO NOTHING;

-- One statement, so a side-thread reply and its parent arrive together (the
-- self-reference is checked at the end of the statement).
INSERT INTO "chat_message" (
  "id", "chatId", "senderId", "content", "gifUrl", "imageUrls", "pollQuestion", "pollOptions",
  "read", "createdAt", "editedAt", "deletedAt", "deletedBy", "audioUrl", "audioDurationMs",
  "audioPeaks", "kind", "meta", "expiresAt", "attachFlags", "forwardCount", "threadParentId",
  "replyCount"
)
SELECT m."id", m."groupId", m."senderId", m."content", m."gifUrl", m."imageUrls", m."pollQuestion",
       m."pollOptions", false, m."createdAt", m."editedAt", m."deletedAt", m."deletedBy",
       m."audioUrl", m."audioDurationMs", m."audioPeaks", m."kind", m."meta", m."expiresAt",
       m."attachFlags", m."forwardCount", m."threadParentId", m."replyCount"
FROM "group_message" m
ON CONFLICT DO NOTHING;

-- 3d. Reactions and poll votes.
INSERT INTO "chat_message_reaction" ("id", "messageId", "userId", "emoji", "createdAt")
SELECT r."id", r."messageId", r."userId", r."emoji", r."createdAt" FROM "direct_message_reaction" r
UNION ALL
SELECT r."id", r."messageId", r."userId", r."emoji", r."createdAt" FROM "group_message_reaction" r
ON CONFLICT DO NOTHING;

INSERT INTO "chat_poll_vote" ("id", "messageId", "userId", "optionIdx", "createdAt")
SELECT v."id", v."messageId", v."userId", v."optionIdx", v."createdAt" FROM "direct_poll_vote" v
UNION ALL
SELECT v."id", v."messageId", v."userId", v."optionIdx", v."createdAt" FROM "group_poll_vote" v
ON CONFLICT DO NOTHING;

-- ─── 4. A DM is deleted with either participant (as "conversation" cascaded) ─
-- Group members leave and the group stays. A DM whose participant is gone (an
-- account hard-deleted) is deleted whole, the other side's messages included,
-- exactly as the old two-FK cascade on "conversation" did. This trigger stays
-- after the contract: it is part of the new model.
CREATE OR REPLACE FUNCTION "chat_member_dm_cascade"() RETURNS trigger AS $$
BEGIN
  DELETE FROM "chat" WHERE "id" = OLD."chatId" AND "kind" = 'dm';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "chat_member_dm_cascade"
AFTER DELETE ON "chat_member"
FOR EACH ROW EXECUTE FUNCTION "chat_member_dm_cascade"();

-- ─── 5. Mirror triggers: the previous release's writes → the new tables ─────
-- Dropped by the contract, with the old tables.

CREATE OR REPLACE FUNCTION "chat_mirror_conversation"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "chat" WHERE "id" = OLD."id" AND "kind" = 'dm';
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO "chat" ("id", "kind", "dmKey", "lastMessageAt", "createdAt", "disappearAfterSec", "themeKey")
    VALUES (NEW."id", 'dm', NEW."participantOneId" || ':' || NEW."participantTwoId", NEW."lastMessageAt",
            NEW."createdAt", NEW."disappearAfterSec", NEW."themeKey")
    ON CONFLICT DO NOTHING;
    INSERT INTO "chat_member" ("id", "chatId", "userId", "slot", "lastReadAt", "joinedAt")
    VALUES ('dm1_' || NEW."id", NEW."id", NEW."participantOneId", 1, NEW."createdAt", NEW."createdAt")
    ON CONFLICT DO NOTHING;
    IF NEW."participantTwoId" <> NEW."participantOneId" THEN
      INSERT INTO "chat_member" ("id", "chatId", "userId", "slot", "lastReadAt", "joinedAt")
      VALUES ('dm2_' || NEW."id", NEW."id", NEW."participantTwoId", 2, NEW."createdAt", NEW."createdAt")
      ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    UPDATE "chat" SET
      "lastMessageAt" = GREATEST("lastMessageAt", NEW."lastMessageAt"),
      "disappearAfterSec" = CASE WHEN NEW."disappearAfterSec" IS DISTINCT FROM OLD."disappearAfterSec"
                                 THEN NEW."disappearAfterSec" ELSE "disappearAfterSec" END,
      "themeKey" = CASE WHEN NEW."themeKey" IS DISTINCT FROM OLD."themeKey"
                        THEN NEW."themeKey" ELSE "themeKey" END
    WHERE "id" = NEW."id";
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'chat mirror: % on % failed: %', TG_OP, TG_TABLE_NAME, SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "chat_mirror_group_chat"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "chat" WHERE "id" = OLD."id" AND "kind" = 'group';
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO "chat" ("id", "kind", "name", "ownerId", "lastMessageAt", "createdAt", "disappearAfterSec", "themeKey")
    VALUES (NEW."id", 'group', NEW."name", NEW."ownerId", NEW."lastMessageAt", NEW."createdAt",
            NEW."disappearAfterSec", NEW."themeKey")
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE "chat" SET
      "name" = CASE WHEN NEW."name" IS DISTINCT FROM OLD."name" THEN NEW."name" ELSE "name" END,
      "ownerId" = CASE WHEN NEW."ownerId" IS DISTINCT FROM OLD."ownerId" THEN NEW."ownerId" ELSE "ownerId" END,
      "lastMessageAt" = GREATEST("lastMessageAt", NEW."lastMessageAt"),
      "disappearAfterSec" = CASE WHEN NEW."disappearAfterSec" IS DISTINCT FROM OLD."disappearAfterSec"
                                 THEN NEW."disappearAfterSec" ELSE "disappearAfterSec" END,
      "themeKey" = CASE WHEN NEW."themeKey" IS DISTINCT FROM OLD."themeKey"
                        THEN NEW."themeKey" ELSE "themeKey" END
    WHERE "id" = NEW."id";
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'chat mirror: % on % failed: %', TG_OP, TG_TABLE_NAME, SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "chat_mirror_group_chat_member"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "chat_member" WHERE "chatId" = OLD."groupId" AND "userId" = OLD."userId";
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO "chat_member" ("id", "chatId", "userId", "slot", "lastReadAt", "joinedAt")
    VALUES (NEW."id", NEW."groupId", NEW."userId", NULL, NEW."lastReadAt", NEW."joinedAt")
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE "chat_member" SET "lastReadAt" = GREATEST("lastReadAt", NEW."lastReadAt")
    WHERE "chatId" = NEW."groupId" AND "userId" = NEW."userId";
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'chat mirror: % on % failed: %', TG_OP, TG_TABLE_NAME, SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "chat_mirror_direct_message"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "chat_message" WHERE "id" = OLD."id";
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO "chat_message" (
      "id", "chatId", "senderId", "content", "gifUrl", "imageUrls", "read", "createdAt", "editedAt",
      "deletedAt", "deletedBy", "audioUrl", "audioDurationMs", "audioPeaks", "kind", "meta",
      "expiresAt", "attachFlags", "forwardCount"
    ) VALUES (
      NEW."id", NEW."conversationId", NEW."senderId", NEW."content", NEW."gifUrl", NEW."imageUrls",
      NEW."read", NEW."createdAt", NEW."editedAt", NEW."deletedAt", NEW."deletedBy", NEW."audioUrl",
      NEW."audioDurationMs", NEW."audioPeaks", NEW."kind", NEW."meta", NEW."expiresAt",
      NEW."attachFlags", NEW."forwardCount"
    ) ON CONFLICT DO NOTHING;
  ELSE
    UPDATE "chat_message" SET
      "content" = CASE WHEN NEW."content" IS DISTINCT FROM OLD."content" THEN NEW."content" ELSE "content" END,
      "gifUrl" = CASE WHEN NEW."gifUrl" IS DISTINCT FROM OLD."gifUrl" THEN NEW."gifUrl" ELSE "gifUrl" END,
      "imageUrls" = CASE WHEN NEW."imageUrls" IS DISTINCT FROM OLD."imageUrls" THEN NEW."imageUrls" ELSE "imageUrls" END,
      "read" = CASE WHEN NEW."read" IS DISTINCT FROM OLD."read" THEN NEW."read" ELSE "read" END,
      "editedAt" = CASE WHEN NEW."editedAt" IS DISTINCT FROM OLD."editedAt" THEN NEW."editedAt" ELSE "editedAt" END,
      "deletedAt" = CASE WHEN NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt" THEN NEW."deletedAt" ELSE "deletedAt" END,
      "deletedBy" = CASE WHEN NEW."deletedBy" IS DISTINCT FROM OLD."deletedBy" THEN NEW."deletedBy" ELSE "deletedBy" END,
      "audioUrl" = CASE WHEN NEW."audioUrl" IS DISTINCT FROM OLD."audioUrl" THEN NEW."audioUrl" ELSE "audioUrl" END,
      "audioDurationMs" = CASE WHEN NEW."audioDurationMs" IS DISTINCT FROM OLD."audioDurationMs" THEN NEW."audioDurationMs" ELSE "audioDurationMs" END,
      "audioPeaks" = CASE WHEN NEW."audioPeaks" IS DISTINCT FROM OLD."audioPeaks" THEN NEW."audioPeaks" ELSE "audioPeaks" END,
      "kind" = CASE WHEN NEW."kind" IS DISTINCT FROM OLD."kind" THEN NEW."kind" ELSE "kind" END,
      "meta" = CASE WHEN NEW."meta"::text IS DISTINCT FROM OLD."meta"::text THEN NEW."meta" ELSE "meta" END,
      "expiresAt" = CASE WHEN NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" THEN NEW."expiresAt" ELSE "expiresAt" END,
      "attachFlags" = CASE WHEN NEW."attachFlags" IS DISTINCT FROM OLD."attachFlags" THEN NEW."attachFlags" ELSE "attachFlags" END,
      "forwardCount" = GREATEST(0, "forwardCount" + (NEW."forwardCount" - OLD."forwardCount"))
    WHERE "id" = NEW."id";
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'chat mirror: % on % failed: %', TG_OP, TG_TABLE_NAME, SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "chat_mirror_group_message"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "chat_message" WHERE "id" = OLD."id";
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO "chat_message" (
      "id", "chatId", "senderId", "content", "gifUrl", "imageUrls", "pollQuestion", "pollOptions",
      "read", "createdAt", "editedAt", "deletedAt", "deletedBy", "audioUrl", "audioDurationMs",
      "audioPeaks", "kind", "meta", "expiresAt", "attachFlags", "forwardCount", "threadParentId",
      "replyCount"
    ) VALUES (
      NEW."id", NEW."groupId", NEW."senderId", NEW."content", NEW."gifUrl", NEW."imageUrls",
      NEW."pollQuestion", NEW."pollOptions", false, NEW."createdAt", NEW."editedAt", NEW."deletedAt",
      NEW."deletedBy", NEW."audioUrl", NEW."audioDurationMs", NEW."audioPeaks", NEW."kind", NEW."meta",
      NEW."expiresAt", NEW."attachFlags", NEW."forwardCount", NEW."threadParentId", NEW."replyCount"
    ) ON CONFLICT DO NOTHING;
  ELSE
    UPDATE "chat_message" SET
      "content" = CASE WHEN NEW."content" IS DISTINCT FROM OLD."content" THEN NEW."content" ELSE "content" END,
      "gifUrl" = CASE WHEN NEW."gifUrl" IS DISTINCT FROM OLD."gifUrl" THEN NEW."gifUrl" ELSE "gifUrl" END,
      "imageUrls" = CASE WHEN NEW."imageUrls" IS DISTINCT FROM OLD."imageUrls" THEN NEW."imageUrls" ELSE "imageUrls" END,
      "pollQuestion" = CASE WHEN NEW."pollQuestion" IS DISTINCT FROM OLD."pollQuestion" THEN NEW."pollQuestion" ELSE "pollQuestion" END,
      "pollOptions" = CASE WHEN NEW."pollOptions" IS DISTINCT FROM OLD."pollOptions" THEN NEW."pollOptions" ELSE "pollOptions" END,
      "editedAt" = CASE WHEN NEW."editedAt" IS DISTINCT FROM OLD."editedAt" THEN NEW."editedAt" ELSE "editedAt" END,
      "deletedAt" = CASE WHEN NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt" THEN NEW."deletedAt" ELSE "deletedAt" END,
      "deletedBy" = CASE WHEN NEW."deletedBy" IS DISTINCT FROM OLD."deletedBy" THEN NEW."deletedBy" ELSE "deletedBy" END,
      "audioUrl" = CASE WHEN NEW."audioUrl" IS DISTINCT FROM OLD."audioUrl" THEN NEW."audioUrl" ELSE "audioUrl" END,
      "audioDurationMs" = CASE WHEN NEW."audioDurationMs" IS DISTINCT FROM OLD."audioDurationMs" THEN NEW."audioDurationMs" ELSE "audioDurationMs" END,
      "audioPeaks" = CASE WHEN NEW."audioPeaks" IS DISTINCT FROM OLD."audioPeaks" THEN NEW."audioPeaks" ELSE "audioPeaks" END,
      "kind" = CASE WHEN NEW."kind" IS DISTINCT FROM OLD."kind" THEN NEW."kind" ELSE "kind" END,
      "meta" = CASE WHEN NEW."meta"::text IS DISTINCT FROM OLD."meta"::text THEN NEW."meta" ELSE "meta" END,
      "expiresAt" = CASE WHEN NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" THEN NEW."expiresAt" ELSE "expiresAt" END,
      "attachFlags" = CASE WHEN NEW."attachFlags" IS DISTINCT FROM OLD."attachFlags" THEN NEW."attachFlags" ELSE "attachFlags" END,
      "forwardCount" = GREATEST(0, "forwardCount" + (NEW."forwardCount" - OLD."forwardCount")),
      "replyCount" = GREATEST(0, "replyCount" + (NEW."replyCount" - OLD."replyCount"))
    WHERE "id" = NEW."id";
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'chat mirror: % on % failed: %', TG_OP, TG_TABLE_NAME, SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Reactions are only inserted and deleted.
CREATE OR REPLACE FUNCTION "chat_mirror_reaction"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "chat_message_reaction"
    WHERE "messageId" = OLD."messageId" AND "userId" = OLD."userId" AND "emoji" = OLD."emoji";
  ELSE
    INSERT INTO "chat_message_reaction" ("id", "messageId", "userId", "emoji", "createdAt")
    VALUES (NEW."id", NEW."messageId", NEW."userId", NEW."emoji", NEW."createdAt")
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'chat mirror: % on % failed: %', TG_OP, TG_TABLE_NAME, SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Poll votes: one per (message, user); changing a vote updates or upserts it.
CREATE OR REPLACE FUNCTION "chat_mirror_poll_vote"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "chat_poll_vote" WHERE "messageId" = OLD."messageId" AND "userId" = OLD."userId";
  ELSE
    INSERT INTO "chat_poll_vote" ("id", "messageId", "userId", "optionIdx", "createdAt")
    VALUES (NEW."id", NEW."messageId", NEW."userId", NEW."optionIdx", NEW."createdAt")
    ON CONFLICT ("messageId", "userId") DO UPDATE SET "optionIdx" = EXCLUDED."optionIdx";
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'chat mirror: % on % failed: %', TG_OP, TG_TABLE_NAME, SQLERRM;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "chat_mirror" AFTER INSERT OR UPDATE OR DELETE ON "conversation"
FOR EACH ROW EXECUTE FUNCTION "chat_mirror_conversation"();
CREATE TRIGGER "chat_mirror" AFTER INSERT OR UPDATE OR DELETE ON "group_chat"
FOR EACH ROW EXECUTE FUNCTION "chat_mirror_group_chat"();
CREATE TRIGGER "chat_mirror" AFTER INSERT OR UPDATE OR DELETE ON "group_chat_member"
FOR EACH ROW EXECUTE FUNCTION "chat_mirror_group_chat_member"();
CREATE TRIGGER "chat_mirror" AFTER INSERT OR UPDATE OR DELETE ON "direct_message"
FOR EACH ROW EXECUTE FUNCTION "chat_mirror_direct_message"();
CREATE TRIGGER "chat_mirror" AFTER INSERT OR UPDATE OR DELETE ON "group_message"
FOR EACH ROW EXECUTE FUNCTION "chat_mirror_group_message"();
CREATE TRIGGER "chat_mirror" AFTER INSERT OR DELETE ON "direct_message_reaction"
FOR EACH ROW EXECUTE FUNCTION "chat_mirror_reaction"();
CREATE TRIGGER "chat_mirror" AFTER INSERT OR DELETE ON "group_message_reaction"
FOR EACH ROW EXECUTE FUNCTION "chat_mirror_reaction"();
CREATE TRIGGER "chat_mirror" AFTER INSERT OR UPDATE OR DELETE ON "direct_poll_vote"
FOR EACH ROW EXECUTE FUNCTION "chat_mirror_poll_vote"();
CREATE TRIGGER "chat_mirror" AFTER INSERT OR UPDATE OR DELETE ON "group_poll_vote"
FOR EACH ROW EXECUTE FUNCTION "chat_mirror_poll_vote"();
