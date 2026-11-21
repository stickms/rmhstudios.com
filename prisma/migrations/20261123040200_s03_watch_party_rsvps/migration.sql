-- Scheduled RMHTube watch parties: who is going (with the two reminder stamps the job claims).
-- The index behind the landing page's upcoming list is built concurrently by the next two migrations.
-- CreateTable
CREATE TABLE "rmhtube_room_rsvp" (
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remindedAt" TIMESTAMP(3),
    "startedNotifiedAt" TIMESTAMP(3),

    CONSTRAINT "rmhtube_room_rsvp_pkey" PRIMARY KEY ("roomId","userId")
);

-- CreateIndex
CREATE INDEX "rmhtube_room_rsvp_userId_idx" ON "rmhtube_room_rsvp"("userId");

-- AddForeignKey
ALTER TABLE "rmhtube_room_rsvp" ADD CONSTRAINT "rmhtube_room_rsvp_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rmhtube_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_room_rsvp" ADD CONSTRAINT "rmhtube_room_rsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

