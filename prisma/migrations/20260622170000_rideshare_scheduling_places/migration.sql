-- AlterEnum: scheduled rides
ALTER TYPE "RideStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED' BEFORE 'REQUESTED';

-- AlterTable: scheduled-for timestamp
ALTER TABLE "ride" ADD COLUMN "scheduledFor" TIMESTAMP(3);

-- CreateTable: saved places (Home / Work / custom)
CREATE TABLE "ride_saved_place" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_saved_place_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ride_saved_place_userId_idx" ON "ride_saved_place"("userId");

-- AddForeignKey
ALTER TABLE "ride_saved_place" ADD CONSTRAINT "ride_saved_place_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
