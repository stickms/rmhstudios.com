-- CreateEnum
CREATE TYPE "ListVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');

-- CreateTable
CREATE TABLE "user_list" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "bio" VARCHAR(200),
    "visibility" "ListVisibility" NOT NULL DEFAULT 'PRIVATE',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_list_member" (
    "listId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_list_member_pkey" PRIMARY KEY ("listId","userId")
);

-- CreateIndex
CREATE INDEX "user_list_ownerId_idx" ON "user_list"("ownerId");

-- CreateIndex
CREATE INDEX "user_list_member_userId_idx" ON "user_list_member"("userId");

-- AddForeignKey
ALTER TABLE "user_list" ADD CONSTRAINT "user_list_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_list_member" ADD CONSTRAINT "user_list_member_listId_fkey" FOREIGN KEY ("listId") REFERENCES "user_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_list_member" ADD CONSTRAINT "user_list_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

