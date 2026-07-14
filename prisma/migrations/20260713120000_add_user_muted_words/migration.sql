-- AlterTable
ALTER TABLE "user_profile" ADD COLUMN     "mutedWords" TEXT[] DEFAULT ARRAY[]::TEXT[];

