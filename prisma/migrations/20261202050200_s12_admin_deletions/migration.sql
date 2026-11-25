-- Every erasure attempt, and the claim that keeps one erasure at a time per account (s12-14). Additive: one new table.
CREATE TABLE "account_erasure_attempt" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "trigger" VARCHAR(8) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN,
    "errorName" VARCHAR(120),

    CONSTRAINT "account_erasure_attempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "account_erasure_attempt_userId_startedAt_idx" ON "account_erasure_attempt"("userId", "startedAt");

CREATE INDEX "account_erasure_attempt_startedAt_idx" ON "account_erasure_attempt"("startedAt");
