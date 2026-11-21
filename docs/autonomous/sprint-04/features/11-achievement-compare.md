# 11 — Compare achievements with another member

Surface: a new page `/progress/compare?with=<handle>`, a "Compare
achievements" link on profiles, and a "Compare with…" field on the
achievements tab of `/progress` (`components/feed/AchievementsColumn.tsx`).
Wave 6. Namespace `achievement-compare`.

## User story

As a member who hunts achievements with friends, I want to see mine beside a
friend's — what we both have, what only they have, and how rare each is — so
that I know what to go after next and have something to talk about.

## Requirements elicitation

- **What exists (verified):** a member's achievements are public:
  `listAchievements(idOrHandle)` (`lib/achievements.server.ts`) merges the
  catalog (`lib/achievements/catalog.ts`) with `UserAchievement` rows, masks
  secret achievements the member has not unlocked, and is served by
  `GET /api/achievements/$userId` (`auth: 'none'`). Rarity percentages exist
  (`AchievementRarity`, `lib/achievements/rarity.ts`). The tracker (sprint 02,
  `lib/achievements/tracking*`) pins goals. There is **no comparison** of two
  members anywhere (`grep` for compare finds nothing in achievements or
  profiles).
- **Decisions:** comparison is the signed-in viewer against one other member.
  Both sides come from `listAchievements`, so the visibility rule is the
  existing one (public). Blocked pairs (either direction) get "not found"
  (the profile itself is hidden the same way). A secret achievement the other
  member unlocked and the viewer has not stays masked ("A secret achievement")
  so comparison never spoils it. No persistence: the page reads and diffs.

## Functional requirements

1. FR-1 `/progress/compare?with=alex` shows both members (avatar, name,
   "128 of 240") and three counts: "Both have 74", "Only you 54", "Only Alex
   31".
2. FR-2 A filter through `components/ui/tabs.tsx` (All / Both / Only you /
   Only them / Neither) and a category select narrow the list.
3. FR-3 Each row: icon, name, description, rarity ("4% of players"), and two
   columns — the viewer's and the other member's state (unlocked with date,
   or progress "3 / 10") — written as text.
4. FR-4 Rows from "Only them" have "Track" (sprint 02's tracker) so the
   viewer can pin it straight away.
5. FR-5 Profiles of other members show "Compare achievements" (signed-in
   viewers); the achievements tab of `/progress` has a "Compare with…" handle
   field using the existing user search.
6. FR-6 Signed out, the page asks the viewer to sign in; an unknown or
   blocked handle shows "No one to compare with".

## Non-functional requirements

- **Security:** the server read is guarded inside its handler
  (`createServerFn` guards from `lib/auth/server-fn-guards.server.ts`, or a
  contract `GET /api/achievements/compare?with=` with `auth: 'required'`);
  `with` is a zod handle or id; block check through the shared block helper.
- **Performance:** two `listAchievements` calls in parallel plus one rarity
  read; the diff is linear in the catalog; the response is private
  (`no-store`).
- **Accessibility:** the list is a table with a caption and column headers
  ("You", "Alex"); states are words, not only checkmarks; the filter is the
  tabs primitive.
- **i18n:** strings in `achievement-compare`; achievement names and
  descriptions come from the catalog as they do on `/progress`; dates and
  percentages via `Intl`.
- **Steel:** the summary is three `t-title` numbers with `t-label` captions
  divided by vertical rules; the table is rows on rules; no cards or colours
  for state.
- **SEO:** personal page, `noindex`, `EXCLUDED_ROUTES` under `s04-11`.

## Data model and API

- No migration.
- `lib/achievements/compare.ts` (pure: the diff, filters, masking of the
  other side's secrets, counts), `compare-schema.ts`, `compare.contract.ts`,
  `compare.server.ts` (`compareAchievements(viewerId, withHandle)`).
- Module `lib/achievements/api/achievements.compare.server.ts` — `compare`
  is a static segment beside `$userId`; the route-table test requires the
  `$userId` sibling to be registered (it is: `achievements.$userId.server.ts`).
- Route `app/routes/_site/progress.compare.tsx` (check how `progress.tsx`
  nests and whether the compare page should be a sibling route; it must not
  render the progress tabs).
- `components/achievements/CompareTable.tsx`, `CompareSummary.tsx`.

## Testing requirements

- Main suite `lib/achievements/__tests__/achievement-compare.test.ts`: a
  blocked pair gets not found; signed out is refused; the other member's
  unlocked secret is masked for a viewer who lacks it.
- Product suite `lib/achievements/__tests__/compare.product.test.ts`: the
  diff counts, every filter, category narrowing, masking.
- `components/achievements/__tests__/CompareTable.test.tsx`: states as text,
  Track only on "Only them" rows.

## Acceptance criteria

- [ ] Comparing with a friend shows the three counts and the filtered lists.
- [ ] A secret achievement only the friend has stays masked.
- [ ] Track on an "Only them" row pins it in the tracker.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Comparing more than two members, comparing per-game stats or playtime,
shareable comparison images.
