-- CreateEnum
CREATE TYPE "tf2_hud_visibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');

-- CreateTable
CREATE TABLE "tf2_hud" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(2000) NOT NULL DEFAULT '',
    "tags" TEXT[],
    "visibility" "tf2_hud_visibility" NOT NULL DEFAULT 'PRIVATE',
    "baseCommit" VARCHAR(64) NOT NULL,
    "forkOfId" TEXT,
    "latestVersion" INTEGER NOT NULL DEFAULT 0,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "totalBytes" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "forkCount" INTEGER NOT NULL DEFAULT 0,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tf2_hud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tf2_hud_version" (
    "id" TEXT NOT NULL,
    "hudId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "message" VARCHAR(200) NOT NULL DEFAULT '',
    "autosave" BOOLEAN NOT NULL DEFAULT false,
    "manifest" JSONB NOT NULL,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "totalBytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tf2_hud_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tf2_hud_like" (
    "userId" TEXT NOT NULL,
    "hudId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tf2_hud_like_pkey" PRIMARY KEY ("userId","hudId")
);

-- CreateTable
CREATE TABLE "tf2_hud_share" (
    "id" TEXT NOT NULL,
    "hudId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tf2_hud_share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tf2_hud_blob" (
    "sha1" VARCHAR(40) NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tf2_hud_blob_pkey" PRIMARY KEY ("sha1")
);

-- CreateTable
CREATE TABLE "tf2_hud_user_blob" (
    "userId" TEXT NOT NULL,
    "sha1" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tf2_hud_user_blob_pkey" PRIMARY KEY ("userId","sha1")
);

-- CreateIndex
CREATE UNIQUE INDEX "tf2_hud_slug_key" ON "tf2_hud"("slug");

-- CreateIndex
CREATE INDEX "tf2_hud_visibility_updatedAt_idx" ON "tf2_hud"("visibility", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "tf2_hud_visibility_likeCount_idx" ON "tf2_hud"("visibility", "likeCount" DESC);

-- CreateIndex
CREATE INDEX "tf2_hud_visibility_forkCount_idx" ON "tf2_hud"("visibility", "forkCount" DESC);

-- CreateIndex
CREATE INDEX "tf2_hud_ownerId_updatedAt_idx" ON "tf2_hud"("ownerId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "tf2_hud_forkOfId_idx" ON "tf2_hud"("forkOfId");

-- CreateIndex
CREATE UNIQUE INDEX "tf2_hud_version_hudId_number_key" ON "tf2_hud_version"("hudId", "number");

-- CreateIndex
CREATE INDEX "tf2_hud_like_hudId_idx" ON "tf2_hud_like"("hudId");

-- CreateIndex
CREATE UNIQUE INDEX "tf2_hud_share_token_key" ON "tf2_hud_share"("token");

-- CreateIndex
CREATE INDEX "tf2_hud_share_hudId_idx" ON "tf2_hud_share"("hudId");

-- CreateIndex
CREATE INDEX "tf2_hud_user_blob_sha1_idx" ON "tf2_hud_user_blob"("sha1");

-- AddForeignKey
ALTER TABLE "tf2_hud" ADD CONSTRAINT "tf2_hud_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tf2_hud" ADD CONSTRAINT "tf2_hud_forkOfId_fkey" FOREIGN KEY ("forkOfId") REFERENCES "tf2_hud"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tf2_hud_version" ADD CONSTRAINT "tf2_hud_version_hudId_fkey" FOREIGN KEY ("hudId") REFERENCES "tf2_hud"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tf2_hud_like" ADD CONSTRAINT "tf2_hud_like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tf2_hud_like" ADD CONSTRAINT "tf2_hud_like_hudId_fkey" FOREIGN KEY ("hudId") REFERENCES "tf2_hud"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tf2_hud_share" ADD CONSTRAINT "tf2_hud_share_hudId_fkey" FOREIGN KEY ("hudId") REFERENCES "tf2_hud"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tf2_hud_user_blob" ADD CONSTRAINT "tf2_hud_user_blob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tf2_hud_user_blob" ADD CONSTRAINT "tf2_hud_user_blob_sha1_fkey" FOREIGN KEY ("sha1") REFERENCES "tf2_hud_blob"("sha1") ON DELETE CASCADE ON UPDATE CASCADE;

