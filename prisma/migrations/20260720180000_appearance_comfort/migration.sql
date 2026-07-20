-- AlterTable
ALTER TABLE "appearance_preference" ADD COLUMN     "customAccent" VARCHAR(7),
ADD COLUMN     "density" VARCHAR(8),
ADD COLUMN     "fontScale" INTEGER,
ADD COLUMN     "readableFont" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reduceMotion" BOOLEAN NOT NULL DEFAULT false;

