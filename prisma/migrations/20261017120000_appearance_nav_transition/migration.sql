-- Globe-eversion navigation transition preference (spec 9.3). Additive only: a
-- nullable column with no default and no backfill, so the old image running
-- during a blue/green swap never names it and an absent value means 'random'.
-- AlterTable
ALTER TABLE "appearance_preference" ADD COLUMN     "navTransition" VARCHAR(16);
