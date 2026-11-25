-- s12 01: rolls made for the table in an RMHCharacters party. Additive only: one new table, no change to an existing one.
CREATE TABLE "rmh_character_party_roll" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterId" TEXT,
    "kind" VARCHAR(12) NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "notation" VARCHAR(64) NOT NULL,
    "dice" INTEGER[],
    "modifier" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "mode" VARCHAR(12) NOT NULL,
    "visibility" VARCHAR(6) NOT NULL,
    "dc" INTEGER,
    "degree" VARCHAR(16),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmh_character_party_roll_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rmh_character_party_roll_partyId_createdAt_idx" ON "rmh_character_party_roll"("partyId", "createdAt");
CREATE INDEX "rmh_character_party_roll_userId_idx" ON "rmh_character_party_roll"("userId");

ALTER TABLE "rmh_character_party_roll" ADD CONSTRAINT "rmh_character_party_roll_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "rmh_character_party"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rmh_character_party_roll" ADD CONSTRAINT "rmh_character_party_roll_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
