-- CreateEnum
CREATE TYPE "ElectionRoomVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateTable
CREATE TABLE "election_room" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "visibility" "ElectionRoomVisibility" NOT NULL DEFAULT 'PRIVATE',
    "ownerId" TEXT NOT NULL,
    "electionDate" VARCHAR(10) NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "election_room_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "election_room_code_key" ON "election_room"("code");

-- CreateIndex
CREATE INDEX "election_room_visibility_electionDate_expiresAt_idx" ON "election_room"("visibility", "electionDate", "expiresAt");

-- CreateIndex
CREATE INDEX "election_room_ownerId_createdAt_idx" ON "election_room"("ownerId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "election_room" ADD CONSTRAINT "election_room_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

