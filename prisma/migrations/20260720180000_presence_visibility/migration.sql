-- AlterTable
ALTER TABLE "user_profile" ADD COLUMN     "presenceDetail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "presenceVisibility" VARCHAR(12) NOT NULL DEFAULT 'mutuals';

