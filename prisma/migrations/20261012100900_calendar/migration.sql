-- P09 calendar (K1-K4, F5): availability polls, office hours, calendar feed, recurring-event RSVPs, study buddy.
-- Additive only: new tables and new nullable/defaulted columns on community_event and event_rsvp.
-- AlterTable
ALTER TABLE "community_event" ADD COLUMN     "recurTz" VARCHAR(64),
ADD COLUMN     "recurUntil" TIMESTAMP(3),
ADD COLUMN     "recurrence" VARCHAR(4),
ADD COLUMN     "rotatingHostIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "event_rsvp" ADD COLUMN     "everyTime" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "availability_poll" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500) NOT NULL DEFAULT '',
    "tz" VARCHAR(64) NOT NULL,
    "firstDay" VARCHAR(10) NOT NULL,
    "days" INTEGER NOT NULL,
    "dayStartHour" INTEGER NOT NULL,
    "dayEndHour" INTEGER NOT NULL,
    "slotMin" INTEGER NOT NULL,
    "communityId" VARCHAR(40),
    "groupChatId" VARCHAR(40),
    "lockedStartMin" INTEGER,
    "lockedEndMin" INTEGER,
    "lockedAt" TIMESTAMP(3),
    "lockedEventId" VARCHAR(40),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_poll_response" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" VARCHAR(720) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availability_poll_response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_poll_invitee" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "availability_poll_invitee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office_hours_config" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL DEFAULT '',
    "blurb" VARCHAR(300) NOT NULL DEFAULT '',
    "tz" VARCHAR(64) NOT NULL,
    "slotMin" INTEGER NOT NULL DEFAULT 30,
    "maxPerWeek" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "office_hours_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office_hours_window" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "office_hours_window_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office_hours_booking" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "note" VARCHAR(300) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "office_hours_booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_feed" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),

    CONSTRAINT "calendar_feed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_feed_slot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slotId" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_feed_slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_occurrence_rsvp" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurrenceAt" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_occurrence_rsvp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_buddy_request" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectKey" VARCHAR(48) NOT NULL,
    "subject" VARCHAR(60) NOT NULL,
    "lengthMin" INTEGER NOT NULL,
    "mode" VARCHAR(4) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'waiting',
    "matchId" VARCHAR(40),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_buddy_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_buddy_match" (
    "id" TEXT NOT NULL,
    "roomCode" VARCHAR(8) NOT NULL,
    "subject" VARCHAR(60) NOT NULL,
    "lengthMin" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_buddy_match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "availability_poll_creatorId_createdAt_idx" ON "availability_poll"("creatorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "availability_poll_communityId_idx" ON "availability_poll"("communityId");

-- CreateIndex
CREATE INDEX "availability_poll_groupChatId_idx" ON "availability_poll"("groupChatId");

-- CreateIndex
CREATE INDEX "availability_poll_response_userId_updatedAt_idx" ON "availability_poll_response"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "availability_poll_response_pollId_userId_key" ON "availability_poll_response"("pollId", "userId");

-- CreateIndex
CREATE INDEX "availability_poll_invitee_userId_idx" ON "availability_poll_invitee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "availability_poll_invitee_pollId_userId_key" ON "availability_poll_invitee"("pollId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "office_hours_config_userId_key" ON "office_hours_config"("userId");

-- CreateIndex
CREATE INDEX "office_hours_window_configId_idx" ON "office_hours_window"("configId");

-- CreateIndex
CREATE INDEX "office_hours_booking_guestId_startsAt_idx" ON "office_hours_booking"("guestId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "office_hours_booking_hostId_startsAt_key" ON "office_hours_booking"("hostId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_feed_userId_key" ON "calendar_feed"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_feed_token_key" ON "calendar_feed"("token");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_feed_slot_userId_slotId_key" ON "calendar_feed_slot"("userId", "slotId");

-- CreateIndex
CREATE INDEX "event_occurrence_rsvp_eventId_occurrenceAt_idx" ON "event_occurrence_rsvp"("eventId", "occurrenceAt");

-- CreateIndex
CREATE INDEX "event_occurrence_rsvp_userId_occurrenceAt_idx" ON "event_occurrence_rsvp"("userId", "occurrenceAt");

-- CreateIndex
CREATE UNIQUE INDEX "event_occurrence_rsvp_eventId_userId_occurrenceAt_key" ON "event_occurrence_rsvp"("eventId", "userId", "occurrenceAt");

-- CreateIndex
CREATE INDEX "study_buddy_request_status_subjectKey_lengthMin_startsAt_idx" ON "study_buddy_request"("status", "subjectKey", "lengthMin", "startsAt");

-- CreateIndex
CREATE INDEX "study_buddy_request_userId_status_idx" ON "study_buddy_request"("userId", "status");

-- CreateIndex
CREATE INDEX "study_buddy_request_status_expiresAt_idx" ON "study_buddy_request"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "study_buddy_match_roomCode_key" ON "study_buddy_match"("roomCode");

-- CreateIndex
CREATE INDEX "study_buddy_match_userAId_startsAt_idx" ON "study_buddy_match"("userAId", "startsAt");

-- CreateIndex
CREATE INDEX "study_buddy_match_userBId_startsAt_idx" ON "study_buddy_match"("userBId", "startsAt");

-- AddForeignKey
ALTER TABLE "availability_poll" ADD CONSTRAINT "availability_poll_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_poll_response" ADD CONSTRAINT "availability_poll_response_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "availability_poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_poll_response" ADD CONSTRAINT "availability_poll_response_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_poll_invitee" ADD CONSTRAINT "availability_poll_invitee_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "availability_poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_poll_invitee" ADD CONSTRAINT "availability_poll_invitee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_hours_config" ADD CONSTRAINT "office_hours_config_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_hours_window" ADD CONSTRAINT "office_hours_window_configId_fkey" FOREIGN KEY ("configId") REFERENCES "office_hours_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_hours_booking" ADD CONSTRAINT "office_hours_booking_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_hours_booking" ADD CONSTRAINT "office_hours_booking_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_feed" ADD CONSTRAINT "calendar_feed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_feed_slot" ADD CONSTRAINT "calendar_feed_slot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_occurrence_rsvp" ADD CONSTRAINT "event_occurrence_rsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "community_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_occurrence_rsvp" ADD CONSTRAINT "event_occurrence_rsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_buddy_request" ADD CONSTRAINT "study_buddy_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_buddy_match" ADD CONSTRAINT "study_buddy_match_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_buddy_match" ADD CONSTRAINT "study_buddy_match_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

