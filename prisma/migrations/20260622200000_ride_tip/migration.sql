-- Rideshare: rides are now paid. Riders can leave a tip after a completed
-- trip, paid out to the driver in full.
ALTER TABLE "ride" ADD COLUMN "tipCents" INTEGER NOT NULL DEFAULT 0;
