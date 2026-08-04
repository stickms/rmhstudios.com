-- 1:1 voice calls.
--
-- Media is peer-to-peer WebRTC and never touches our servers, so this stores
-- only the call record — enough for a conversation to show "Missed voice call".

CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'CONNECTED', 'ENDED', 'MISSED', 'DECLINED', 'CANCELLED', 'BUSY', 'FAILED');

CREATE TABLE "call" (
    "id" TEXT NOT NULL,
    "callerId" TEXT NOT NULL,
    "calleeId" TEXT NOT NULL,
    "conversationId" TEXT,
    "status" "CallStatus" NOT NULL DEFAULT 'RINGING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "call_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "call_calleeId_createdAt_idx" ON "call"("calleeId", "createdAt" DESC);
CREATE INDEX "call_callerId_createdAt_idx" ON "call"("callerId", "createdAt" DESC);
CREATE INDEX "call_conversationId_createdAt_idx" ON "call"("conversationId", "createdAt" DESC);

ALTER TABLE "call" ADD CONSTRAINT "call_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "call" ADD CONSTRAINT "call_calleeId_fkey" FOREIGN KEY ("calleeId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Who may ring you. Defaults to people you follow, which is the setting that
-- makes the feature safe to turn on for everyone at once.
ALTER TABLE "notification_preference" ADD COLUMN "callPrivacy" VARCHAR(10) NOT NULL DEFAULT 'following';
