-- Sprint 13 / 14: selling shares back. `received` is the coins a member has taken out of a market by selling; `spent` stays the cost basis.
ALTER TABLE "prediction_position" ADD COLUMN "received" INTEGER NOT NULL DEFAULT 0;
