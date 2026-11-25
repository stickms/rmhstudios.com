-- s13-16: pack reports join the site's report queue. A pack a moderator removed carries `moderatedAt` (its owner cannot
-- undo it); a pack the reports hid carries `autoHiddenAt`, so a dismissal restores only what the reports hid.
ALTER TABLE "rmhbox_pack" ADD COLUMN "moderatedAt" TIMESTAMP(3);

ALTER TABLE "rmhbox_pack" ADD COLUMN "autoHiddenAt" TIMESTAMP(3);

-- Every hidden pack with three reports was hidden by them, so it is waiting for a review.
UPDATE "rmhbox_pack" SET "autoHiddenAt" = now() WHERE "hidden" AND "reportCount" >= 3;

-- The reports already filed are copied into the queue (reason OTHER, the old text as details). Pending while the pack is
-- still hidden, dismissed otherwise. Idempotent: a report already copied (same reporter, type and pack) is left alone.
INSERT INTO "content_report" ("id", "reporterId", "reason", "details", "entityType", "entityId", "targetUserId", "status", "createdAt")
SELECT gen_random_uuid()::text, r."reporterId", 'OTHER'::"ReportReason", r."reason", 'rmhbox-pack', r."packId", p."ownerId",
  CASE WHEN p."hidden" THEN 'PENDING'::"ReportStatus" ELSE 'DISMISSED'::"ReportStatus" END, r."createdAt"
FROM "rmhbox_pack_report" r
JOIN "rmhbox_pack" p ON p."id" = r."packId"
WHERE NOT EXISTS (
  SELECT 1 FROM "content_report" c
  WHERE c."reporterId" = r."reporterId" AND c."entityType" = 'rmhbox-pack' AND c."entityId" = r."packId"
);
