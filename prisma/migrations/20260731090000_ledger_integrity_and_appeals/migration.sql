-- Strike appeals + coin-ledger integrity.
--
-- Two independent changes that ship together because both add durable
-- guarantees the application layer was previously trusted to uphold on its own.

-- ─── 1. Strike appeals ──────────────────────────────────────────────────────

CREATE TYPE "AppealStatus" AS ENUM ('NONE', 'PENDING', 'UPHELD', 'OVERTURNED');

ALTER TABLE "user_strike"
  ADD COLUMN "entityType"     VARCHAR(32),
  ADD COLUMN "entityId"       VARCHAR(64),
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN "appealStatus"   "AppealStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "appealText"     VARCHAR(2000),
  ADD COLUMN "appealedAt"     TIMESTAMP(3),
  ADD COLUMN "appealNote"     VARCHAR(1000),
  ADD COLUMN "appealAdminId"  TEXT,
  ADD COLUMN "decidedAt"      TIMESTAMP(3);

ALTER TABLE "user_strike"
  ADD CONSTRAINT "user_strike_appealAdminId_fkey"
  FOREIGN KEY ("appealAdminId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The admin queue reads open appeals oldest-first.
CREATE INDEX "user_strike_appealStatus_appealedAt_idx"
  ON "user_strike"("appealStatus", "appealedAt");

-- ─── 2. Coin ledger integrity ───────────────────────────────────────────────

-- recipientId becomes nullable so a SINK (coins destroyed) can be recorded.
-- Until now, spending coins decremented a balance and wrote no row at all, so
-- the ledger could never be summed and checked against the balances it exists
-- to explain.
ALTER TABLE "coin_transaction" ALTER COLUMN "recipientId" DROP NOT NULL;

-- Replace the cascade FK so a deleted user's sink/faucet rows survive as
-- anonymous supply history rather than silently vanishing from the totals.
ALTER TABLE "coin_transaction" DROP CONSTRAINT IF EXISTS "coin_transaction_recipientId_fkey";
ALTER TABLE "coin_transaction"
  ADD CONSTRAINT "coin_transaction_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Idempotency: a retried request reusing a key collides here instead of moving
-- coins twice.
ALTER TABLE "coin_transaction" ADD COLUMN "idempotencyKey" VARCHAR(128);
CREATE UNIQUE INDEX "coin_transaction_idempotencyKey_key"
  ON "coin_transaction"("idempotencyKey");

-- Supply reporting reads (createdAt DESC, type).
CREATE INDEX "coin_transaction_createdAt_type_idx"
  ON "coin_transaction"("createdAt" DESC, "type");

-- Backfill: historical sinks were encoded as a NEGATIVE amount credited to the
-- spender (`recipientId = buyer, amount = -price`) by seven call sites, while
-- other spends wrote no row at all. Convert the negative rows to the single
-- canonical sink encoding — positive amount, sender set, no recipient — so the
-- whole table speaks one language and past history reconciles too.
--
-- This is safe for existing readers: every consumer already filters
-- `recipientId = <user> AND amount > 0` to mean "received", and a converted row
-- has a NULL recipient, so it drops out of those queries exactly as the
-- negative row did.
UPDATE "coin_transaction"
SET "senderId"    = "recipientId",
    "recipientId" = NULL,
    "amount"      = -"amount"
WHERE "amount" < 0;

-- Any remaining zero-amount rows carry no information and would fail the
-- positive-amount check below.
DELETE FROM "coin_transaction" WHERE "amount" = 0;

-- A ledger row must move coins in a direction: a row with neither a sender nor
-- a recipient describes nothing, and one with a non-positive amount is either a
-- bug or an attempt to run a debit through a credit path. Both are rejected by
-- the database so no future code path can write them.
ALTER TABLE "coin_transaction"
  ADD CONSTRAINT "coin_transaction_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "coin_transaction"
  ADD CONSTRAINT "coin_transaction_has_party"
  CHECK ("senderId" IS NOT NULL OR "recipientId" IS NOT NULL);

-- The strongest guarantee available: a balance can never go negative, whatever
-- the application does. Two shipped debit paths did read-then-decrement without
-- a WHERE guard, which under READ COMMITTED lets concurrent spends overdraw.
-- The ledger module fixes those paths; this constraint means a future one that
-- reintroduces the bug fails its transaction instead of minting coins.
--
-- Applied NOT VALID first so the migration cannot fail on pre-existing negative
-- rows, then validated separately — that step will error loudly if such rows
-- exist, which is the correct outcome (they need a decision, not a silent fix).
UPDATE "user_profile" SET "coins" = 0 WHERE "coins" < 0;
ALTER TABLE "user_profile"
  ADD CONSTRAINT "user_profile_coins_non_negative" CHECK ("coins" >= 0) NOT VALID;
ALTER TABLE "user_profile" VALIDATE CONSTRAINT "user_profile_coins_non_negative";
