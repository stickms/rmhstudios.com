# 11 — Developer API: games, playtime and achievements

Surface: `/api/v1/games`, `/api/v1/me/games`, `/api/v1/me/achievements`,
`/api/v1/users/$handle/games`; the API reference and explorer (generated from
`lib/api/registry.ts`); the scope picker in the keys manager. Wave 6.
Namespace `api-games` (docs strings only).

## User story

As a developer building a Discord bot, a stream overlay or a personal
dashboard, I want to read the site's game catalogue and, with a member's key,
their playtime and achievements — so that I can show "now playing", progress
toward achievements or a weekly playtime summary without scraping pages.

## Requirements elicitation

- **What exists (verified):** the v1 API (`app/routes/api/v1/**`, wrapped by
  `withDeveloperApi`) covers the account, posts, feed, users and follows,
  bookmarks, notifications, builds, Logs and News, media, leaderboards
  (`leaderboards/$game.ts`, scope `read:leaderboards`), Slice It and webhooks.
  The scope catalogue is `lib/api/scopes.ts` (17 scopes). **Nothing exposes
  the game catalogue, a member's playtime (`GamePlaytime`, `GamePlaytimeDay`)
  or their achievements (`UserAchievement`, rarity in `AchievementRarity`).**
  Members choose who sees their playtime (`User.playtimePrivacy`,
  `/api/settings/playtime-privacy`, read in `lib/playtime/playtime.server.ts`).
- **Decisions:** one new scope `read:games` for everything member-specific;
  the catalogue (`/api/v1/games`) needs any valid key and no scope (it is
  public data). A member's own data via `/me/*`; another member's via
  `/users/$handle/games` only as their `playtimePrivacy` allows for the key's
  owner (public: anyone; friends/followers per the existing rule; private:
  nobody), using the same function the site uses (`canViewPlaytime` in
  `lib/playtime/privacy.ts`), so the API can never show more than the profile
  does. Achievements of another member are not exposed
  (only their own key's member), because there is no achievements privacy
  setting to honour.

## Functional requirements

1. FR-1 `GET /api/v1/games` — the catalogue from `lib/catalog` (`games`): id,
   title, short description, href (absolute), multiplayer flag, tags; only
   listed, on-site titles. Cacheable (`public, max-age=300`).
2. FR-2 `GET /api/v1/me/games` (`read:games`) — the member's played games:
   game id, total minutes, last played, minutes in the last 7 and 30 days.
3. FR-3 `GET /api/v1/me/games/$gameId/days` (`read:games`) — minutes per day
   for up to 90 days (`from`/`to` query, ISO dates, validated).
4. FR-4 `GET /api/v1/me/achievements` (`read:games`) — unlocked achievements:
   id, game id, title, unlocked at, rarity percentage; cursor-paginated,
   optional `gameId` filter.
5. FR-5 `GET /api/v1/users/$handle/games` (`read:games`) — the same shape as
   FR-2 for another member, filtered by their playtime privacy relative to the
   key's owner; `404 not_found` when hidden (never reveal that data exists).
6. FR-6 All endpoints are in `lib/api/registry.ts` (so the OpenAPI document,
   the API reference and sprint 02's explorer show them) with examples, and
   the scope appears in the keys manager's scope list (it reads `SCOPES`).
7. FR-7 Test-mode keys get deterministic fixture data, as other v1 endpoints
   do (`lib/api/test-mode.ts`).
8. FR-8 A webhook event is out of scope; the developer docs page lists the new
   endpoints under a "Games" group.

## Non-functional requirements

- **Security:** scope enforced by the wrapper; privacy check is the site's own
  `canViewPlaytime` (`lib/playtime/privacy.ts`), fed the same relationship
  facts (follower, mutual) the site computes; handles resolved
  case-insensitively as other `users/$handle` routes do; responses never
  include private fields (email, privacy setting itself).
- **Performance:** each endpoint is one or two indexed queries; per-day
  playtime uses `GamePlaytimeDay`'s index; page size ≤ 100; cost weights in
  the wrapper's budget follow the existing table for list endpoints.
- **Compatibility:** additive only; the error envelope and pagination
  (`parsePage`, `nextCursor`) match the existing v1 endpoints.
- **i18n:** the API speaks English (machine interface, like the rest of v1);
  developer-page strings (if any are added) in `api-games`.
- **Steel:** no new page; the generated reference keeps its styles.

## Data model and API

- No schema change.
- `lib/api/scopes.ts`: `read:games` (group "Games").
- Route files (v1 stays as route files, `CLAUDE.md` §3):
  `app/routes/api/v1/games.ts`, `app/routes/api/v1/me/games.ts`,
  `app/routes/api/v1/me/games/$gameId/days.ts`,
  `app/routes/api/v1/me/achievements.ts`,
  `app/routes/api/v1/users/$handle/games.ts`.
- `lib/api/games-serializers.server.ts` (shapes); visibility through
  `canViewPlaytime`.
- `lib/api/registry.ts`: the five operations; `lib/api/test-mode.ts`: fixtures.

## Testing requirements

- Main suite `lib/api/__tests__/v1-games.test.ts`: a key without `read:games`
  gets 403 on the member endpoints; private playtime gives 404 on
  `users/$handle/games`; followers-only playtime is visible only to a
  follower's key; `me/achievements` returns only the key owner's rows; the
  catalogue works with any key and lists no unlisted titles.
- The existing registry/route consistency tests (`lib/api/__tests__/`) cover
  the registry entries; run them.
- Product suite `lib/api/__tests__/games-serializers.product.test.ts`.

## Acceptance criteria

- [ ] With a `read:games` key, `/api/v1/me/games` returns my playtime.
- [ ] Another member's private playtime is a 404.
- [ ] The explorer and OpenAPI list the five endpoints with examples.
- [ ] A key without the scope gets the standard `insufficient_scope` error.

## Out of scope

Writing playtime or unlocking achievements through the API, webhooks for game
events, other members' achievements.
