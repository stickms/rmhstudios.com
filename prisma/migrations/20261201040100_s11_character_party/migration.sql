-- s11 03: RMHCharacters parties (a game master's table) and each player's membership.
-- Additive only: two new tables, no change to an existing one.
CREATE TABLE "rmh_character_party" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "system" VARCHAR(8) NOT NULL,
    "inviteCode" VARCHAR(16) NOT NULL,
    "initiative" JSONB NOT NULL DEFAULT '[]',
    "turnIndex" INTEGER NOT NULL DEFAULT 0,
    "orderVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rmh_character_party_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rmh_character_party_member" (
    "partyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "sheetShared" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmh_character_party_member_pkey" PRIMARY KEY ("partyId","userId")
);

CREATE UNIQUE INDEX "rmh_character_party_inviteCode_key" ON "rmh_character_party"("inviteCode");

CREATE INDEX "rmh_character_party_ownerId_idx" ON "rmh_character_party"("ownerId");

CREATE INDEX "rmh_character_party_member_userId_idx" ON "rmh_character_party_member"("userId");

CREATE INDEX "rmh_character_party_member_characterId_idx" ON "rmh_character_party_member"("characterId");

ALTER TABLE "rmh_character_party" ADD CONSTRAINT "rmh_character_party_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rmh_character_party_member" ADD CONSTRAINT "rmh_character_party_member_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "rmh_character_party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rmh_character_party_member" ADD CONSTRAINT "rmh_character_party_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rmh_character_party_member" ADD CONSTRAINT "rmh_character_party_member_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "rmh_character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
