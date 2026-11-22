-- s07-16: communities can require a description on every image posted in them.
-- Additive: one defaulted column, off for every existing community.
-- AlterTable
ALTER TABLE "community" ADD COLUMN     "requireImageAlt" BOOLEAN NOT NULL DEFAULT false;

