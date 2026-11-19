# Feature consolidation audit — 2026-11-19

**Type:** audit only. No code was changed while writing this.
**Question:** which features duplicate each other, which are unused or underused, and which don't belong on a social + games + creator site.

## How this was measured

- The git history is squashed (58 commits, all from 2026-11-16 to 11-18), so "last touched" says nothing. The signals used instead were: reachability from the nav (`lib/sidebar-nav.ts`, `lib/settings-nav.ts`, hub pages), inbound links to each route string, the Prisma models and infrastructure each feature owns, its LOC, and `knip` for dead files and dependencies.
- **Real usage data exists, and only the owner can read it.** `/admin/insights` lists 90-day views per route from `route_view_day`, sorted fewest first. Use it to confirm the "orphaned" list below before deleting anything user-facing. Caveat: `lib/ops/route-views.server.ts` buckets any first segment that isn't in `STATIC_ROUTES` or the catalog into `(other)`. Noindex and excluded pages (sohum*, pf2ecal, secret, translate, /strategies, …) therefore can't be seen there at all.

## Tier 0 — Bugs found during the audit

| Issue | Evidence | Fix |
|---|---|---|
| The PWA share target for files is broken | `public/manifest.webmanifest` declares `POST multipart /share`. But `public/sw.js` never runs `importScripts('/sw-share-target.js')`, nothing imports `lib/share/share-target.ts`, and `/share` has no POST handler. | Add the `importScripts` line to `sw.js` (the handler file already exists and is tested), or drop `method`/`enctype`/`files` from the manifest. |
| The battle pass season expired on 2026-09-01 | `lib/battlepass/season.ts` hard-codes `CURRENT_SEASON.endsAt`, and nothing rolls it over. | Start S2, or derive the season from a date table. |
| Scratch file with a test secret, tracked in git | `pass.tmp.ts` at the root (2 lines, `signWikiPass` with the test secret). Nothing references it. | Delete it and its `.prettierignore` line. |

## Tier 1 — Dead code (no product decision needed)

