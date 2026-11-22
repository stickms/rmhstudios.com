-- Event waitlists: the time a member joined the waitlist of a full one-off event (Rsvp.status = 'waitlist').
-- The index the FIFO read and the promotion count use is built CONCURRENTLY by the next migration.

-- AlterTable
ALTER TABLE "rsvp" ADD COLUMN     "waitlistedAt" TIMESTAMP(3);
