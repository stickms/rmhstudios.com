-- Keyboard shortcut preferences: the single-key mode and per-shortcut remaps a member
-- chose (WCAG 2.1.4), applied on every device (lib/preferences/keyboard.server.ts).

-- CreateTable
CREATE TABLE "keyboard_preference" (
    "userId" TEXT NOT NULL,
    "singleKeys" VARCHAR(8) NOT NULL DEFAULT 'on',
    "overrides" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keyboard_preference_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "keyboard_preference" ADD CONSTRAINT "keyboard_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

