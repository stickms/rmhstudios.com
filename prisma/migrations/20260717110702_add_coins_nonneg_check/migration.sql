-- Defense-in-depth: a database-level CHECK so coins can never go negative even
-- if a future spend path forgets the atomic conditional-update pattern. The
-- economy's integrity should not rest solely on every call site being correct.
--
-- Hand-written; NOT mirrored in schema.prisma (Prisma cannot express CHECK
-- constraints). Production `migrate deploy` applies it directly.
--
-- Clamp any pre-existing negative balances to 0 first so the constraint can be
-- added without failing. Negative balances should not exist (H-1 remediation
-- made spends atomic), so this is expected to be a no-op in practice.
UPDATE "user_profile" SET "coins" = 0 WHERE "coins" < 0;

ALTER TABLE "user_profile"
  ADD CONSTRAINT "user_profile_coins_nonneg" CHECK ("coins" >= 0);
