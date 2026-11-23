-- The reader's fonts (owner, 2026-11-23; lib/appearance/fonts.ts) and when the account's appearance last changed
-- (the "most recent wins" merge when a device turns appearance sync back on). Nullable fonts, no backfill: null means
-- never chosen, so every existing device keeps its own value. Existing rows take now() as their updatedAt.
ALTER TABLE "appearance_preference" ADD COLUMN "fontMain" VARCHAR(32),
ADD COLUMN "fontMono" VARCHAR(32),
ADD COLUMN "fontReading" VARCHAR(32),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
