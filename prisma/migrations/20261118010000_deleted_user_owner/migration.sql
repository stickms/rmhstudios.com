-- Vibes of deleted accounts are owned by one shared "Deleted user" account.
--
-- The sentinel row is marked exactly like a deletion tombstone (banReason
-- 'account_deleted', locked until 9999-12-31) with no email, password, handle or
-- credentials, so it can never sign in and every tombstone-aware query hides it.
-- Idempotent: safe to re-run.
INSERT INTO "user" ("id", "name", "emailVerified", "bannedUntil", "banReason", "createdAt", "updatedAt")
VALUES ('deleted-user', 'Deleted user', false, '9999-12-31 00:00:00', 'account_deleted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Vibes already owned by anonymised accounts move to the sentinel.
UPDATE "vibe_page"
SET "ownerId" = 'deleted-user'
WHERE "ownerId" IN (
  SELECT "id" FROM "user" WHERE "banReason" = 'account_deleted' AND "id" <> 'deleted-user'
);
