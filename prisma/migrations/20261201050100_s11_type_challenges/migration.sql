-- s11 12: challenge someone to race your best run. Additive only; two new tables, no index on an existing table.
CREATE TABLE "rmhtype_challenge" (
    "id" TEXT NOT NULL,
    "challengerId" TEXT NOT NULL,
    "opponentId" TEXT NOT NULL,
    "passageId" VARCHAR(64) NOT NULL,
    "challengerWpm" DOUBLE PRECISION NOT NULL,
    "challengerAccuracy" DOUBLE PRECISION NOT NULL,
    "challengerTimeMs" INTEGER NOT NULL,
    "samples" INTEGER[],
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "opponentWpm" DOUBLE PRECISION,
    "opponentAccuracy" DOUBLE PRECISION,
    "opponentTimeMs" INTEGER,
    "outcome" VARCHAR(12),
    "finished" BOOLEAN,
    "raceStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "rmhtype_challenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rmhtype_challenge_opt_out" (
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmhtype_challenge_opt_out_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "rmhtype_challenge_opponentId_status_idx" ON "rmhtype_challenge"("opponentId", "status");
CREATE INDEX "rmhtype_challenge_challengerId_status_idx" ON "rmhtype_challenge"("challengerId", "status");
CREATE INDEX "rmhtype_challenge_status_expiresAt_idx" ON "rmhtype_challenge"("status", "expiresAt");

ALTER TABLE "rmhtype_challenge" ADD CONSTRAINT "rmhtype_challenge_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rmhtype_challenge" ADD CONSTRAINT "rmhtype_challenge_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rmhtype_challenge_opt_out" ADD CONSTRAINT "rmhtype_challenge_opt_out_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
