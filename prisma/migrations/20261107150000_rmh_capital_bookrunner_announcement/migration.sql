-- Data-only migration: publishes the RMH Capital lead-bookrunner announcement
-- (a parody tombstone) to the pinned feed announcements, site-wide, on deploy.
-- Announcements are rows, not code, so this is how one ships with a commit.
-- Attributed to the earliest admin; inserts nothing if there is no admin.
-- Idempotent via a fixed id. Expires after 14 days; admins can edit or
-- deactivate it from the announcements panel like any other.
INSERT INTO "feed_announcement" (
  "id", "title", "body", "linkUrl", "linkLabel", "variant", "active", "pinned",
  "createdById", "expiresAt", "createdAt", "updatedAt", "imageUrls", "gifUrl"
)
SELECT
  'ann_rmhcapital_bookrunner_202611',
  'RMH Capital is honored to serve as Lead Left Bookrunner',
  'RMH Capital is honored to have served as Lead Left Bookrunner on the $35 million Senior Secured Enlightenment Facility supporting Bain Capital''s acquisition of Tibetan Buddhism.' || E'\n\n' ||
  'The facility was oversubscribed within one kalpa, which let us tighten pricing to the Middle Way and remove all attachment covenants. Impermanence is the only constant. Fees are not.' || E'\n\n' ||
  'Parody, after The Onion. This announcement appears as a matter of karma only.',
  '/rmh-capital',
  'Visit RMH Capital',
  'success',
  true,
  true,
  u."id",
  NOW() + INTERVAL '14 days',
  NOW(),
  NOW(),
  ARRAY[]::TEXT[],
  'https://rmhstudios.com/images/social/rmh-capital/lead-bookrunner-tibetan-buddhism.png'
FROM "user" u
WHERE u."isAdmin" = true
ORDER BY u."createdAt" ASC
LIMIT 1
ON CONFLICT ("id") DO NOTHING;
