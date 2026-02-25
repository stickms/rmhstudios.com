/*
  Warnings:

  - You are about to drop the `document` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `document_collaborator` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `document_version` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "document" DROP CONSTRAINT "document_userId_fkey";

-- DropForeignKey
ALTER TABLE "document_collaborator" DROP CONSTRAINT "document_collaborator_documentId_fkey";

-- DropForeignKey
ALTER TABLE "document_collaborator" DROP CONSTRAINT "document_collaborator_userId_fkey";

-- DropForeignKey
ALTER TABLE "document_version" DROP CONSTRAINT "document_version_documentId_fkey";

-- DropTable
DROP TABLE "document";

-- DropTable
DROP TABLE "document_collaborator";

-- DropTable
DROP TABLE "document_version";

-- DropEnum
DROP TYPE "CollaboratorRole";

-- DropEnum
DROP TYPE "DocumentType";

-- CreateTable
CREATE TABLE "rmhtube_room" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "hostId" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "password" TEXT,
    "maxMembers" INTEGER NOT NULL DEFAULT 20,
    "allowMemberQueue" BOOLEAN NOT NULL DEFAULT true,
    "allowMemberSkip" BOOLEAN NOT NULL DEFAULT true,
    "autoPlay" BOOLEAN NOT NULL DEFAULT true,
    "scheduledFor" TIMESTAMP(3),
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "rmhtube_room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtube_room_member" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "rmhtube_room_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtube_chat_message" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "replyToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmhtube_chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtube_queue_item" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "duration" INTEGER,
    "thumbnailUrl" TEXT,
    "addedById" TEXT NOT NULL,
    "addedByName" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "playedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmhtube_queue_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtube_playlist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rmhtube_playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtube_playlist_item" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "duration" INTEGER,
    "thumbnailUrl" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "rmhtube_playlist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rmhtube_user_stats" (
    "userId" TEXT NOT NULL,
    "totalWatchTimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "videosWatched" INTEGER NOT NULL DEFAULT 0,
    "roomsCreated" INTEGER NOT NULL DEFAULT 0,
    "roomsJoined" INTEGER NOT NULL DEFAULT 0,
    "messagesSent" INTEGER NOT NULL DEFAULT 0,
    "reactionsUsed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rmhtube_user_stats_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "rmhtube_room_isPublic_closedAt_idx" ON "rmhtube_room"("isPublic", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "rmhtube_room_member_roomId_userId_key" ON "rmhtube_room_member"("roomId", "userId");

-- CreateIndex
CREATE INDEX "rmhtube_chat_message_roomId_createdAt_idx" ON "rmhtube_chat_message"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "rmhtube_queue_item_roomId_position_idx" ON "rmhtube_queue_item"("roomId", "position");

-- CreateIndex
CREATE INDEX "rmhtube_playlist_userId_idx" ON "rmhtube_playlist"("userId");

-- CreateIndex
CREATE INDEX "rmhtube_playlist_item_playlistId_position_idx" ON "rmhtube_playlist_item"("playlistId", "position");

-- AddForeignKey
ALTER TABLE "rmhtube_room" ADD CONSTRAINT "rmhtube_room_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_room_member" ADD CONSTRAINT "rmhtube_room_member_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rmhtube_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_room_member" ADD CONSTRAINT "rmhtube_room_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_chat_message" ADD CONSTRAINT "rmhtube_chat_message_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rmhtube_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_chat_message" ADD CONSTRAINT "rmhtube_chat_message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "rmhtube_chat_message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_queue_item" ADD CONSTRAINT "rmhtube_queue_item_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rmhtube_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_queue_item" ADD CONSTRAINT "rmhtube_queue_item_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_playlist" ADD CONSTRAINT "rmhtube_playlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_playlist_item" ADD CONSTRAINT "rmhtube_playlist_item_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "rmhtube_playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmhtube_user_stats" ADD CONSTRAINT "rmhtube_user_stats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
