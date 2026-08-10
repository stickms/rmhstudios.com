-- PF2e team calendar (/pf2ecal): a private scheduling board for one table.
--
-- `pf2e_session.occurrenceKey` is the idempotency key for materialising the
-- recurring rule in lib/pf2ecal/schedule.ts. It is UNIQUE and NULLABLE on
-- purpose: Postgres treats NULLs as distinct in a unique index, so every
-- hand-added session carries NULL and never collides, while a generated
-- occurrence can only ever be inserted once no matter how many readers race.

-- CreateEnum
CREATE TYPE "Pf2eAvailability" AS ENUM ('GOING', 'TENTATIVE', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "pf2e_session" (
    "id" TEXT NOT NULL,
    "occurrenceKey" VARCHAR(16),
    "title" VARCHAR(120) NOT NULL,
    "notes" VARCHAR(4000) NOT NULL DEFAULT '',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "location" VARCHAR(300) NOT NULL DEFAULT '',
    "canceledAt" TIMESTAMP(3),
    "pinnedToRule" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pf2e_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pf2e_session_response" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "Pf2eAvailability" NOT NULL,
    "note" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pf2e_session_response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pf2e_announcement" (
    "id" TEXT NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pf2e_announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pf2e_session_occurrenceKey_key" ON "pf2e_session"("occurrenceKey");

-- CreateIndex
CREATE INDEX "pf2e_session_startsAt_idx" ON "pf2e_session"("startsAt");

-- CreateIndex
CREATE INDEX "pf2e_session_response_userId_updatedAt_idx" ON "pf2e_session_response"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "pf2e_session_response_sessionId_userId_key" ON "pf2e_session_response"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "pf2e_announcement_pinned_createdAt_idx" ON "pf2e_announcement"("pinned", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "pf2e_session" ADD CONSTRAINT "pf2e_session_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pf2e_session" ADD CONSTRAINT "pf2e_session_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pf2e_session_response" ADD CONSTRAINT "pf2e_session_response_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "pf2e_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pf2e_session_response" ADD CONSTRAINT "pf2e_session_response_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pf2e_announcement" ADD CONSTRAINT "pf2e_announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
