-- Self-resolving prediction markets. schema.prisma has declared these four
-- columns (and the resolver sweep index) on Prediction since the auto-resolver
-- work landed, but no migration ever created them — the same class of drift as
-- appearance_preference.reduceTransparency. Any database built by
-- `prisma migrate deploy` is missing them, so every query selecting a
-- Prediction fails there.
--
-- IF NOT EXISTS throughout so databases created with `prisma db push` (local
-- dev) no-op instead of failing.

-- AlterTable
ALTER TABLE "prediction"
ADD COLUMN IF NOT EXISTS "resolverKey" VARCHAR(120),
ADD COLUMN IF NOT EXISTS "resolverParams" JSONB,
ADD COLUMN IF NOT EXISTS "subjectUrl" VARCHAR(200),
ADD COLUMN IF NOT EXISTS "autoResolveAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "prediction_resolverKey_status_idx"
ON "prediction"("resolverKey", "status");
