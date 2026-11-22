-- Per-passage best-run ghost for RMHType solo: a coarse progress curve (positions only), one row
-- per member per passage, capped at 500 per member in lib/rmhtype/ghost.server.ts.

-- CreateTable
CREATE TABLE "rmhtype_ghost" (
    "userId" TEXT NOT NULL,
    "passageId" TEXT NOT NULL,
    "wpm" DOUBLE PRECISION NOT NULL,
    "timeMs" INTEGER NOT NULL,
    "samples" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rmhtype_ghost_pkey" PRIMARY KEY ("userId","passageId")
);

-- CreateIndex
CREATE INDEX "rmhtype_ghost_userId_updatedAt_idx" ON "rmhtype_ghost"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "rmhtype_ghost" ADD CONSTRAINT "rmhtype_ghost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
