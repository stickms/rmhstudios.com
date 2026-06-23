-- AlterTable: driver availability, live location and rating aggregate
ALTER TABLE "rideshare_driver"
    ADD COLUMN "isOnline" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "lastLat" DOUBLE PRECISION,
    ADD COLUMN "lastLng" DOUBLE PRECISION,
    ADD COLUMN "locationUpdatedAt" TIMESTAMP(3),
    ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "ratingTotal" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: post-trip ratings
ALTER TABLE "ride"
    ADD COLUMN "ratingByRider" INTEGER,
    ADD COLUMN "ratingByDriver" INTEGER;

-- CreateTable
CREATE TABLE "ride_message" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ride_message_rideId_createdAt_idx" ON "ride_message"("rideId", "createdAt");

-- CreateIndex
CREATE INDEX "ride_message_senderId_idx" ON "ride_message"("senderId");

-- AddForeignKey
ALTER TABLE "ride_message" ADD CONSTRAINT "ride_message_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "ride"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_message" ADD CONSTRAINT "ride_message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
