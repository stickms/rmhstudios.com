-- CreateTable
CREATE TABLE "altair_solo_run" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openUserId" TEXT,
    "seed" INTEGER NOT NULL,
    "classId" TEXT NOT NULL,
    "doubleTime" BOOLEAN NOT NULL,
    "loadout" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "steps" INTEGER,
    "result" JSONB,
    "rejectReason" TEXT,
    "coinsCredited" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "altair_solo_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "altair_solo_run_openUserId_key" ON "altair_solo_run"("openUserId");

-- CreateIndex
CREATE INDEX "altair_solo_run_userId_issuedAt_idx" ON "altair_solo_run"("userId", "issuedAt" DESC);

-- CreateIndex
CREATE INDEX "altair_solo_run_status_expiresAt_idx" ON "altair_solo_run"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "altair_solo_run" ADD CONSTRAINT "altair_solo_run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
