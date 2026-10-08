-- Group voice calls — up to eight people in one room.
--
-- A full WebRTC mesh: every participant holds a direct peer connection to every
-- other participant, so no audio ever reaches our servers and there is nothing
-- here to record it to. What these two tables hold is only the call *record* —
-- who was in the room, when, and how it ended — so a DM thread can say "Missed
-- group call" and a community can show its voice history.
--
-- Deliberately separate from "call" (the 1:1 table) rather than a nullable
-- extension of it: the two have different admission rules, different lifecycles
-- (a 1:1 call cannot be joined mid-flight) and a different cardinality of
-- participant. Folding them together would make every 1:1 query carry a roster
-- join it never needs.
--
-- "group_call"."partyId" carries NO foreign key, and that is the one thing in
-- this migration worth pausing on. Parties have no table at all: they are
-- in-memory Maps in `server/socket-server/handlers/party.ts`, and a hub restart
-- dissolves every one of them. There is therefore nothing to point a constraint
-- at. It is indexed (with "status") so "is there a live room for this party?"
-- is still a single lookup, and it is left dangling once the party is gone —
-- which is correct rather than merely tolerated: the call record outlives the
-- party it happened in, exactly as a receipt outlives the shop. "communityId"
-- IS a real relation, because communities are rows; it is ON DELETE SET NULL so
-- deleting a community erases its scope without erasing the fact that people
-- talked.
--
-- "group_call_participant" takes a BIGSERIAL identity and "group_call" a TEXT
-- id filled by Prisma's uuid(7) — both time-sortable, per the new-table PK
-- policy (R0-T7). Neither id is ever addressed by a client: a participant row
-- is reached by ("callId", "userId"), which the UNIQUE constraint below also
-- serves as the "callId" prefix index that loads a roster.
--
-- Purely additive. No existing table, column or constraint is touched.

-- CreateEnum
CREATE TYPE "GroupCallOrigin" AS ENUM ('ADHOC', 'COMMUNITY', 'PARTY');

-- CreateEnum
CREATE TYPE "GroupCallStatus" AS ENUM ('RINGING', 'ACTIVE', 'ENDED', 'MISSED', 'DECLINED', 'FAILED');

-- CreateEnum
CREATE TYPE "GroupCallParticipantStatus" AS ENUM ('INVITED', 'JOINED', 'LEFT', 'DECLINED', 'MISSED', 'FAILED');

-- CreateTable
CREATE TABLE "group_call" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "origin" "GroupCallOrigin" NOT NULL,
    "communityId" TEXT,
    "partyId" VARCHAR(64),
    "conversationId" TEXT,
    "status" "GroupCallStatus" NOT NULL DEFAULT 'RINGING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "peakParticipants" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "group_call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_call_participant" (
    "id" BIGSERIAL NOT NULL,
    "callId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "GroupCallParticipantStatus" NOT NULL DEFAULT 'INVITED',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "group_call_participant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_call_hostId_createdAt_idx" ON "group_call"("hostId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "group_call_conversationId_createdAt_idx" ON "group_call"("conversationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "group_call_communityId_status_idx" ON "group_call"("communityId", "status");

-- CreateIndex
CREATE INDEX "group_call_partyId_status_idx" ON "group_call"("partyId", "status");

-- CreateIndex
CREATE INDEX "group_call_status_createdAt_idx" ON "group_call"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "group_call_participant_userId_invitedAt_idx" ON "group_call_participant"("userId", "invitedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "group_call_participant_callId_userId_key" ON "group_call_participant"("callId", "userId");

-- AddForeignKey
ALTER TABLE "group_call" ADD CONSTRAINT "group_call_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_call" ADD CONSTRAINT "group_call_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_call_participant" ADD CONSTRAINT "group_call_participant_callId_fkey" FOREIGN KEY ("callId") REFERENCES "group_call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_call_participant" ADD CONSTRAINT "group_call_participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
