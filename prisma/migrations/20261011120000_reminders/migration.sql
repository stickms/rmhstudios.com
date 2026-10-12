-- U7 "Remind me about this" / snooze. Additive only (a new table), so it is
-- safe under blue/green: the old image never names it.
-- CreateTable
CREATE TABLE "reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "targetId" VARCHAR(128) NOT NULL,
    "label" VARCHAR(140) NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "note" VARCHAR(140),
    "remindAt" TIMESTAMP(3) NOT NULL,
    "firedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminder_remindAt_firedAt_idx" ON "reminder"("remindAt", "firedAt");

-- CreateIndex
CREATE INDEX "reminder_userId_firedAt_remindAt_idx" ON "reminder"("userId", "firedAt", "remindAt");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_userId_kind_targetId_key" ON "reminder"("userId", "kind", "targetId");

-- AddForeignKey
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

