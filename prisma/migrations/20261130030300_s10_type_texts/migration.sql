-- Saved texts to practise in RMHType, and the runs on them (s10-05). Additive: two new tables.
-- CreateTable
CREATE TABLE "rmhtype_text" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "body" VARCHAR(3000) NOT NULL,
    "bestWpm" DOUBLE PRECISION,
    "bestAccuracy" DOUBLE PRECISION,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rmhtype_text_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtype_text_run" (
    "id" TEXT NOT NULL,
    "textId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wpm" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "timeMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmhtype_text_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rmhtype_text_userId_updatedAt_idx" ON "rmhtype_text"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "rmhtype_text_run_textId_createdAt_idx" ON "rmhtype_text_run"("textId", "createdAt");

-- CreateIndex
CREATE INDEX "rmhtype_text_run_userId_idx" ON "rmhtype_text_run"("userId");

-- AddForeignKey
ALTER TABLE "rmhtype_text" ADD CONSTRAINT "rmhtype_text_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtype_text_run" ADD CONSTRAINT "rmhtype_text_run_textId_fkey" FOREIGN KEY ("textId") REFERENCES "rmhtype_text"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtype_text_run" ADD CONSTRAINT "rmhtype_text_run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
