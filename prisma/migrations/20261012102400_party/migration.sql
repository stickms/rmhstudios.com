-- CreateTable
CREATE TABLE "rmhbox_pack" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "game" VARCHAR(24) NOT NULL DEFAULT 'wit-war',
    "prompts" JSONB NOT NULL,
    "promptCount" INTEGER NOT NULL,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmhbox_pack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhbox_pack_report" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmhbox_pack_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connections_grid" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "groups" JSONB NOT NULL,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "solveCount" INTEGER NOT NULL DEFAULT 0,
    "ratingSum" INTEGER NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "dailyDate" VARCHAR(10),
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connections_grid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connections_play" (
    "id" TEXT NOT NULL,
    "gridId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "found" JSONB NOT NULL DEFAULT '[]',
    "mistakes" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(8) NOT NULL DEFAULT 'active',
    "rating" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connections_play_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rmhbox_pack_code_key" ON "rmhbox_pack"("code");

-- CreateIndex
CREATE INDEX "rmhbox_pack_ownerId_createdAt_idx" ON "rmhbox_pack"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "rmhbox_pack_hidden_featured_createdAt_idx" ON "rmhbox_pack"("hidden", "featured", "createdAt");

-- CreateIndex
CREATE INDEX "rmhbox_pack_report_reporterId_idx" ON "rmhbox_pack_report"("reporterId");

-- CreateIndex
CREATE UNIQUE INDEX "rmhbox_pack_report_packId_reporterId_key" ON "rmhbox_pack_report"("packId", "reporterId");

-- CreateIndex
CREATE UNIQUE INDEX "connections_grid_dailyDate_key" ON "connections_grid"("dailyDate");

-- CreateIndex
CREATE INDEX "connections_grid_authorId_createdAt_idx" ON "connections_grid"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "connections_grid_hidden_createdAt_idx" ON "connections_grid"("hidden", "createdAt");

-- CreateIndex
CREATE INDEX "connections_play_userId_idx" ON "connections_play"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "connections_play_gridId_userId_key" ON "connections_play"("gridId", "userId");

-- AddForeignKey
ALTER TABLE "rmhbox_pack" ADD CONSTRAINT "rmhbox_pack_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhbox_pack_report" ADD CONSTRAINT "rmhbox_pack_report_packId_fkey" FOREIGN KEY ("packId") REFERENCES "rmhbox_pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhbox_pack_report" ADD CONSTRAINT "rmhbox_pack_report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections_grid" ADD CONSTRAINT "connections_grid_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections_play" ADD CONSTRAINT "connections_play_gridId_fkey" FOREIGN KEY ("gridId") REFERENCES "connections_grid"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections_play" ADD CONSTRAINT "connections_play_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