| Item | Evidence |
|---|---|
| `lib/mentions/` (parse + notify, 508 LOC) | It calls itself "the ONE place a mention becomes a notification", but has 0 importers. Posts still use `lib/feed/mentions.ts` + `lib/feed/notify-mentions.server.ts`. Either wire it in or delete it. |
| `lib/recommend/` (818 LOC) | Its API is registered, but no client calls it. |
| Bookmark leftovers | `components/feed/BookmarksColumn.tsx` (0 importers), `/api/bookmarks`, `lib/bookmarks.server.ts`, and the `RMHarkBookmark` model (whose own schema comment says to drop it). |
| `lib/commerce` Pool / PoolContribution | API and an hourly refund sweep, but no UI calls it. `CommunityGoal` does the same job and has a UI. |
| `components/daily-puzzles/three/` (12 files, a 3D desk scene) | knip: no importers. |
| Hooks and stores with no importers | `lib/usePresenceHeartbeat.ts`, `hooks/useLiquidBackground.ts` (+ test), and the knip list: `useExperiment`, `useHistoryBeat`, `useIsDesktop`, `useReadPosition`, `useReservedRows`, `useResource`, `useUndoableAction`, `stores/focusStore`, `stores/navStore`. Check each one before deleting. |
| Unused dependencies (verified by grep, not just knip) | `d3`, `gsap`, `konva`, `@radix-ui/react-progress`, `@tanstack/router-devtools`, `@fontsource/ibm-plex-mono`. (Most of knip's other dependency hits are false positives: fonts loaded from CSS, Vite plugins.) |
| Redirect-only route files (about 20) | `/covid`, `/optimization`, `_site/psychology`, `/lights-out`, `_site/alexdebtcounter`, `/sohumbum2`, `/builds/`, `/user-builds/`, `/apps/`, `/creator-studio`, `/playlists`, `/studio/themes`, `/shop`, `/market`, `/leaderboard`, `/pricing`, `/bookmarks`, `/lists`, `/wishlist`, `/search`, `/spaces`, `/events`, `/personas`, `/settings/circle`, `/settings/calendar`. Collapse them into one redirect map rather than deleting them, so old links keep working. |
| Docs for deleted systems (about 21k lines) | `docs/plasmatic-jelly-*.md` (one file is 15.7k lines), `liquid-glass-system.md`, `jelly-group-audit.md`, `plans/*liquid*`, `plans/*eversion*`, `plans/globe-eversion/`, `plans/plasmatic-jelly/`. Move them to `docs/archive/`. Clean up the stale comments that name `components/radial` and eversion. |
| Stale references | `lib/rum-slo.ts` lists a `/textbook` route that doesn't exist; `components/design/LiquidGlassPage` actually renders `/design`. |

## Tier 2 — Consolidations (the same thing built more than once)

### Social
- **Curated feeds:** `UserList`, `CustomFeed`, `SavedSearch` with alerts, `KeywordAlert` and `Watch` are all "show/notify me about these people, tags or terms". A list is a `CustomFeed` with only `authorIds`, and a saved-search alert is a keyword alert. → One Feed model with a notify flag, managed under Explore. `/feeds` currently has **no inbound links**.
- **Scheduling:** 7 models for "a time, and who's coming": CommunityEvent (+2 RSVP tables), GameNight, ScheduledSlot (`/schedule`), AvailabilityPoll (`/when`), OfficeHours, Reminder, CalendarFeed. `lib/schedule/grid.server.ts` already merges two of them. → One Event model plus one `/calendar` page. `/schedule` and `/game-night` currently have **0 inbound links**.
- **Live rooms:** Spaces (text room), GroupCall open rooms (voice) and the party bar. → A Space is a voice room with side chat.
- **Chat tables duplicated:** DirectMessage/GroupMessage, plus parallel reaction and poll-vote tables. `lib/chat-plus` already abstracts over both. → Long term, one Conversation model with members.
- **Two community front ends:** `/c/$slug` and `/games/communities` / `/games/groups/$slug` (`components/steam/*`) show the same data. Also, `/groups` means group chats while `/games/groups` means communities. Server code is split across `communities.server.ts`, `community.server.ts` and `lib/communities/`.
- **Saves:** mostly merged into `/saves` already. Add chat-plus "Saved Messages" and Reminders as tabs there.

### Economy and progression
- **About 7 ways to bet coins:** predictions (LMSR), forecasting seasons, election markets, wager matches, tournament pick'em, casino tables, plinko. There are 4 separate escrow implementations (`lib/wager/escrow`, casino `stake-ledger`, `lib/commerce/pools`, `community-goal`, which says it copies pools). → One `lib/economy/escrow` module, whatever survives Tier 3.
- **4 shops plus a second currency:** shop, daily shop, market, user storefronts, and the card market with gems. → One Listing model with a `kind` field.
- **5 progress summaries:** `/progress` and `/achievements` render the same `JourneyColumn`. `/recap`, `/wrapped` (with both `lib/wrapped.server.ts` and `lib/wrapped/`), `progress-summary.server.ts`, `/today` (0 links) and "On this day" memories are the others. → One `/progress` (or "You") page with tabs, and redirects for the rest.
- **Streaks and seasons:** DailyStreak, ArcadeStreak, and per-app streaks (study, type, doctrine, rmhbox); three season systems (battle pass, ranked, prediction). → One `Streak(userId, kind)` model and one season clock.
- **Competition routes with no nav at all:** `/tournaments`, `/speedruns` (3.7k LOC), `/wager`, `/daily-mutator`, `/ranked`. → One `/compete` hub.
- `components/economy` (2 files) vs `components/economy-plus` → merge into `components/wallet`. Staking and the daily wheel sit on /progress but are coin features → move them to /wallet.

### Content and creator
- **Builds:** `/create/builds`, `/user-builds/{submit,manage,$slug}` and `/builds/$slug` → everything under `/create/builds/*`, with one detail route.
- **Vibe pages:** `/create` gallery, `/v/new`, `/v/$slug` → the composer inside /create; `/v/$slug` stays as the public viewer.
- **Flashcards twice:** `/study` (FlashcardsColumn) and `RmhStudyFlashcards` in /rmhstudy, on the same model and contract.
- **Daily/word games, 5+ surfaces:** `/daily` puzzles, `/connections` user grids (orphaned), hidden rmhdle and rmh-connections catalog cards that link to Discord, `/daily-mutator`, `/games/daily` (a copy of `/store?tab=daily`), and the daily puzzles inside doctrine (`/strategies`, 14 models). → One Daily hub.
- **Reading:** `/reading` (orphaned) → a "My reading" view of `/library`.
- **Changelog:** `/changelog` (36 LOC) and `/site-history` → one page. `/breaches` → a section of `/security`.
- **Naming:** `components/creator-studio` is the /create hub, while `/studio` is the music DAW. Rename to `components/create`. Rename `lib/devplatform` to `lib/developer`.
- **AI:** move every model call behind `lib/ai/provider.server.ts` and fold `lib/deepseek` into it.
- **Brand registries:** `lib/businesses.ts` and `lib/verticals.ts` list the same brands. → One source.

### Code-level
- Relative-time helpers: 5+ local `timeAgo` copies → `relativeTimeShort` / `<RelativeTime>`.
- `formatDuration` (7 copies), `formatDate` (5), `formatBytes` (3) → `lib/core/format.ts`.
- Local `getJson`/`fetchJson` copies → `lib/http`.

## Tier 3 — Out of place for this site (owner decisions)

### Ports of commercial games — the biggest legal risk, and the biggest code
| Item | Evidence | Size |
|---|---|---|
| Balatro | `data/balatro-pack/core-*.zip` contains the game's actual Lua source (`card.lua`, `blind.lua`, …), served by `api/balatro/pack.$file.ts`. Already unlisted, sign-in only; `feature.ts` says "owner decision pending". | ~110k LOC, 4.9 MB |
| TF2 hub, game, HUD and loadout | `tf2-assets-sync.yml` downloads Valve's files with SteamCMD and republishes them; `public/tf2-hud` is 57 MB. | ~470k LOC; 3 workflows |
| Half-Life 2, Portal (`lib/sp-game`), CS:GO | The same SteamCMD pipeline (apps 219, 410, 740). | ~80k LOC |

These are recreations of commercial games built from those games' own assets. Removing them would take out well over half the repository's TypeScript.

### Coin gambling
Casino tables (blackjack, hold'em, baccarat, roulette; 22–31k LOC, wired into the socket hub's shutdown path), plinko, wager and prediction markets. Coins can be bought through Stripe memberships, which is what puts this in regulated territory. Recommendation: keep at most prediction markets, and remove casino and plinko.

### Service verticals that have nothing to do with social, games or creators
| Vertical | Infra | Note |
|---|---|---|
| RMHLadder (job board) | own `ladder-worker`, **30 Prisma models**, scrapes Greenhouse, Lever and Workday | ~49k LOC |
| RMHHomes (housing) | own `homes-worker`, 6 models, scrapes Craigslist and others | ~18k LOC; terms-of-service risk |
| Rideshare | 4 models, public OSRM/Nominatim | ~13k LOC; liability optics |
| Elections | 3 models, NYT feed; orphaned (only site-history links to it) | ~44k LOC for a seasonal event |
| Dunesday (MCU + Dune marathon planner) | 1 model | ~59k LOC for a novelty |
| RMHCalculator | paid DeepSeek call for every calculation | ~6.7k LOC |
| Corporate parody microsites (rmh-capital, rmh-pmc, rmh-research, rmh-datacenter, adaptive-intelligence, deeplink, rmh-internal-affairs; services/fashion and rebar-rutabaga) | none | ~30k LOC. Each has its own layout and CSS bundle. If kept, they should share one `VerticalLayout`. rmh-internal-affairs is orphaned. |
| `/when` + office-hours | scheduling models | a Doodle/Calendly clone; see the scheduling merge above |
| rmhOS | `rmhos-net` + `rmhos-egress` services | still "Coming soon" but already running infrastructure |

### Personal and in-joke pages
`/kaikaidebtcounter` (19k LOC + a model), `/sohumtracker` (15k + a cron job) and `/sohumbum`, `/pf2ecal` (18.5k, 5 models, a Discord cron job; it serves one tabletop group), `/quotes` (a Steve Jobs page, 0 links), `/black-lives-matter` (0 links), `/canvas` (orphaned; event-only?), `/secret/*` (hidden on purpose). If any are kept: fold sohumbum into sohumtracker, and make the debt counter a parameterised `/debt/$person`.

### Heavy but probably worth keeping
rmhmusic (145k LOC, 86 MB of audio), slice-it (107k), hearthworks (104k), altair (76k). Overlapping games to consider merging: velum2099 / nightrail / neon-driftway (three driving or courier games), dream-rift / void-breaker (two shooters), and the standalone lights-out vs the daily-puzzles one.

## Orphaned pages: link them or cut them

These have no nav entry and almost no inbound links (confirm on `/admin/insights`): `/today`, `/schedule`, `/game-night`, `/feeds`, `/quotes`, `/series`, `/reading`, `/connections`, `/rmhbox-packs`, `/emoji-packs`, `/wager`, `/tournaments`, `/speedruns`, `/daily-mutator`, `/recap` and `/wrapped` (they only link to each other), `/elections`, `/canvas`, `/rmh-internal-affairs`, `/history` (search only), `/help` (search only), `/translate`.

## Suggested order

1. Tier 0 fixes and the Tier 1 deletions: safe, mechanical, and no product decisions.
2. Low-risk merges that redirect old URLs: progress/achievements/recap/wrapped, changelog/site-history, breaches→security, the redirect map, the /compete hub, the format helpers.
3. Owner decisions from Tier 3, each as its own PR, since each deletion also has a migration, an infra and a docs footprint.
4. The data-model merges (feeds, events, escrow, listings, conversations). These need migrations and are the most work.
