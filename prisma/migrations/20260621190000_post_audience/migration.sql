-- CreateEnum
CREATE TYPE "RMHarkAudience" AS ENUM ('PUBLIC', 'FOLLOWERS', 'PRIVATE');

-- AlterTable
ALTER TABLE "rmheet" ADD COLUMN "audience" "RMHarkAudience" NOT NULL DEFAULT 'PUBLIC';
