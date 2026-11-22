-- Account security log (/settings/security "Recent activity"): one append-only row per sign-in, session ended,
-- sign-in method, passkey, handle, email or deletion event. No raw IP or user agent is stored.

-- CreateTable
CREATE TABLE "security_event" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "device" VARCHAR(80),
    "ipHash" VARCHAR(64),
    "sessionId" VARCHAR(64),
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_event_userId_createdAt_idx" ON "security_event"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "security_event_createdAt_idx" ON "security_event"("createdAt");

-- AddForeignKey
ALTER TABLE "security_event" ADD CONSTRAINT "security_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

