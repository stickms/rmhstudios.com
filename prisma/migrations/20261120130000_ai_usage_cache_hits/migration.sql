-- Prompt tokens DeepSeek served from its context cache, so the ledger shows
-- what prompt ordering saves and prices cache hits at their real rate.
ALTER TABLE "ai_usage" ADD COLUMN "cacheHitTokens" INTEGER NOT NULL DEFAULT 0;
