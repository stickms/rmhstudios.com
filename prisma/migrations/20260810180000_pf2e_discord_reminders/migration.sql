-- Morning-of Discord reminders for /pf2ecal.
--
-- `pf2e_settings` is a single-row table pinned to id 'singleton' by the column
-- default, so every write is an upsert on a known key and there is no way to
-- end up with two config rows.
--
-- `pf2e_session.reminderSentAt` is the idempotency marker for the sweep: the
-- cron runs every ten minutes and would re-post the same reminder on every tick
-- all morning without it. Nullable and null for every existing row, so sessions
-- already on the board are simply un-reminded rather than back-filled as sent.

-- AlterTable
ALTER TABLE "pf2e_session" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "pf2e_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "discordWebhookUrl" VARCHAR(500),
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reminderMinutes" INTEGER NOT NULL DEFAULT 540,
    "reminderTimeZone" VARCHAR(64) NOT NULL DEFAULT 'America/New_York',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pf2e_settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pf2e_settings" ADD CONSTRAINT "pf2e_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
