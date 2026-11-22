-- s07-17 build screenshots: a described gallery of up to eight screenshots per build, and an optional
-- description of the cover (user_build.thumbnailAlt). Additive: one nullable column and one new table.

-- AlterTable
ALTER TABLE "user_build" ADD COLUMN     "thumbnailAlt" VARCHAR(500);

-- CreateTable
CREATE TABLE "build_screenshot" (
    "id" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "build_screenshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "build_screenshot_buildId_position_idx" ON "build_screenshot"("buildId", "position");

-- AddForeignKey
ALTER TABLE "build_screenshot" ADD CONSTRAINT "build_screenshot_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "user_build"("id") ON DELETE CASCADE ON UPDATE CASCADE;
