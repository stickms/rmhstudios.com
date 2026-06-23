-- CreateEnum
CREATE TYPE "RideClass" AS ENUM ('RMH_X', 'RMH_XL', 'RMH_COMFORT', 'RMH_GREEN', 'RMH_BLACK');

-- CreateEnum
CREATE TYPE "DriverApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "rideshare_driver" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DriverApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "vehicleMake" VARCHAR(60) NOT NULL,
    "vehicleModel" VARCHAR(60) NOT NULL,
    "vehicleYear" INTEGER NOT NULL,
    "vehicleColor" VARCHAR(30) NOT NULL,
    "licensePlate" VARCHAR(16) NOT NULL,
    "vehicleClass" "RideClass" NOT NULL DEFAULT 'RMH_X',
    "seats" INTEGER NOT NULL DEFAULT 4,
    "licenseImageKey" TEXT,
    "licenseDeletedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rideshare_driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "driverId" TEXT,
    "rideClass" "RideClass" NOT NULL DEFAULT 'RMH_X',
    "status" "RideStatus" NOT NULL DEFAULT 'REQUESTED',
    "pickupLabel" VARCHAR(300) NOT NULL,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "dropoffLabel" VARCHAR(300) NOT NULL,
    "dropoffLat" DOUBLE PRECISION NOT NULL,
    "dropoffLng" DOUBLE PRECISION NOT NULL,
    "distanceMeters" INTEGER,
    "durationSeconds" INTEGER,
    "estimatedFareCents" INTEGER NOT NULL DEFAULT 0,
    "notes" VARCHAR(500),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rideshare_driver_userId_key" ON "rideshare_driver"("userId");

-- CreateIndex
CREATE INDEX "rideshare_driver_status_idx" ON "rideshare_driver"("status");

-- CreateIndex
CREATE INDEX "ride_status_rideClass_requestedAt_idx" ON "ride"("status", "rideClass", "requestedAt");

-- CreateIndex
CREATE INDEX "ride_riderId_idx" ON "ride"("riderId");

-- CreateIndex
CREATE INDEX "ride_driverId_idx" ON "ride"("driverId");

-- AddForeignKey
ALTER TABLE "rideshare_driver" ADD CONSTRAINT "rideshare_driver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rideshare_driver" ADD CONSTRAINT "rideshare_driver_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride" ADD CONSTRAINT "ride_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride" ADD CONSTRAINT "ride_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
