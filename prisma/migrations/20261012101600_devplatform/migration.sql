-- AlterTable
ALTER TABLE "developer_api_key" ADD COLUMN     "testMode" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "dev_recipe" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "trigger" VARCHAR(24) NOT NULL,
    "triggerConfig" JSONB NOT NULL DEFAULT '{}',
    "action" VARCHAR(24) NOT NULL,
    "actionConfig" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFiredAt" TIMESTAMP(3),
    "fireCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dev_recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_note" (
    "id" TEXT NOT NULL,
    "version" VARCHAR(40) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dev_recipe_userId_trigger_idx" ON "dev_recipe"("userId", "trigger");

-- CreateIndex
CREATE INDEX "dev_recipe_enabled_trigger_lastCheckedAt_idx" ON "dev_recipe"("enabled", "trigger", "lastCheckedAt");

-- CreateIndex
CREATE INDEX "release_note_publishedAt_idx" ON "release_note"("publishedAt");

-- AddForeignKey
ALTER TABLE "dev_recipe" ADD CONSTRAINT "dev_recipe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
