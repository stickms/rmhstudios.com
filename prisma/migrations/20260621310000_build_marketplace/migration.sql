-- AlterTable
ALTER TABLE "user_build" ADD COLUMN "price" INTEGER;

-- CreateTable
CREATE TABLE "build_unlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "pricePaid" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "build_unlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "build_unlock_userId_buildId_key" ON "build_unlock"("userId", "buildId");
CREATE INDEX "build_unlock_buildId_idx" ON "build_unlock"("buildId");
ALTER TABLE "build_unlock" ADD CONSTRAINT "build_unlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "build_unlock" ADD CONSTRAINT "build_unlock_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "user_build"("id") ON DELETE CASCADE ON UPDATE CASCADE;
