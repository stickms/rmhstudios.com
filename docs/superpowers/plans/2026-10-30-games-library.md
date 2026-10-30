# /games Steam-style Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/games` into a two-pane Steam-style library (rail + detail) with apps merged in, achievements, friends' playtime, community, banner art and real playtime tracking.

**Architecture:** `app/routes/_site/games.tsx` becomes a layout route (rail + `<Outlet/>`); `games/index.tsx` is Home, `games/$gameId.tsx` is the detail pane and works for apps too. Playtime comes from a heartbeat hook mounted next to the existing `RecentsTracker`, credited server-side with caps; reads go through one privacy filter. Pure logic lives in small `lib/` modules with colocated tests.

**Tech Stack:** TanStack Start/Router, React 19, Prisma 7 + Postgres, zod, vitest (node env), Tailwind v4 `--site-*` tokens, i18next.

**Spec:** `docs/superpowers/specs/2026-10-30-games-library-design.md`

## Global Constraints

- Never edit `app/routeTree.gen.ts`. `.server.ts` modules never imported from client code.
- API routes wrap every handler in `defineHandler` (`@/lib/api/handler.server`) with a zod body.
- All colours, radii, shadows via `--site-*` tokens; glass role classes by role; shared tabs component, never hand-rolled tab strips; no `backdrop-filter`, no `transition-all`.
- Every user-facing string via `t('key', { defaultValue })`, then `pnpm i18n:extract`; new wording = new key. Namespaces already registered: `site`, `games-hub`, `feed`.
- `pnpm check:consistency` passes before every commit; no new tsc/lint warnings vs `main`.
- `playtimePrivacy`: `public | followers | private`, DB default `'public'`. `followers` = visible to people who follow that user. Signed-out visitors never see anyone's playtime.
- Heartbeat: client every 30 s; server ignores beats < 20 s apart, credits `min(elapsed, 60)` seconds. Counts only while tab visible AND input within last 5 min. `/games` and `/games/*` never match a title; off-site hrefs never track.
- Apps show "time used", games "playtime". Apps: no reviews/guides/leaderboard sections, detail page `noindex`, no new sitemap entries or OG cards.
- `bannerPath`: optional, wide ~3:1 (1920x620 WebP). Hero fallback: `bannerPath` -> `imagePath` cropped under a dark scrim -> hue tile.
- Breakpoint `md` (768px): below it the rail is the page and detail pushes over it; Home is the first rail row.
- Work on branch `claude/games-library` cut from `claude/games-library-design`.

## Review Focus

- Heartbeats from two tabs at once: still one real-time clock of credit per user (no double crediting).
- A path like `/rmhtube/abc123` or `/games/altair` must resolve correctly (room page counts as RMHTube; the hub never counts as Altair).
- A user with `playtimePrivacy = private` never appears in friends, top players or any API response, including to themselves-as-friend lists of others.
- Title with no achievements, no friends, no community: page renders with no empty chrome and no errors; unlisted/off-site entries absent from the rail.
- `/apps`, `/arcade`, `/leaderboard`, `/builds` and `/create?tab=games` still land on a working page; `/apps` is not in the sitemap.

---

### Task 0: Environment and branch

**Files:** none (setup).

