-- RMHBox host presets: named per-minigame game settings a member saves and applies in the
-- settings step (lib/rmhbox/presets.server.ts). One new table; nothing existing changes.

-- CreateTable
CREATE TABLE "rmhbox_settings_preset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minigameId" VARCHAR(40) NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "values" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rmhbox_settings_preset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rmhbox_settings_preset_userId_minigameId_idx" ON "rmhbox_settings_preset"("userId", "minigameId");

-- CreateIndex
CREATE UNIQUE INDEX "rmhbox_settings_preset_userId_minigameId_name_key" ON "rmhbox_settings_preset"("userId", "minigameId", "name");

-- AddForeignKey
ALTER TABLE "rmhbox_settings_preset" ADD CONSTRAINT "rmhbox_settings_preset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

