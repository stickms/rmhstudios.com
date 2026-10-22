-- Coin balances, ledger amounts and vault stakes outgrew INTEGER (2^31 − 1): a
-- 1.5B coin vault plus its interest, or a whale's wallet, no longer fits.
-- Widening INTEGER → BIGINT is lossless. It rewrites each table under an
-- ACCESS EXCLUSIVE lock, so coin writes stall for the duration of the rewrite.

-- AlterTable
ALTER TABLE "user_profile" ALTER COLUMN "coins" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "coin_transaction" ALTER COLUMN "amount" SET DATA TYPE BIGINT;

-- AlterTable: also adds vault auto-reinvest (additive, defaulted).
ALTER TABLE "coin_stake" ALTER COLUMN "principal" SET DATA TYPE BIGINT,
ALTER COLUMN "accrued" SET DATA TYPE BIGINT,
ADD COLUMN "autoReinvest" BOOLEAN NOT NULL DEFAULT false;
