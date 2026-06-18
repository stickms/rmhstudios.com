-- Minimal DDL for the Go e2e tests. Columns copied verbatim (quoted
-- identifiers) from prisma/migrations/0_baseline/migration.sql. Only the tables
-- the e2e flows touch are created. CREATE TABLE IF NOT EXISTS keeps the script
-- idempotent across reruns against a persistent volume.

-- CreateTable: user (auth principal; auth.Validator joins session -> user)
CREATE TABLE IF NOT EXISTS "user" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "username" TEXT,
    "handle" TEXT,
    "handleChangedAt" TIMESTAMP(3),
    "email" TEXT,
    "emailVerified" BOOLEAN,
    "password" TEXT,
    "image" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable: session (Better Auth session validated by SELECT ... WHERE token=$1)
CREATE TABLE IF NOT EXISTS "session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- session.token unique index (matches the baseline; ValidateSession looks up by token)
CREATE UNIQUE INDEX IF NOT EXISTS "session_token_key" ON "session"("token");

-- CreateTable: rmhtube_room (persisted on room create; e2e asserts hostId)
CREATE TABLE IF NOT EXISTS "rmhtube_room" (
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

-- CreateTable: rmhtube_room_member (host member inserted alongside the room)
CREATE TABLE IF NOT EXISTS "rmhtube_room_member" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "rmhtube_room_member_pkey" PRIMARY KEY ("id")
);

-- (roomId,userId) unique index — required by PgxRepo.MemberJoin's ON CONFLICT.
CREATE UNIQUE INDEX IF NOT EXISTS "rmhtube_room_member_roomId_userId_key"
    ON "rmhtube_room_member"("roomId", "userId");

-- CreateTable: rmhtube_queue_item (queue persistence path)
CREATE TABLE IF NOT EXISTS "rmhtube_queue_item" (
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

CREATE INDEX IF NOT EXISTS "rmhtube_queue_item_roomId_position_idx"
    ON "rmhtube_queue_item"("roomId", "position");