- [ ] **Step 1:** `git fetch origin claude/games-library-design && git checkout -b claude/games-library claude/games-library-design`.
- [ ] **Step 2:** Install Node >= 24.18 (repo `engines`), then `pnpm install`. Provide a local Postgres 16+ and a `.env` from `.env.example` (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`). If Postgres cannot run here, DB-backed steps use mocked prisma tests only and Task 12 screenshots use the stubbed fixtures noted there.
- [ ] **Step 3:** Run `pnpm wasm:build && pnpm exec vitest run lib/__tests__/catalog.test.ts`. Expected: PASS (baseline).

### Task 1: Catalog `bannerPath`, `kind`, id uniqueness

**Files:**
- Modify: `lib/catalog/types.ts` (add `bannerPath: z.string().min(1).optional()` to `catalogEntryShape`)
- Modify: `lib/builds/curated.ts` (`CuratedBuild` gains `bannerUrl: string | null`)
- Test: `lib/__tests__/catalog.test.ts`

**Interfaces:**
- Produces: `CuratedBuild.bannerUrl: string | null`; `getCuratedBuild(slug)` unchanged (already returns `kind`).

- [ ] **Step 1: Write failing tests** in `catalog.test.ts`: `'game and app ids are unique across both catalogs'`; `'bannerPath, when declared, exists under public/ and is <= 400 KB'`; `'schema accepts bannerPath'`.
- [ ] **Step 2:** Run `pnpm exec vitest run lib/__tests__/catalog.test.ts`. Expected: FAIL (schema rejects `bannerPath`).
- [ ] **Step 3:** Add the schema field; map `bannerUrl: g.bannerPath ?? null` for games and apps in `listCuratedBuilds()`.
- [ ] **Step 4:** Re-run. Expected: PASS. Commit `feat(catalog): optional bannerPath and cross-catalog id uniqueness`.

### Task 2: Shared route matcher

**Files:**
- Create: `lib/games/route-match.ts`
- Modify: `components/site/RecentsTracker.tsx` (use the matcher instead of its private `ENTRIES`)
- Test: `lib/games/__tests__/route-match.test.ts`

**Interfaces:**
- Produces: `export type CatalogRoute = { id: string; href: string; title: string; kind: 'game' | 'app'; gradient: string; image?: string }` and `export function matchCatalogRoute(pathname: string): CatalogRoute | null`. Longest `href` wins; exact or `href + '/'` prefix; skips `unlisted`, `hidden`, off-site hrefs; returns `null` for `/games` and anything under it.

- [ ] **Step 1: Failing tests:** `/altair` -> altair; `/rmhtube/abc123` -> rmhtube; `/games/altair` -> null; `/games` -> null; `/https://discord.gg/x` style off-site never matches; `/rmhtubefoo` -> null (prefix needs a `/`).
- [ ] **Step 2:** Run the test file. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `matchCatalogRoute` by moving the `ENTRIES` build and lookup out of `RecentsTracker`; `RecentsTracker` calls it and keeps its `recordRecent` payload.
- [ ] **Step 4:** Run the test plus `pnpm exec vitest run components/site` (if present). Expected: PASS. Commit.

### Task 3: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261030120000_games_playtime/migration.sql`

**Interfaces:**
- Produces models: `GamePlaytime { userId, gameId @db.VarChar(64), totalSeconds Int @default(0), lastHeartbeatAt DateTime, lastPlayedAt DateTime, @@id([userId, gameId]), @@index([gameId, totalSeconds(sort: Desc)]), @@map("game_playtime") }`; `GamePlaytimeDay { userId, gameId, day DateTime @db.Date, seconds Int @default(0), @@id([userId, gameId, day]), @@index([userId, day]), @@map("game_playtime_day") }` (both cascade on user delete). `User.playtimePrivacy String @default("public") @db.VarChar(10)`; `User.playtimeNoticeDismissedAt DateTime?`; `Community.gameId String? @db.VarChar(64)` with `@@index([gameId])` (set by admins in the DB; no owner UI in v1).

- [ ] **Step 1:** Edit the schema; write the SQL by hand in the style of `20261026150000_tf2_loadouts` (CREATE TABLE, FKs `ON DELETE CASCADE`, `ALTER TABLE "user" ADD COLUMN ... DEFAULT 'public'`, `ALTER TABLE "community" ADD COLUMN "gameId"`).
- [ ] **Step 2:** Run `pnpm exec prisma validate && pnpm exec prisma generate`. Expected: valid, client regenerated. If Postgres is available: `pnpm db:push`.
- [ ] **Step 3:** Run `pnpm exec tsc --noEmit`. Expected: no new errors. Commit `feat(db): game playtime tables, playtime privacy, community gameId`.

### Task 4: Playtime pure logic

**Files:**
- Create: `lib/playtime/credit.ts`, `lib/playtime/privacy.ts`
- Test: `lib/playtime/__tests__/credit.test.ts`, `lib/playtime/__tests__/privacy.test.ts`

**Interfaces:**
- Produces: `export const HEARTBEAT_MIN_GAP_S = 20`, `HEARTBEAT_MAX_CREDIT_S = 60`; `export function creditSeconds(lastHeartbeatAt: Date | null, now: Date): number` (0 if gap < 20 s; first-ever beat credits 30; otherwise `min(gap, 60)`; negative gap -> 0).
- `export type PlaytimePrivacy = 'public' | 'followers' | 'private'`; `export const PLAYTIME_PRIVACY_VALUES`; `export function isPlaytimePrivacy(v: unknown): v is PlaytimePrivacy`; `export function canViewPlaytime(setting: PlaytimePrivacy, ctx: { viewerId: string | null; ownerId: string; viewerFollowsOwner: boolean }): boolean` (owner always true; signed-out always false; `public` any signed-in; `followers` needs `viewerFollowsOwner`; `private` false).
- `export function shouldBeat(s: { visible: boolean; lastInputAt: number; now: number; signedIn: boolean }): boolean` in `credit.ts` (true only if signed in, visible, `now - lastInputAt <= 5 * 60_000`).

- [ ] **Step 1: Failing tests** with the exact values above, including `creditSeconds` at gaps 5/20/45/600 s and null, and every row of the privacy matrix, and `shouldBeat` at exactly 5 min and 5 min + 1 ms.
- [ ] **Step 2:** Run both files. Expected: FAIL.
- [ ] **Step 3:** Implement the three functions as specified (pure, no I/O).
- [ ] **Step 4:** Run. Expected: PASS. Commit.

### Task 5: Playtime server module and API

**Files:**
- Create: `lib/playtime/playtime.server.ts`, `app/routes/api/games/playtime.ts`, `app/routes/api/settings/playtime-privacy.ts`
- Test: `lib/playtime/__tests__/playtime.server.test.ts` (mock `@/lib/prisma.server` as `lib/__tests__/coin-gift.server.test.ts` does)

**Interfaces:**
- Consumes: `creditSeconds`, `canViewPlaytime`, `matchCatalogRoute`-style catalog lookup (`getCuratedBuild`).
- Produces:
  - `recordHeartbeat(userId: string, gameId: string, now = new Date()): Promise<{ credited: number }>`; rejects unknown or off-site ids with an `Error('unknown title')`. Updates `GamePlaytime` and today's `GamePlaytimeDay` in one transaction, guarded by a conditional `updateMany` on `lastHeartbeatAt` so concurrent tabs cannot double-credit.
  - `type PlaytimeActivity = { totalSeconds: number; last2WeeksSeconds: number; lastPlayedAt: string | null }`; `getActivity(userId, gameId): Promise<PlaytimeActivity>`.
  - `type PlayerView = { userId: string; handle: string | null; name: string | null; image: string | null; totalSeconds: number; last2WeeksSeconds: number }`; `listFriendsWhoPlay(viewerId: string | null, gameId: string, limit = 12): Promise<PlayerView[]>` (viewer follows them, privacy allows); `listTopPlayers(viewerId: string | null, gameId: string, limit = 10): Promise<PlayerView[]>` (privacy allows, any follow state).
  - `listRecentGameIds(userId: string, limit = 10): Promise<string[]>`.
  - `getPlaytimePrivacy(userId)`, `setPlaytimePrivacy(userId, v)`, `dismissPlaytimeNotice(userId)`.
  - `POST /api/games/playtime` body `{ gameId: string }` -> `{ credited: number }` (`rateLimit: 'write'`). `GET/PUT /api/settings/playtime-privacy` mirrors `app/routes/api/calls/privacy.ts`, plus `POST` body `{ dismissNotice: true }`. GET returns `{ playtimePrivacy: PlaytimePrivacy; noticeDismissed: boolean }`.

- [ ] **Step 1: Failing tests:** two beats 10 s apart credit 0 the second time; a beat 45 s later credits 45; a beat 10 min later credits 60; unknown id throws; `listFriendsWhoPlay` omits a `private` user and a `followers` user the viewer does not follow, and includes a `public` followed user; `listTopPlayers` never returns `private` users; signed-out viewer gets `[]` from both.
- [ ] **Step 2:** Run the file. Expected: FAIL.
- [ ] **Step 3:** Implement the module and the two routes. Day bucket = UTC date of `now`; "last 2 weeks" sums days >= now - 14 d.
- [ ] **Step 4:** Run the test plus `pnpm exec vitest run lib/__tests__/api-handler-adoption.test.ts`. Expected: PASS. Commit.

### Task 6: Client tracker

**Files:**
- Create: `components/site/PlaytimeTracker.tsx`
- Modify: `components/Providers.tsx` (render `<PlaytimeTracker />` right after `<RecentsTracker />`, line ~929)

**Interfaces:**
- Consumes: `matchCatalogRoute`, `shouldBeat`, `useSession` from `@/components/Providers`.
- Produces: component that, while `matchCatalogRoute(pathname)` is non-null, sends `POST /api/games/playtime` every 30 s when `shouldBeat(...)`; tracks `lastInputAt` from `pointerdown|keydown|pointermove|touchstart|wheel` (passive, throttled to 1/s); stops on route change or hidden tab; the first beat fires 30 s after mount (no instant beat), so a bounce credits nothing.

- [ ] **Step 1:** Write the one test that is meaningful without a DOM: extend `credit.test.ts` is already covering `shouldBeat`; add `lib/playtime/__tests__/tracker-contract.test.ts` asserting the component file imports `shouldBeat` and `matchCatalogRoute` and does not reference `fetch` outside the interval callback (a source-contract test like `ios-edge-contract.test.ts` does).
- [ ] **Step 2:** Run it. Expected: FAIL (file missing).
- [ ] **Step 3:** Implement the component as specified; return `null`.
- [ ] **Step 4:** Run the contract test and `pnpm exec tsc --noEmit`. Expected: PASS. Commit.

### Task 7: Library model (pure)

**Files:**
- Create: `lib/games/library.ts`, `lib/games/achievement-groups.ts`
- Test: `lib/games/__tests__/library.test.ts`, `lib/games/__tests__/achievement-groups.test.ts`

**Interfaces:**
- Produces:
  - `type LibraryKind = 'all' | 'game' | 'app'`; `type RailItem = CuratedBuild`; `filterRail(items: CuratedBuild[], q: { kind: LibraryKind; search: string }): CuratedBuild[]` (case-insensitive over title and tags).
  - `groupRail(items: CuratedBuild[], recentIds: string[]): { recent: CuratedBuild[]; rest: CuratedBuild[] }` (`rest` alphabetical by title).
  - `heroSource(b: CuratedBuild): { kind: 'banner' | 'cropped-card' | 'tile'; src: string | null; hue: number }`.
  - `ACHIEVEMENT_GROUP_BY_GAME_ID: Record<string, string>` (title id -> catalog `group` label; builder fills from `lib/achievements/catalog.ts`); `achievementsForTitle(id: string, defs: AchievementView[]): AchievementView[]`.

- [ ] **Step 1: Failing tests:** `filterRail` by kind/search; `groupRail` puts recent first in the given order and the rest A-Z; `heroSource` returns banner, then cropped-card, then tile; `'every achievement group label is mapped to a title id or listed as unmapped'` (ratchet: unmapped list can only shrink); `achievementsForTitle('slice-it', defs)` returns only that group's items.
- [ ] **Step 2:** Run both files. Expected: FAIL.
- [ ] **Step 3:** Implement. Read the distinct `group:` values in the achievements catalog to build the map.
- [ ] **Step 4:** Run. Expected: PASS. Commit.

### Task 8: Library shell, rail and routing

**Files:**
- Create: `app/routes/_site/games.tsx` (layout), `components/games-library/LibraryShell.tsx`, `components/games-library/LibraryRail.tsx`, `components/games-library/LibraryHome.tsx`
- Modify: `app/routes/_site/games/index.tsx` (Home: Recent shelf + the existing `PartyBar`, `RankedSummary`, `ArcadeSection`; validateSearch adds `kind?: 'game' | 'app'`), `app/routes/_site/apps/index.tsx` (redirect), `components/creator-studio/CatalogTabs.tsx` (delete if unused after the redirect), `lib/sitemap.ts:70` (remove the `/apps` entry), `lib/seo-catalog.ts` (`APPS_INDEX_PATH` consumers point at `/games`), `lib/sidebar-nav.ts` and `lib/search/catalog.ts` (the `/apps` links keep working through the redirect; retarget them to `/games?kind=app`), `lib/og/static-cards.ts` (drop the `/apps` card if nothing links to it)
- Test: `lib/__tests__/sitemap*.test.ts` already guards the sitemap; add `lib/games/__tests__/apps-redirect.test.ts`

**Interfaces:**
- Consumes: `listCuratedBuilds`, `filterRail`, `groupRail`, `listRecentGameIds` via a server function `fetchRail` (recent ids only when signed in).
- Produces: `useLibraryFavorites(): { ids: string[]; toggle(id: string): void }` in `hooks/useLibraryFavorites.ts` (localStorage, try/catch-wrapped; v1 Collections = a Favorites group pinned above Recent; server persistence is a later change). The view dropdown offers Home and Collections. Layout renders rail left, `<Outlet/>` right; selected row = current `$gameId` param; filter chips use the shared tabs component (All/Games/Apps); below `md` the rail is hidden when a `$gameId` child is active and the detail shows a back link to `/games`; first rail row is "Home" (`/games`).

- [ ] **Step 1: Failing tests:** `'/apps beforeLoad redirects to /games?kind=app'`; sitemap suite fails if `/apps` remains listed (run it to see the current state).
- [ ] **Step 2:** Run `pnpm exec vitest run lib/games/__tests__/apps-redirect.test.ts lib/__tests__ -t "sitemap|apps-redirect"`. Expected: FAIL.
- [ ] **Step 3:** Implement the layout, rail and redirect; `/games` index keeps its `head` and JSON-LD `catalogItemListSchema('game')`.
- [ ] **Step 4:** Run the tests, `pnpm check:consistency --fast`, then `pnpm dev` and confirm `/games` and `/games/altair` render the rail. Commit.

### Task 9: Detail pane

**Files:**
- Create: `components/games-library/GameDetail.tsx`, `DetailHero.tsx`, `ActivityStrip.tsx`, `AchievementsSection.tsx`, `FriendsWhoPlay.tsx`, `CommunitySection.tsx`, `lib/games/format-playtime.ts`
- Modify: `app/routes/_site/games/$gameId.tsx` (loader returns `HubPayload` plus `kind`, `bannerUrl`, `activity`, `achievements`, `friends`, `topPlayers`, `communities`; `head` adds `noindex` for apps via `noindexHead`; uses `getCuratedBuild` instead of `games.find`), `components/games/GameHub.tsx` (reviews/guides/rating become a section rendered only for games)
- Test: `lib/games/__tests__/format-playtime.test.ts`

**Interfaces:**
- Produces: `formatPlaytime(seconds: number): string` (`0` -> `'0 min'`, `3540` -> `'59 min'`, `3600` -> `'1.0 h'`, `37800` -> `'10.5 h'`); communities query = `prisma.community.findMany({ where: { gameId, isPrivate: false } })` limited to 6, ordered by `memberCount` desc.

- [ ] **Step 1: Failing tests** for `formatPlaytime` with the values above.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement; sections: hero (+ primary `<Button variant="signal">` Play linking `href`, external hrefs open a new tab), activity strip (`Playtime` or `Time used` by kind, last played, achievements n/N hidden when N = 0), Achievements (hidden when none), Friends who play and Community (one-line empty states), then reviews/guides/leaderboard for games. Add `data-jelly-zone` attributes only where the existing hub already has them.
- [ ] **Step 4:** Run the test, `pnpm exec tsc --noEmit`, `pnpm check:consistency --fast`. Commit.

### Task 10: Privacy setting and opt-out notice

**Files:**
- Create: `components/settings/PlaytimePrivacyControls.tsx`, `components/games-library/PlaytimeNotice.tsx`
- Modify: `app/routes/_site/settings/privacy.tsx` (render controls after `<PresencePrivacyControls />`), `GameDetail.tsx` or `LibraryShell.tsx` (render the notice)

**Interfaces:**
- Consumes: `GET/PUT/POST /api/settings/playtime-privacy` (Task 5).
- Produces: select with the three values and plain copy ("Public: anyone signed in. Followers: people who follow you. Private: only you."); notice shown once when `noticeDismissed` is false (from the GET above) and the user is signed in, with a link to `/settings/privacy` and a dismiss button.

- [ ] **Step 1: Failing test** `lib/playtime/__tests__/notice.test.ts`: `shouldShowNotice({ signedIn, dismissedAt, privacy })` is false when signed out, dismissed, or already `private`; true otherwise. Put `shouldShowNotice` in `lib/playtime/privacy.ts`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the function, the controls and the notice using existing `SettingsSection` and `Card` primitives.
- [ ] **Step 4:** Run the test and `pnpm check:consistency --fast`. Commit.

### Task 11: i18n, SEO and whole-branch checks

**Files:** locale files via script; no hand edits.

- [ ] **Step 1:** `pnpm i18n:extract`; confirm every new key appears in `locales/en/site.json` / `games-hub.json` (no `{/* */}` comment directly before a `t()` call).
- [ ] **Step 2:** `pnpm exec tsc --noEmit && pnpm lint && pnpm test`. Expected: green, no new warnings versus `main`.
- [ ] **Step 3:** `pnpm check:consistency --base main`. Expected: pass.
- [ ] **Step 4:** Verify `/arcade`, `/leaderboard`, `/builds`, `/create?tab=games` still redirect to a working `/games` (existing redirect tests plus a manual curl against `pnpm dev`).
- [ ] **Step 5:** Commit.

### Task 12: Real-browser verification against Steam

**Files:** screenshots in the session scratchpad only (not the repo).

- [ ] **Step 1:** With `pnpm dev` running, use Playwright (preinstalled) to screenshot `/games`, `/games/altair`, `/games/rmhtube` and `/settings/privacy` at 1440x900 and 390x844, in Daylight and `.style-graphite`.
- [ ] **Step 2:** Compare each against the Steam references in the scratchpad (`steam-ref/` and `steam-client/shot3.png`) and the public Library screenshots; fix layout drift (rail width, hero proportion, row density) and re-shoot.
- [ ] **Step 3:** Send the final screenshots to the user. Run `pnpm audit:pages` if available. Open the PR from `claude/games-library` and fill the repo PR template.
