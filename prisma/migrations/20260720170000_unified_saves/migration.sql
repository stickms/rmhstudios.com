-- CreateTable
CREATE TABLE "save_folder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "save_folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_item" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "folderId" TEXT,
    "entityType" VARCHAR(24) NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "save_folder_userId_sortOrder_idx" ON "save_folder"("userId", "sortOrder");

-- CreateIndex
CREATE INDEX "saved_item_userId_folderId_createdAt_idx" ON "saved_item"("userId", "folderId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "saved_item_userId_entityType_entityId_key" ON "saved_item"("userId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "save_folder" ADD CONSTRAINT "save_folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_item" ADD CONSTRAINT "saved_item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_item" ADD CONSTRAINT "saved_item_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "save_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill existing post bookmarks (rmheet_bookmark) into unified saves.
INSERT INTO "saved_item" ("id", "userId", "entityType", "entityId", "createdAt")
SELECT "id", "userId", 'rmhark', "rmheetId", "createdAt" FROM "rmheet_bookmark"
ON CONFLICT ("userId", "entityType", "entityId") DO NOTHING;
