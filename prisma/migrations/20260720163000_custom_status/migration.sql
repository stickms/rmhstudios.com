-- Custom status (parity/QOL spec §10): a short emoji + text presence line on
-- UserProfile, shown on the profile (and later hover cards / DMs / friends
-- rail). Purely additive; `statusExpires` is enforced at read time.
ALTER TABLE "user_profile"
  ADD COLUMN "statusEmoji"   VARCHAR(16),
  ADD COLUMN "statusText"    VARCHAR(80),
  ADD COLUMN "statusExpires" TIMESTAMP(3),
  ADD COLUMN "statusAuto"    BOOLEAN NOT NULL DEFAULT false;
