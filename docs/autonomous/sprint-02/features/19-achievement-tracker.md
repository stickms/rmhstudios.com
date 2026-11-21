# 19 — Achievement tracker

Surface: `/progress` (achievements tab). Wave 7. Namespace
`achievement-tracker`.

## User story

As a member working toward achievements across the site's games and apps, I want
to see which ones I am closest to unlocking, pin up to five to track, and be
told when a tracked one is half-way and nearly done, so that I know what to aim
for in my next session.

## Requirements elicitation

- **What exists (verified):** a catalog of achievements with incremental targets
  (`lib/achievements/catalog.ts`, some marked `secret`), `UserAchievement` with
  `progress` and `unlockedAt`, `progressAchievement` / `grantAchievement`
  (`lib/achievements/engine.server.ts`), rarity (`AchievementRarity`,
  `lib/achievements/rarity.ts`) and the list in
  `components/feed/AchievementsColumn.tsx` (by category, with progress bars).
  **There is no ordering by closeness, no tracking or pinning, and no progress
  milestone notification** — only the unlock notification.
- **Decisions:** at most five tracked achievements. Secret achievements are
  never suggested and cannot be tracked until unlocked (tracking would reveal
  them). Milestones are 50 % and 90 %, each notified once per tracked
  achievement, through `createNotification` so preferences and quiet hours
  apply.

## Functional requirements

1. FR-1 A "Closest to unlocking" strip at the top of the achievements tab: up to
   eight locked, non-secret, incremental achievements with progress of at least
   1, ranked by remaining fraction, ties by rarity (rarer first).
2. FR-2 Track / Untrack on every locked, non-secret achievement row; a "Tracked"
   strip shows the tracked ones with progress ("37 / 50").
3. FR-3 Filters on the list: state (all, locked, unlocked, tracked), category,
   and sort (catalog order, closest, rarest, recently unlocked).
4. FR-4 When `progressAchievement` moves a tracked achievement across 50 % or 90
   %, a notification ("Halfway to <name>", "Almost there: <name>") links to the
   tab; each threshold once.
5. FR-5 Unlocking a tracked achievement removes it from the tracked set.

## Non-functional requirements

- **Security:** owner-only writes; the cap of five is enforced in the database
  write (count inside the transaction); ids validated against the catalog.
- **Performance:** the milestone check is one indexed lookup inside
  `progressAchievement`, only when the row's progress changed; it never throws
  into the caller (achievement progress must not fail a game action).
- **Accessibility:** Track is a toggle button with the achievement name;
  progress uses `role="progressbar"` with `aria-valuenow`/`max` as the list
  already does.
- **i18n:** strings in `achievement-tracker`; achievement names keep their
  existing keys.
- **Steel:** strips are rows on rules, not cards; progress bars flat
  `--site-text` on `--site-bg-subtle`.

## Data model and API

- New model `AchievementTrack` in `prisma/schema/economy.prisma`: `userId`,
  `achievementId String @db.VarChar(64)`, `notifiedPct Int @default(0)`,
  `createdAt`; `@@id([userId, achievementId])`; cascades on user;
  `@@map("achievement_track")`.
- Migration `20261122070100_s02_achievement_tracks`.
- Pure `lib/achievements/tracking.ts` (`closest(defs, rows, rarity)`,
  `crossedThreshold(prevPct, nextPct)`, `MAX_TRACKED`).
- Server `lib/achievements/tracking.server.ts`; hook in `progressAchievement`;
  contract `lib/achievements/tracking.contract.ts`; endpoints
  `GET /api/achievements/tracked`,
  `PUT /api/achievements/tracked/$achievementId`,
  `DELETE /api/achievements/tracked/$achievementId`.

## Testing requirements

- Product suite `lib/achievements/__tests__/tracking.product.test.ts`: ranking,
  secret exclusion, threshold crossing (including a jump over both thresholds at
  once → the 90 % one only).
- Main suite `lib/achievements/__tests__/tracking.test.ts`: the cap holds under
  two concurrent tracks; a milestone notifies once; a failure in the milestone
  check does not fail `progressAchievement`; secret ids are refused.

## Acceptance criteria

- [ ] An achievement at 45/50 appears first in "Closest to unlocking".
- [ ] Tracking a sixth is refused with a message naming the limit.
- [ ] Crossing 50 % on a tracked achievement produces exactly one notification.
- [ ] Unlocking removes it from Tracked.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Tracking on other members' profiles, guides per achievement, coin rewards.
