-- CreateTable
CREATE TABLE "tf2_loadout" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(2000) NOT NULL DEFAULT '',
    "tfClass" VARCHAR(12) NOT NULL,
    "slots" JSONB NOT NULL,
    "itemIds" INTEGER[],
    "visibility" "tf2_hud_visibility" NOT NULL DEFAULT 'PRIVATE',
    "forkOfId" TEXT,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "forkCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tf2_loadout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tf2_loadout_like" (
    "userId" TEXT NOT NULL,
    "loadoutId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tf2_loadout_like_pkey" PRIMARY KEY ("userId","loadoutId")
);

-- CreateTable
CREATE TABLE "tf2_loadout_catalog" (
    "id" TEXT NOT NULL,
    "hash" VARCHAR(40) NOT NULL,
    "etag" VARCHAR(200),
    "label" VARCHAR(120) NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "hasIcons" BOOLEAN NOT NULL DEFAULT false,
    "data" BYTEA NOT NULL,
    "builtAt" TIMESTAMP(3) NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tf2_loadout_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tf2_loadout_slug_key" ON "tf2_loadout"("slug");

-- CreateIndex
CREATE INDEX "tf2_loadout_visibility_updatedAt_idx" ON "tf2_loadout"("visibility", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "tf2_loadout_visibility_likeCount_idx" ON "tf2_loadout"("visibility", "likeCount" DESC);

-- CreateIndex
CREATE INDEX "tf2_loadout_visibility_tfClass_idx" ON "tf2_loadout"("visibility", "tfClass");

-- CreateIndex
CREATE INDEX "tf2_loadout_ownerId_updatedAt_idx" ON "tf2_loadout"("ownerId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "tf2_loadout_forkOfId_idx" ON "tf2_loadout"("forkOfId");

-- CreateIndex
CREATE INDEX "tf2_loadout_itemIds_idx" ON "tf2_loadout" USING GIN ("itemIds");

-- CreateIndex
CREATE INDEX "tf2_loadout_like_loadoutId_idx" ON "tf2_loadout_like"("loadoutId");

-- AddForeignKey
ALTER TABLE "tf2_loadout" ADD CONSTRAINT "tf2_loadout_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tf2_loadout" ADD CONSTRAINT "tf2_loadout_forkOfId_fkey" FOREIGN KEY ("forkOfId") REFERENCES "tf2_loadout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tf2_loadout_like" ADD CONSTRAINT "tf2_loadout_like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tf2_loadout_like" ADD CONSTRAINT "tf2_loadout_like_loadoutId_fkey" FOREIGN KEY ("loadoutId") REFERENCES "tf2_loadout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
