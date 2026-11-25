-- s11 16: subtitle tracks on RMHTube queue items. Additive only; a new table, so its indexes are not CONCURRENTLY.
CREATE TABLE "rmhtube_subtitle" (
    "id" TEXT NOT NULL,
    "queueItemId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "label" VARCHAR(40) NOT NULL,
    "lang" VARCHAR(16),
    "cues" JSONB NOT NULL,
    "cueCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmhtube_subtitle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rmhtube_subtitle_queueItemId_label_key" ON "rmhtube_subtitle"("queueItemId", "label");

CREATE INDEX "rmhtube_subtitle_addedById_idx" ON "rmhtube_subtitle"("addedById");

ALTER TABLE "rmhtube_subtitle" ADD CONSTRAINT "rmhtube_subtitle_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "rmhtube_queue_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rmhtube_subtitle" ADD CONSTRAINT "rmhtube_subtitle_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
