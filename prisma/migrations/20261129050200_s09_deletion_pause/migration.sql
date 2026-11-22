-- What a deletion request paused (s09-14): the ids of the API keys and webhooks it switched off, so cancelling
-- the deletion restores exactly those. One new table only; no change to an existing one.

-- CreateTable
CREATE TABLE "deletion_hold" (
    "userId" TEXT NOT NULL,
    "keyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "webhookIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deletion_hold_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "deletion_hold" ADD CONSTRAINT "deletion_hold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
