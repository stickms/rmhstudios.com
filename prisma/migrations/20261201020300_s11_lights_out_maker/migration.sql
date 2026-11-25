-- s11 05: member-made Lights Out boards and their plays. Additive only: two new tables, no change to an existing one.
CREATE TABLE "lights_out_board" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" VARCHAR(60) NOT NULL,
    "shape" JSONB NOT NULL,
    "cells" VARCHAR(64) NOT NULL,
    "optimalMoves" INTEGER NOT NULL,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "solveCount" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lights_out_board_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lights_out_board_play" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bestMoves" INTEGER,
    "solvedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lights_out_board_play_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lights_out_board_hidden_createdAt_idx" ON "lights_out_board"("hidden", "createdAt");
CREATE INDEX "lights_out_board_hidden_playCount_idx" ON "lights_out_board"("hidden", "playCount");
CREATE INDEX "lights_out_board_authorId_createdAt_idx" ON "lights_out_board"("authorId", "createdAt");

CREATE UNIQUE INDEX "lights_out_board_play_boardId_userId_key" ON "lights_out_board_play"("boardId", "userId");
CREATE INDEX "lights_out_board_play_userId_idx" ON "lights_out_board_play"("userId");
CREATE INDEX "lights_out_board_play_boardId_bestMoves_idx" ON "lights_out_board_play"("boardId", "bestMoves");

ALTER TABLE "lights_out_board" ADD CONSTRAINT "lights_out_board_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lights_out_board_play" ADD CONSTRAINT "lights_out_board_play_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "lights_out_board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lights_out_board_play" ADD CONSTRAINT "lights_out_board_play_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
