-- Game jam teams (s05-15): a teammate credited on a jam entry, invited by its submitter and
-- accepted by the invitee. Additive: one new table, no existing table is changed.
-- CreateTable
CREATE TABLE "game_jam_team_member" (
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jamId" TEXT NOT NULL,
    "status" VARCHAR(9) NOT NULL DEFAULT 'invited',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "game_jam_team_member_pkey" PRIMARY KEY ("entryId","userId")
);

-- CreateIndex
CREATE INDEX "game_jam_team_member_jamId_userId_idx" ON "game_jam_team_member"("jamId", "userId");

-- AddForeignKey
ALTER TABLE "game_jam_team_member" ADD CONSTRAINT "game_jam_team_member_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "game_jam_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_jam_team_member" ADD CONSTRAINT "game_jam_team_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

