-- Emoji & sticker packs.
--
-- Creating a pack is a membership feature; subscribing to and using one is free
-- for everyone. Items are moderated (`status`) before they render in anyone
-- else's conversation.

CREATE TABLE "emoji_pack" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" VARCHAR(48) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" VARCHAR(300),
    "kind" VARCHAR(8) NOT NULL DEFAULT 'emoji',
    "coverUrl" VARCHAR(500),
    "visibility" VARCHAR(8) NOT NULL DEFAULT 'public',
    "status" VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emoji_pack_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "emoji_pack_item" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "kind" VARCHAR(8) NOT NULL DEFAULT 'emoji',
    "url" VARCHAR(500) NOT NULL,
    "alt" VARCHAR(140) NOT NULL,
    "animated" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emoji_pack_item_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "emoji_pack_subscription" (
    "packId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emoji_pack_subscription_pkey" PRIMARY KEY ("packId","userId")
);

CREATE UNIQUE INDEX "emoji_pack_slug_key" ON "emoji_pack"("slug");
CREATE INDEX "emoji_pack_ownerId_createdAt_idx" ON "emoji_pack"("ownerId", "createdAt" DESC);
CREATE INDEX "emoji_pack_status_visibility_subscriberCount_idx" ON "emoji_pack"("status", "visibility", "subscriberCount" DESC);

CREATE UNIQUE INDEX "emoji_pack_item_packId_name_key" ON "emoji_pack_item"("packId", "name");
CREATE INDEX "emoji_pack_item_packId_position_idx" ON "emoji_pack_item"("packId", "position");

CREATE INDEX "emoji_pack_subscription_userId_position_idx" ON "emoji_pack_subscription"("userId", "position");

ALTER TABLE "emoji_pack" ADD CONSTRAINT "emoji_pack_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emoji_pack_item" ADD CONSTRAINT "emoji_pack_item_packId_fkey" FOREIGN KEY ("packId") REFERENCES "emoji_pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emoji_pack_subscription" ADD CONSTRAINT "emoji_pack_subscription_packId_fkey" FOREIGN KEY ("packId") REFERENCES "emoji_pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emoji_pack_subscription" ADD CONSTRAINT "emoji_pack_subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
