-- P04 messaging (M1 M3 M5 M6 M7 M8 M9 M10): additive only — new nullable/defaulted
-- columns on existing tables, four new tables, and a backfill of attachFlags for old rows.
--
-- migration-safety: acknowledged[create-index-not-concurrent] the five indexes on
-- "direct_message" / "group_message" take a SHARE lock (reads continue, writes wait)
-- for the length of each build, and Prisma's migration transaction forbids
-- CONCURRENTLY. At this site's message volume each build is a sub-second scan.
-- LARGE-TABLE DEPLOY NOTE: if either table has grown into the millions of rows,
-- build these out of band first, off-peak, and the IF-less statements below will
-- then fail fast — so instead mark this migration applied after running:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "direct_message_conversationId_attachFlags_createdAt_idx" ON "direct_message"("conversationId","attachFlags","createdAt");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "direct_message_expiresAt_idx" ON "direct_message"("expiresAt");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "group_message_groupId_attachFlags_createdAt_idx" ON "group_message"("groupId","attachFlags","createdAt");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "group_message_threadParentId_createdAt_idx" ON "group_message"("threadParentId","createdAt");
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "group_message_expiresAt_idx" ON "group_message"("expiresAt");
-- (and the rest of this file's DDL), then `prisma migrate resolve --applied 20261012100400_messaging_plus`.

-- AlterTable
ALTER TABLE "conversation" ADD COLUMN     "disappearAfterSec" INTEGER,
ADD COLUMN     "themeKey" VARCHAR(24);

-- AlterTable
ALTER TABLE "direct_message" ADD COLUMN     "attachFlags" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "forwardCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "kind" VARCHAR(16) NOT NULL DEFAULT 'text',
ADD COLUMN     "meta" JSONB;

-- AlterTable
ALTER TABLE "group_chat" ADD COLUMN     "disappearAfterSec" INTEGER,
ADD COLUMN     "themeKey" VARCHAR(24);

-- AlterTable
ALTER TABLE "group_message" ADD COLUMN     "attachFlags" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "forwardCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "kind" VARCHAR(16) NOT NULL DEFAULT 'text',
ADD COLUMN     "meta" JSONB,
ADD COLUMN     "replyCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "threadParentId" TEXT;

-- AlterTable
ALTER TABLE "conversation_pref" ADD COLUMN     "hideReceipts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hideTyping" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "chat_folder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_folder_item" (
    "folderId" TEXT NOT NULL,
    "scopeKey" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_folder_item_pkey" PRIMARY KEY ("folderId","scopeKey")
);

-- CreateTable
CREATE TABLE "chat_pin" (
    "id" TEXT NOT NULL,
    "scopeKey" VARCHAR(80) NOT NULL,
    "messageId" VARCHAR(40) NOT NULL,
    "pinnedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_pin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_poll_vote" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionIdx" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_poll_vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_folder_userId_position_idx" ON "chat_folder"("userId", "position");

-- CreateIndex
CREATE INDEX "chat_pin_scopeKey_createdAt_idx" ON "chat_pin"("scopeKey", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "chat_pin_messageId_idx" ON "chat_pin"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_pin_scopeKey_messageId_key" ON "chat_pin"("scopeKey", "messageId");

-- CreateIndex
CREATE INDEX "direct_poll_vote_messageId_idx" ON "direct_poll_vote"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "direct_poll_vote_messageId_userId_key" ON "direct_poll_vote"("messageId", "userId");

-- CreateIndex
CREATE INDEX "direct_message_conversationId_attachFlags_createdAt_idx" ON "direct_message"("conversationId", "attachFlags", "createdAt");

-- CreateIndex
CREATE INDEX "direct_message_expiresAt_idx" ON "direct_message"("expiresAt");

-- CreateIndex
CREATE INDEX "group_message_groupId_attachFlags_createdAt_idx" ON "group_message"("groupId", "attachFlags", "createdAt");

-- CreateIndex
CREATE INDEX "group_message_threadParentId_createdAt_idx" ON "group_message"("threadParentId", "createdAt");

-- CreateIndex
CREATE INDEX "group_message_expiresAt_idx" ON "group_message"("expiresAt");

-- AddForeignKey
ALTER TABLE "group_message" ADD CONSTRAINT "group_message_threadParentId_fkey" FOREIGN KEY ("threadParentId") REFERENCES "group_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_folder" ADD CONSTRAINT "chat_folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_folder_item" ADD CONSTRAINT "chat_folder_item_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "chat_folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_pin" ADD CONSTRAINT "chat_pin_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_poll_vote" ADD CONSTRAINT "direct_poll_vote_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "direct_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_poll_vote" ADD CONSTRAINT "direct_poll_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill the M6 shared-media flags for messages sent before this migration, so
-- the Media & links panel is complete for old chats too. Only rows that actually
-- carry media or a link are touched.
UPDATE "direct_message" SET "attachFlags" = 1
  WHERE cardinality("imageUrls") > 0 OR "gifUrl" IS NOT NULL OR "audioUrl" IS NOT NULL;
UPDATE "direct_message" SET "attachFlags" = "attachFlags" | 2
  WHERE "content" ~* 'https?://';
UPDATE "group_message" SET "attachFlags" = 1
  WHERE cardinality("imageUrls") > 0 OR "gifUrl" IS NOT NULL OR "audioUrl" IS NOT NULL;
UPDATE "group_message" SET "attachFlags" = "attachFlags" | 2
  WHERE "content" ~* 'https?://';
