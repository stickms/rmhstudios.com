-- CreateEnum
CREATE TYPE "UserThemeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DELISTED');

-- CreateTable
CREATE TABLE "user_theme" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "tokens" JSONB NOT NULL,
    "status" "UserThemeStatus" NOT NULL DEFAULT 'DRAFT',
    "priceCoins" INTEGER,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_theme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_theme_status_sales_idx" ON "user_theme"("status", "sales" DESC);

-- CreateIndex
CREATE INDEX "user_theme_authorId_idx" ON "user_theme"("authorId");

-- AddForeignKey
ALTER TABLE "user_theme" ADD CONSTRAINT "user_theme_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

