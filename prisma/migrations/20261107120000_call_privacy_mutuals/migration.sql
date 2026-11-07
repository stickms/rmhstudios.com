-- Call privacy: 'following' (the callee follows the caller) becomes 'mutuals'
-- (each follows the other). Existing 'following' rows move to the stricter
-- setting, which is the privacy-safe direction; 'everyone' and 'nobody' are
-- untouched. The default follows the rename.
UPDATE "notification_preference" SET "callPrivacy" = 'mutuals' WHERE "callPrivacy" = 'following';
ALTER TABLE "notification_preference" ALTER COLUMN "callPrivacy" SET DEFAULT 'mutuals';
