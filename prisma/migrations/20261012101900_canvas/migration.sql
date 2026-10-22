-- AlterTable
ALTER TABLE "rmheet" ADD COLUMN     "hasNote" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "canvas_event" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "cooldownSec" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "state" BYTEA NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canvas_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvas_placement" (
    "id" SERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "x" SMALLINT NOT NULL,
    "y" SMALLINT NOT NULL,
    "color" SMALLINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canvas_placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvas_cooldown" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastPlacedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canvas_cooldown_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateTable
CREATE TABLE "context_note" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "notCount" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_note_rating" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_note_rating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "canvas_event_startsAt_idx" ON "canvas_event"("startsAt");

-- CreateIndex
CREATE INDEX "canvas_placement_eventId_id_idx" ON "canvas_placement"("eventId", "id");

-- CreateIndex
CREATE INDEX "canvas_placement_userId_idx" ON "canvas_placement"("userId");

-- CreateIndex
CREATE INDEX "canvas_cooldown_userId_idx" ON "canvas_cooldown"("userId");

-- CreateIndex
CREATE INDEX "context_note_postId_visible_idx" ON "context_note"("postId", "visible");

-- CreateIndex
CREATE INDEX "context_note_authorId_idx" ON "context_note"("authorId");

-- CreateIndex
CREATE INDEX "context_note_createdAt_idx" ON "context_note"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "context_note_postId_authorId_key" ON "context_note"("postId", "authorId");

-- CreateIndex
CREATE INDEX "context_note_rating_raterId_createdAt_idx" ON "context_note_rating"("raterId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "context_note_rating_noteId_raterId_key" ON "context_note_rating"("noteId", "raterId");

-- AddForeignKey
ALTER TABLE "canvas_placement" ADD CONSTRAINT "canvas_placement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "canvas_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvas_placement" ADD CONSTRAINT "canvas_placement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvas_cooldown" ADD CONSTRAINT "canvas_cooldown_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "canvas_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvas_cooldown" ADD CONSTRAINT "canvas_cooldown_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_note" ADD CONSTRAINT "context_note_postId_fkey" FOREIGN KEY ("postId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_note" ADD CONSTRAINT "context_note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_note_rating" ADD CONSTRAINT "context_note_rating_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "context_note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_note_rating" ADD CONSTRAINT "context_note_rating_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

