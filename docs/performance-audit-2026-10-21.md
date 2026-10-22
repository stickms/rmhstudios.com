# Performance audit — 2026-10-21

Follow-up passes on the backlog left by
[`performance-audit-2026-10-08.md`](performance-audit-2026-10-08.md),
[`ui-perf-audit-2026-10-09.md`](ui-perf-audit-2026-10-09.md) and
[`css-js-audit-2026-10-09.md`](css-js-audit-2026-10-09.md). Each section is
self-contained.

---

## Critical CSS + preload priority

Backlog items: _"split `globals.css`"_ (loading-audit 06 §5, 10-08 _Not done_)
and _"lower the module preloads' priority"_ (ui-perf-audit 10-09 _Not done_ §1).

### Method

`pnpm build:frontend`, served from `.output/server/index.mjs` against a migrated
local Postgres, behind a small gzip proxy (production compresses HTML; the local
Nitro server does not). Chromium via Playwright, cold cache per load, CDP
network + CPU throttling, interleaved A/B (old build, new build) per run:

| Profile  | CPU | RTT     | Downlink   | Viewport    |
| -------- | --- | ------- | ---------- | ----------- |
| 4G       | 2×  | 100 ms  | 9 Mbit/s   | 768×1024    |
| 3G       | 4×  | 300 ms  | 1.6 Mbit/s | 390×844 @2x |
| 2G-class | 6×  | 1200 ms | 250 kbit/s | 390×844 @2x |

Per load: FCP, LCP, when the Inter woff2 finished, when the last JS finished,
and _hydrated_ (first moment `document` carries React's container key). Byte
sizes are brotli q11 of the built files. CSS usage is Chrome CSS coverage at 390
and 1440 px after a scroll.

**Caveat.** Locally this is HTTP/1.1; production is HTTP/2+ through Cloudflare,
which already sends the CSS first. Priority is still the signal both stacks
act on (Chrome's request scheduler here, the H2/H3 priority the edge honours
there), so the direction should carry, but the local magnitude is not a
production number. RUM (`lib/rum.ts`, `--by-device`) is where to confirm it.

### PRE-1 [fixed] The font finished after the JavaScript

Each page's head carries 82–98 `<link rel="modulepreload">` hints, the route's
whole static JS closure. Chrome gives each one `High` priority, the same as the
Inter preload, and the font's hint is emitted _after_ all of them (TanStack's
`HeadContent` puts route preloads before route `links`). On a slow link they
share the bandwidth, so the font, the one hint that changes how first paint
looks, landed with the JavaScript:

| Inter woff2 done (median)                   |                  before |                       after |
| ------------------------------------------- | ----------------------: | --------------------------: |
| 4G, `/` · `/games` · `/dunesday` · `/daily` | 1.9 · 2.3 · 2.0 · 2.0 s | 0.33 · 0.45 · 0.40 · 0.36 s |
| 3G, same routes                             | 6.4 · 7.6 · 6.8 · 6.6 s |     1.4 · 1.9 · 1.6 · 1.4 s |
| 2G, `/` · `/dunesday`                       |           30.8 · 33.5 s |                 7.9 · 8.9 s |

Inter is `font-display: swap`, so until then every page painted in the fallback
and re-shaped seconds later.

**Fix.** `components/SiteHeadContent.tsx` is the router's `<HeadContent />`
rebuilt from its own public `useTags` + `Asset`, with one change: modulepreload
links get `fetchPriority="low"`. The preloads still start in parallel with the
HTML, which is the whole point of preloading and why removing them was measured
and rejected in 10-08 Part 2 (TBT 126 → 461 ms). They now queue behind the CSS
and the font. The server render and the hydration render produce the same tags,
so nothing mismatches. No patch to `node_modules` is involved. CDP showed no
priority upgrades, so the module graph consumes the low-priority fetches as they
are rather than refetching them.

Medians, ms. 3G and 4G n=5, 2G n=3. _Hydrated_ is the user-facing cost of
delaying JS:

|                | FCP before → after | hydrated before → after |
| -------------- | ------------------ | ----------------------- |
| 4G `/`         | 520 → 424          | 2400 → 2224             |
| 4G `/games`    | 512 → 508          | 2936 → 2838             |
| 4G `/dunesday` | 604 → 512          | 2450 → 2150             |
| 4G `/daily`    | 632 → 492          | 2455 → 2307             |
| 3G `/`         | 1656 → 1540        | 7608 → 7183             |
| 3G `/games`    | 1300 → 1324        | 9206 → **9448**         |
| 3G `/dunesday` | 2256 → 1996        | 8026 → 7261             |
| 3G `/daily`    | 2204 → 1900        | 7967 → 7614             |
| 2G `/`         | 9284 → 8028        | 35451 → 33368           |
| 2G `/dunesday` | 13000 → 10672      | 37894 → 34343           |

Hydration got earlier everywhere except `/games` on 3G, which is +2–3% and
reproduced in two separate runs. `/games` is the image-heavy page, and a `Low`
script now competes on equal terms with its below-the-fold images. Worth
watching in RUM, not worth a special case.

Gate: `lib/__tests__/head-preload-priority.test.ts` (the transform, and that the
root shell does not fall back to the stock `<HeadContent />`).

### CSS-3 [fixed] `/dunesday`'s render-blocking sheet carried four lazy apps

Coverage across `/`, `/games`, `/news`, `/explore`, `/dunesday` and `/daily`
found one outlier among the per-route sheets. `dunesday.css` was **38.1 KB
brotli (200 KB raw), 2.9% used** at first paint, and render-blocking. The next
largest route sheet is 5.3 KB. It `@import`ed the sheets of Minesweeper, the
card games, Paint/Photos and Cmd/Calculator/Task Manager, all of which are
`lazy()` windows nobody has opened at first paint. Each sheet is scoped to its
app's root class, which only that app's components use. Each is now imported by
its app component, so Vite ships it with the app's chunk and loads it before the
chunk runs. The sheet goes **38.1 → 32.5 KB brotli (200 → 165 KB raw)**.

### What the split of `globals.css` itself showed (not done, with evidence)

The tiered split from 10-09 (CSS-1) already took the game/app utilities off site
pages: `/` blocks on `site-tier` **41.5 KB brotli** (+ ~11 KB of small sheets),
games and apps on the `app-tier` superset at 55.1 KB. What is left in the site
sheet is shared:

- **Utilities (20.3 KB of the 41.5 KB brotli) belong to no one directory.**
  Tailwind's own scanner (`@tailwindcss/oxide`, with `site-tier.css`'s
  sources and exclusions) attributed every candidate to the top-level
  directories that use it, and `@tailwindcss/node` rebuilt the sheet without
  each directory's _exclusive_ candidates. **No directory removes a single byte.** Every utility
  a site page uses is also used somewhere else on the site, so a third tier
  split by directory (admin, creator-studio, library, …) cannot shrink what `/`
  downloads.
- **The rest is the hand-written body** (unlayered rules 10.8 KB, components
  2.4 KB, `@media`/`@supports` 3.9 KB, fonts' `@font-face` 3.0 KB,
  theme/base/`@property` ~4.3 KB brotli) that 10-09 CSS-2 already pruned of
  4,000 dead lines.
- **Critical-CSS inlining** is the one lever that would cut more, and it is the
  wrong trade here. The sheet is shared and long-cached, and most of the site's
  navigations are full document loads (the `/games` and `/apps` tiles are plain
  anchors). Inlining ~40 KB into every HTML response, which the anon-HTML cache
  and Cloudflare then store per URL, would make every navigation pay for CSS
  the browser already has.

So the measurable CSS win left on the critical path was the per-route outlier
(CSS-3). The bandwidth the site sheet competes for on a slow link was the
bigger problem, and PRE-1 addressed it.

### Not done (and why)

- **`7.css` inside `dunesday.css` (84 KB raw).** Its per-component partials
  (`dist/gui/*.css`) are unscoped, and the site uses the `.win7`-scoped build.
  Trimming it means hand-maintaining a fork of a vendor sheet for a few KB
  brotli on one route.
- **The entry `index-*.css` (3.1 KB brotli, 4–7% used on a given page).**
  Feed/eversion/spatial rules whose components are in the entry. Already cut
  from 107 KB in 10-08. What remains is small and needs per-class co-location.
- **App-route-only rules in `globals.css`** (~0.5 KB brotli, css-js-audit
  _Not done_). Unchanged.
- **React #418 on `/games`** reproduces on the baseline build too (css-js
  audit's pre-existing list). Not introduced here.

---

## 3D idle + long tasks

Two backlog items, both about the 3D games: the 10-08 audit's _"3D landing
scenes render continuously"_ ([`performance-audit-2026-10-08.md`](performance-audit-2026-10-08.md)
§Not done), and the loading audit's _"the 3D games and `/rmhmusic`: 4.8–6.0 s of
long tasks"_ ([`loading-audit-2026-08-11/06-backlog.md`](loading-audit-2026-08-11/06-backlog.md) §7).

### Method

`pnpm build:frontend`, both builds (`origin/main` at `f17b5b066` and this branch)
served side by side from `.output/server/index.mjs` with no database, signed out.
Measured with [`testing/e2e/frame-budget.mjs`](../testing/e2e/frame-budget.mjs),
which gained two things in this pass:

- **`FRAME_GPU=1`** launches Chromium on the host's real GPU (Metal through ANGLE
  on macOS). Under the default SwiftShader every one of these scenes runs at
  **2–7fps**, so a menu cap never binds and the numbers say nothing about
  rendering. Every number below is on an Apple M3 Pro, desktop profile,
  vsync-capped at 60Hz.
- **Browser CPU off Linux**: where there is no `/proc`, CPU now comes from CDP
  `SystemInfo.getProcessInfo` — this browser instance's processes only, so a
  second Playwright run or a desktop Chrome on the same machine does not leak
  into it. (A first attempt matching `ps` output by binary path did leak; two
  agents were measuring concurrently.)

Load cost is Long Animation Frames ≥ 50 ms from navigation to 15 s after `load`,
median of 5 runs, with and without 4× CPU throttling.

### Finding 1 — every menu backdrop ran at the panel's full rate

| route            | what is behind the menu                                                                                                                                                                       | why it drew every vsync                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/isleworks`     | the island, behind a translucent title card                                                                                                                                                   | R3F `frameloop="always"`                                                                                                                                |
| `/nightrail`     | the idle cruise, behind a blurred menu                                                                                                                                                        | its own rAF loop drew every tick; under reduced motion it drew the same still frame every tick                                                          |
| `/neon-driftway` | the idle cruise, behind a blurred menu                                                                                                                                                        | its own rAF loop drew every tick                                                                                                                        |
| `/cookgame`      | the town, behind a 60% scrim while any shop/menu overlay is open                                                                                                                              | `setLinvel(…, wake = true)` every frame kept the player body awake forever, and `@react-three/rapier` requests a frame for as long as any body is awake |
| `/velum2099`     | **no 3D scene at all** — the boot terminal is DOM. The 10-08 table attributed its cost to WebGL; it was the CRT scanline animating `background-position`, a full-viewport repaint every frame | CSS                                                                                                                                                     |

Frames above 60 buy nothing behind a blur or a dark scrim, but each one is a
full WebGL draw — and, under `backdrop-filter`, a re-blur of the whole
viewport. At 240Hz a full-rate menu is 4× the GPU work of the same menu at 60.

> **Revised before merge (PR #924):** this pass first capped backdrops at
> 30fps; the measurements below are from that version. Menus must stay
> smooth, so the shipped cap is `MENU_BACKDROP_FPS = 60` — no change on a 60Hz
> panel (Velum's scanline step and Cookgame's physics-sleep fix still apply),
> 60–72fps instead of the panel's rate on 120/144/240Hz. The R3F cap is
> driven from rAF rather than a timer so a 60fps cap stays vsync-aligned.

**Fix.** One rule, two shapes, both in `lib/render/frame-cap.ts`:

- `MENU_BACKDROP_FPS = 60` for a live scene behind a menu (originally 30; see the note above).
- Raw rAF loops (Nightrail, Neon Driftway) keep their loop and ask a
  `FrameCap` whether this tick draws. It hands back the time since the last
  _drawn_ frame, so the cruise keeps its real speed.
- R3F scenes (Isleworks, Cookgame) set `frameloop="demand"` and mount
  `components/render/FrameCap`, which re-requests a frame from inside every
  frame when uncapped (exactly `"always"`) and, when capped, from a rAF loop on
  the vsync ticks the cap lets through. It
  drives `demand` rather than switching `frameloop`, because R3F's
  `setFrameloop` zeroes `clock.elapsedTime` and every elapsed-time animation
  would jump when a menu opened. `useFrame` deltas stay real time, so
  Cookgame's world clock and passive income and Isleworks' month clock run at
  the same speed under the cap. A hidden tab still runs nothing.
- `AdaptiveQuality` skips frames while its renderer is capped
  (`isFrameCapped`), so opening a menu is not mistaken for a slow GPU and does
  not step render quality down.

Per game:

- **Isleworks** — capped until "Found a city"; full rate after.
- **Nightrail** — menus and the pause screen capped; under reduced motion the
  still backdrop is drawn once and again only on a resize or a screen change.
- **Neon Driftway** — menus capped, and a paused _solo_ run. Not capped in
  multiplayer (the other cars are still driving), with gyro head-look, or in a
  stereo viewer, where a capped rate is felt rather than seen.
- **Cookgame** — capped while an overlay is open. The player body is now woken
  only when there is movement input (`PlayerController`), so it can sleep;
  movement, stopping and the camera follow are unchanged.
- **Velum 2099** — the scanline crawl is a `transform` on a layer one pattern
  period taller than the screen, stepped a whole pixel at a time
  (`steps(3)` over 0.24 s = the old 12.5 px/s; whole-pixel steps keep the 1px
  rules crisp). The flicker and crawl are off under `prefers-reduced-motion`
  — a whole-screen flicker is a flash.

**Measured** (two interleaved before/after rounds; frames at rest from
`DrawFrame` trace events, CPU across all of this browser's processes):

| route                    | frames/s at rest |                                  browser CPU ms/s at rest |
| ------------------------ | ---------------: | --------------------------------------------------------: |
| `/isleworks` (title)     |    60 → **30.5** |                                141–145 → **83–96** (−37%) |
| `/nightrail` (menu)      |      60 → **30** |                                  190 → **107–121** (−40%) |
| `/neon-driftway` (menu)  |      60 → **30** |                              176–186 → **104–110** (−41%) |
| `/velum2099` (terminal)  |      60 → **15** |                                166–188 → **70–86** (−55%) |
| `/cookgame` (no overlay) |          60 → 60 | 152–181 → 152–153 (unchanged, by design — it is the game) |

WebGL frames actually drawn, counted from the context's draw calls while
driving each game (`raf` stays at 60 throughout — input is never capped):

|                                     |             before |            after |
| ----------------------------------- | -----------------: | ---------------: |
| Isleworks title → founded           |            61 → 61 |      **30** → 61 |
| Cookgame world → menu open → closed |       61 → 61 → 61 | 61 → **32** → 61 |
| Nightrail menu                      |                 61 |           **30** |
| Neon Driftway menu                  |                 61 |           **30** |
| Velum 2099 driving                  | — (crashed, below) |               61 |

GPU time is not in the CPU column, and these are 60Hz numbers: on a 144Hz panel
the uncapped side is 144 draws a second, so the saving is larger than shown.

### Finding 2 — Velum 2099's Solo Drive crashed on start

`ReferenceError: getAudioContext is not defined` the moment a drive started. A
codemod had inserted `import { getAudioContext, resumeAudioContext } from
'@/lib/shared/platform'` on line 3 of `main.ts`, `audio/EngineSound.ts` and
`audio/LofiRadio.ts` — inside each file's opening `/* … */` banner, so the import
was a comment. Moved below the banners. (`// @ts-nocheck` on all three is why
`tsc` never saw it.) A scan of every file importing `@/lib/shared/platform`
found no other import trapped in a comment.

### Finding 3 — the "4.8–6.0 s of long tasks" does not reproduce

Long Animation Frames ≥ 50 ms on load, median of 5:

| route            | unthrottled | 4× CPU — `main` | 4× CPU — this branch |
| ---------------- | ----------: | --------------: | -------------------: |
| `/cookgame`      |       55 ms |          250 ms |               240 ms |
| `/isleworks`     |        0 ms |          375 ms |               371 ms |
| `/nightrail`     |       52 ms |          193 ms |               192 ms |
| `/neon-driftway` |       68 ms |          184 ms |               184 ms |
| `/velum2099`     |       59 ms |          234 ms |               188 ms |

Branch and `main` are within run-to-run noise (±60 ms), as expected: nothing in
this pass changes what runs on load.

With a GPU the 3D tier's load is no longer seconds of frozen main thread. At 4×
the largest single frames are **not 3D**: the shared entry module's evaluation
(`index-*.js`, 87–126 ms at 4×, on every route) and hydration (a React event
listener, 43–77 ms). The only 3D-specific item over 50 ms is evaluating the
`IsleworksGame` chunk (88 ms at 4×, ~22 ms real). Under SwiftShader the main
thread is also quiet — the cost moves into the GPU process, where LoAF does not
see it, and shows instead as the 2–7fps above.

The 08-09 number was taken before the entry chunk was halved (08-04 follow-ups,
10-09) and in a software-GL container; the figure in the backlog should not be
treated as current. **No speculative init-staging was done**: there is no
measured freeze for it to fix.

### Not done

- **`/rmhmusic`** redirects to `/login` signed out, and this environment had no
  database to sign in against. It was not measured.
- **Mobile.** All numbers are desktop. The cap's effect does not depend on the
  device; the absolute CPU numbers do.
- **A real 144Hz panel.** Headless Chromium is vsync-capped at 60Hz, so the
  high-refresh saving is arithmetic, not a measurement.
- **Cookgame at rest without an overlay** still draws every frame: the player
  is on screen and the world clock is running, so that is the game, not a
  backdrop. A player standing still could drop to demand-only rendering once
  NPC/clock-driven visuals are known to be idle — not attempted.
- **The shared entry chunk and hydration** are the largest load-time frames on
  every 3D route and belong to the critical-path work, not this tier.

---

## zod/mini

Backlog §1 — "zod on the critical path: 71 KB, 246 module paths". The item was
named after its proposed fix (`zod/mini`). That fix was not needed: no
schema was rewritten.

### What the backlog said, and what was true on 2026-10-21

- **The entry was already clean.** The 2026-10-09 CSS/JS audit took zod out of
  the entry closure (`scripts/check-entry-composition.ts` fails on it again).
  The backlog's "on every page" was stale.
- **But 66 of 319 route-component chunks still loaded the zod runtime
  statically**: the `schemas-*` chunk, 72.3 KB raw / 16.8 KB brotli. That
  included the home feed, explore, tag, thread, post, profile, community,
  messages and every settings page.
- **None of those routes validated anything with it.** In every hot-route
  case, a component imported a _constant, helper or type_ from a module that
  also declared an API input schema. Every one of those schemas ran only
  inside an API handler or a `.server.ts` module. The home feed reached zod for
  `isExpired` (via `lib/posts-plus/constants.ts`). The post page reached it for
  `MAX_COMMENT_LENGTH`, and every community route for the flair chip's colour
  classes.

### Why not `zod/mini`

- It would still have shipped a zod runtime: smaller, but not zero.
- Mixing `zod/mini` on the client with classic `zod` on the server doubles the
  surface for one contract.
- It would have meant rewriting ~250 server-input validators by hand, which is
  exactly the risk the backlog warned about.

The real problem was module shape, not zod's size. So the fix is the repo's
existing pair convention (`lib/CLAUDE.md` §`.server.ts`): a zod-free `foo.ts`
for constants, helpers and types, and a `foo-schema.ts` / `schema.ts`
sibling that the API routes import. Schemas were **moved verbatim**. The
staged diff's 1,220 removed lines include no schema line that does not
reappear unchanged in an added line (checked mechanically). Every existing
schema test — `posts-plus`, `feed-signals`, `srcdoc`, `rmhark-schema`,
`handle`, `profile-modules`, `profile-plus`, `profile-status`, `reminders`,
`history-resume`, `emoji-packs`, `home-widgets`, `notify-categories`,
`presence-types`, `bulk-ops`, `awards-catalog`, `packs`, `profile-links`,
`delight` — passes against the moved schema unchanged.

Two dialogs genuinely validate in the browser: `TipDialog` with `tipSchema`,
and `ReportDialog` with `reportSchema`. They were already lazy-loaded
everywhere except `ProfileColumn` and `InterviewReports`, which now
lazy-load them the same way (mounted on first open).

### Numbers (brotli, `vite build --sourcemap`, origin/main `f17b5b066` vs branch)

Route-only closure = the route component chunk's static closure minus the
entry closure every route shares:

| Route                       |   Before |    After |        Δ |
| --------------------------- | -------: | -------: | -------: |
| `/` (home feed)             |  49.1 KB |  31.8 KB | **−35%** |
| `/explore`                  |  92.2 KB |  74.6 KB |     −19% |
| `/u/$userid` (profile)      | 207.0 KB | 186.9 KB |     −10% |
| `/u/$userid/post/$postid`   |  98.1 KB |  79.6 KB |     −19% |
| `/c/$slug`                  | 139.5 KB | 121.1 KB |     −13% |
| `/messages/$conversationId` |  93.2 KB |  75.9 KB |     −19% |
| `/settings/profile`         |  53.3 KB |  36.4 KB |     −32% |

Each route drops the whole 16.8 KB `schemas-*` chunk: 72 KB of JS the phone no
longer downloads, parses or compiles. The profile route also loses
`TipDialog`. Route components reaching zod statically: **66 → 17**. The entry
is unchanged (`check-entry-composition` ok; bundle budget unchanged).

### The gate

`lib/__tests__/zod-off-hot-routes.test.ts` walks the static source import
graph from 42 routes, the same way the bundler does: `.server` modules are
dead ends and `import()` is not followed. It fails with the import chain if
any reachable module imports zod. It was verified to fail on the real
regression (pointing `FlairChip` back at `plus-schema` fails 7 routes). It
has no allowlist.

### What is left (17 routes)

- **Admin** (`/admin/announcements`, `/admin/reports`,
  `/admin/security-reports`) and `/security`: low traffic. The same split
  applies if wanted.
- **Games/apps that validate at runtime in the browser:** `slice-it` (3
  routes), `laundry-sort`, `daily/globeset`, `dunesday`, `rmhtube/$roomId`,
  `rmhcalculator`, `pf2ecal`, `rmh-farming-sim`, `replays.$id`,
  `embed.replay.$id`, `bums-rush`. Their carriers are socket-payload contracts
  (`lib/shared/realtime/contract.ts`, `lib/*/net/events.ts`) and replay
  parsing (`lib/game/replay.ts`, `lib/daily-puzzles/replay-schema.ts`). These
  parse untrusted input on the client, so moving them server-side is not an
  option. **This** is where `zod/mini` (or hand-rolled guards) belongs, and
  zod is a small share of those routes' payloads. It is not worth doing
  without a measurement on those routes.
- `/rmhladder/jobs/$jobId` is clean in the build. It is excluded from the
  source-level gate only because its loader imports a zod module that runs
  solely in a server function.

---

## Navigation commit

The 10-09 pass ([`ui-perf-audit-2026-10-09.md`](ui-perf-audit-2026-10-09.md),
"What is left") named the remaining page-switch cost: a client navigation
mounts the incoming page in ONE synchronous React commit (the router publishes
through `useSyncExternalStore`, which is never time-sliced), and the two pages
left were the home feed (`/`) and `/explore`'s discovery modules — plus the
teardown of a big hub like `/games` on the way out. `DeferOnNavigate` was the
named lever.

Measuring before reaching for it changed the picture on all three.

### Method

`testing/e2e/page-switch.mjs` (new; [`testing.md`](testing.md) §6) drives the
**built** app (`pnpm build:frontend`, Nitro server, migrated local Postgres
seeded with 40 users, 400 posts, 12 tags, 6 communities so the feed and
discovery modules render a realistic DOM). A real click on a nav-rail link from
a settled page, 1600×1000, 4× CPU + 100ms RTT (and 1× / no latency), medians of 5. It reports **paint** (click → the destination's top-of-page marker in the
DOM + one frame), **complete** (every `DeferOnNavigate` placeholder filled),
and from the Long Animation Frames API the **max frame**, summed **blocking**
time, style+layout, and **CLS** over the switch. Two arrivals: **tap** (no
hover, so no hover-intent preload — though the shell's viewport prefetcher has
usually warmed an on-screen rail link by then) and **hover** (pointer rests
600ms first, so the router has the destination's code and loader data). `a>b:c`
starts from a page reached within the visit. Attribution came from CPU profiles
of single switches on an unminified build (`vite build --minify false`).

This machine is faster than the 10-09 box at the same throttle, so absolute
numbers are lower than that audit's; compare the columns, not the audits.

### What was actually slow

**`/explore` — a forced layout, then fifteen cards.** The single biggest item
in the `→ /explore` long task was not React at all: a native `focus()` taking
**~55ms**. `ExploreColumn` autofocuses the search field (keyboard devices only)
from a passive effect, and passive effects of a synchronous commit run before
the frame — `focus()` needs current style and layout, so it laid out the whole
~1,700-element incoming page synchronously, and the frame then did it again.
The rest of the task was the Top tab's discovery modules, most of it the
fifteen "Hot this week" `RMHarkCard`s at the bottom of the page.

**`/` — not the commit; a skeleton held up by React for ≥300ms.** The click's
own frame on `→ /` was only ~85–110ms. The first card appeared ~300ms later
with **no long task and no network in between**. Two causes, stacked:

1. The home loader returns the first feed page UNAWAITED, and `<Await>` on React
   19 is `React.use(promise)`. A plain promise React has never seen has no
   `status`, so `use` suspends on it **even when it has already resolved** (a
   native promise's `then` never runs synchronously). The navigation render is
   synchronous, so the suspension commits the skeleton — and React then holds
   the content back until ≥300ms after that fallback appeared (its Suspense
   fallback throttle). Hover preloading had already fetched the feed; it made
   no difference.
2. Coming back to `/` within a visit, the feed store already holds the
   timeline — and `FeedWheel` renders from the store whenever it has items,
   ignoring the streamed page. Waiting on `<Await>` for that page anyway put the
   skeleton (and the fetch) in front of posts that were already in memory.

There was also a forced layout here too: `RadialFeed` read the compose button's
`offsetWidth` synchronously in a mount effect (~25ms at 4×) to publish the FAB
lane width — a measurement its own `ResizeObserver` delivers for free after the
frame's layout.

**`/games` teardown — not the selectors.** The `:not(:last-child)` spacer
restyle the 10-09 audit suspected measured small here (~20–25ms of style over
~480 elements, inside a `/games → /communities` switch whose longest frame is
~75–85ms, against ~75ms from a light page). The measurable part of the
teardown is framer-motion's layout projection: the `LiquidTabs` thumb is a
`layoutId` element, and its unmount (`willUpdate`) and the follow-up
projection pass measure layout (`measureScroll`, 16–38ms self time at 4×).
That is the CSS-only-thumb item the 10-09 audit already listed; see _Not done_.

### A bug in `DeferOnNavigate` found on the way

`DeferOnNavigate` must never defer on back/forward — scroll restoration puts the
reader back at an offset that is usually inside the deferred part. It detected
back/forward from `<html>.nav-pop`, which `BackNavAnimation` sets in its own
`popstate` listener. That listener runs **after** the router's: TanStack's
history handler notifies the router synchronously, React renders the restored
page in the microtask between the two listeners, and only then is the class
set. So every back/forward arrival deferred anyway, and the router restored
the offset against a page that was still a placeholder short. On `main`, `/games`
scrolled to 1800px came back at **1335px** (the Arcade Pass panel); the same
would have hit every page this pass wrapped. `DeferOnNavigate` now reads the
router history's own last action (`trackHistoryActions(router.history)`,
subscribed from the root route), which history subscribers learn inside the
router's handler, before that microtask. Verified: `/games` 1800 → 1800, `/`
2200 → 2200, `/explore` 1800 → 1800.

### Fixes

|      | Change                                                                                                                                                                                                | Where                                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| NC-1 | Autofocus one frame after paint, `preventScroll`                                                                                                                                                      | `components/feed/ExploreColumn.tsx`                                       |
| NC-2 | Defer tips / communities / hot posts on the Top tab (`enabled={tab === 'top'}` — on Posts and People those sections ARE the top of the page)                                                          | `components/feed/ExploreRecommendations.tsx`                              |
| NC-3 | `trackPromise()` the home loader's deferred feed, so a preloaded or fresh page renders in the click's commit                                                                                          | `lib/route/tracked-promise.ts`, `app/routes/_site/index.tsx`              |
| NC-4 | Skip `<Await>` when the store already holds the timeline at mount (read once, so the branch can never flip and remount the wheel)                                                                     | `components/radial/RadialFeed.tsx`                                        |
| NC-5 | Build the first four wheel entries in the switch's commit, the rest in a time-sliced transition (`useDeferOnNavigate`, the hook form of the primitive); infinite scroll held until the wheel is whole | `components/radial/RadialFeed.tsx`, `components/ui/defer-on-navigate.tsx` |
| NC-6 | No synchronous `offsetWidth` read for the FAB lane; the `ResizeObserver`'s initial report publishes it                                                                                                | `components/radial/RadialFeed.tsx`                                        |
| NC-7 | Back/forward detection from the router history, not `popstate` ordering                                                                                                                               | `components/ui/defer-on-navigate.tsx`, `app/routes/__root.tsx`            |

`trackPromise` writes the same `status`/`value`/`reason` fields React itself
writes when it instruments a thenable, client-side only (the server's promise is
serialized for streaming and left alone).

### Results

Same protocol, back to back on a quiet machine, `main` → this branch, medians of 5.
**paint** / **max frame** / **blocking**, all ms.

**4× CPU + 100ms RTT, tap**

| Switch                                  |         paint |    max frame |    blocking |
| --------------------------------------- | ------------: | -----------: | ----------: |
| `/communities → /`                      | 400 → **110** |     102 → 90 |     52 → 39 |
| `/explore → /`                          | 401 → **140** |    114 → 120 |     52 → 57 |
| `/communities → /` (back home in-visit) | 133 → **105** | 113 → **84** | 63 → **34** |
| `/communities → /explore`               | 170 → **103** | 143 → **81** | 91 → **27** |
| `/games → /explore`                     | 179 → **115** | 151 → **89** | 99 → **38** |
| `/communities → /games`                 |       86 → 86 |      71 → 69 |     20 → 18 |
| `/games → /communities`                 |       46 → 46 |      58 → 54 |       0 → 0 |

**4× CPU + 100ms RTT, hover**

| Switch                                  |         paint |    max frame |    blocking |
| --------------------------------------- | ------------: | -----------: | ----------: |
| `/communities → /`                      | 368 → **107** |      80 → 88 |     30 → 37 |
| `/explore → /`                          | 396 → **137** |    113 → 118 |     49 → 55 |
| `/communities → /` (back home in-visit) |  126 → **93** | 109 → **75** | 58 → **25** |
| `/communities → /explore`               | 163 → **100** | 139 → **74** | 86 → **23** |
| `/games → /explore`                     | 178 → **111** | 152 → **85** | 99 → **33** |
| `/communities → /games`                 |       81 → 81 |      66 → 67 |     15 → 15 |
| `/games → /communities`                 |       82 → 79 |      65 → 64 |     15 → 14 |

**1× CPU, no added latency (a desktop), tap** — no frame over 50ms on either
build; the difference is all paint: `→ /` 339 → **31**, `/explore → /` 349 →
**36**, `→ /explore` 42 → **23**, `/games → /explore` 42 → **25**.

Reading them:

- **`→ /` paint roughly ⅓ of what it was at every throttle** — the 300ms
  skeleton hold is gone. It shows in "tap" too, because the shell's viewport
  prefetcher (NAV-3) has already preloaded the on-screen rail links by the time
  the reader clicks; on `main` that preloaded feed still suspended. Its max
  frame is flat (the commit now carries four cards instead of a skeleton, and
  there is no second commit 300ms later).
- **`→ /explore` longest frame −40–45%, blocking time −65–75%.** **complete**
  rises (e.g. 179 → 234ms) because the deferred block now lands in a
  transition after the paint — below the fold, which is the point.
- **Back home within a visit** gets both: no `<Await>` wait, and the remaining
  ~11 cards out of the click's commit.
- **`/games` teardown** is unchanged, as expected — nothing here targeted it
  (see _What was actually slow_).

Earlier, noisier rounds on the same builds (other work running on the box) put
`main`'s `→ /explore` longest frame at 200–250ms and this branch's at 120–145ms;
the ratios held.

### Checked

- **Scroll restoration** on back to a scrolled `/`, `/explore` and `/games`:
  exact (above). Never deferred on SSR/hydration (unchanged guard).
- **Deep links:** `/explore?tab=people` and `?tab=posts` render their sections
  immediately (`enabled` is false there); `/games?sub=` unchanged.
- **Infinite scroll** after a deferred switch home: 32 → 119 wheel slots over
  six scrolls to the bottom, same as before.
- **Autofocus** still lands in the `/explore` field on a pointer device, with
  `scrollY` 0, and no longer scrolls a restored back-navigation to the top.
- **In-visit return home:** no skeleton at any point.
- **Themes:** Daylight, Graphite (Midnight) and High contrast at 1440×900 after
  a shell switch (top and scrolled into the deferred part), and first load at
  390×844 — nothing missing, nothing reordered; at both widths the first screen
  is fully inside the non-deferred part (compose + 2–3 cards on `/`; trending +
  who-to-follow on `/explore`).
- **CLS:** 0 on `/explore` and `/games` switches. `→ /` shows a 0.011 shift that
  is pre-existing: the fixed compose FAB reports a shift from an empty rect
  ~350ms after arrival. On `main` it already appears whenever the feed renders
  without the skeleton first (the in-visit return); the fixes simply make that
  the common path. Well under the 0.1 "good" bar; not chased here.

### Not done

- **A CSS-only `LiquidTabs` thumb.** framer-motion's `layoutId` projection is the
  measurable part of leaving `/games` (and of mounting any tab strip): it
  measures layout on mount and unmount. Replacing it with a thumb that only
  measures on a user's tab change (FLIP via WAAPI) touches every tab strip on
  the site and the morph's feel, so it needs its own pass with a device check.
- **The first switch home in a visit** is still bound by the feed fetch on a tap
  (no preload): skeleton, then cards. Only a server-side change (or awaiting the
  page on client navigations) moves that.
- **The eversion capture** (`lib/eversion/capture.ts`, `modern-screenshot`) runs a
  ~220ms task (4×) ~2.2s after arriving on `/` at idle. Outside this item.

---

## Home LCP

Production Lighthouse (mobile) put `/` at **LCP 6.9s, 91% of it render delay**,
the LCP element being the first `.rmhark__content`. A MutationObserver on prod
showed why: the server-rendered feed was in the DOM at first paint, and ~1s
after `load` React deleted the whole `<!--$-->…<!--/$-->` boundary in
`.radial-feed__primary` (the `<Suspense>` around `<Await promise={initialFeed}>`),
inserted the skeleton, and ~40ms later a fresh wheel — which is what LCP fired
on.

### Method

A production build (`pnpm build:frontend`, Nitro on 127.0.0.1) against a
migrated embedded Postgres seeded with 40 users / 400 posts. Cold loads at
412×823 (DPR 2, touch), **4× CPU and Lighthouse's slow 4G** (150ms RTT,
1.6 Mbps down), cache disabled, with a MutationObserver on the feed boundary,
LCP/paint observers, and `self.__TSR_ROUTER__` polled for the router's matches
and the feed promise's state. Attribution came from initiator stacks on an
unminified build (CDP async stacks) and a breakpoint in React's
`throwOnHydrationMismatch` reading the fiber and the DOM node it expected.
Lighthouse 12, mobile preset, both simulated (default) and applied
(`--throttling-method=devtools`) throttling.

### What was happening — three causes, stacked

1. **`<Await>` suspended during hydration.** On first load the home loader
   never runs on the client: the router's copy of `initialFeed` is deserialized
   from the SSR stream, and nothing has tracked it, so `React.use` suspends on it
   even though it already holds the page. The boundary stays dehydrated, and the
   next update to reach it makes React abandon the server HTML and client-render
   it from the fallback — silently (no recoverable error is reported for that
   path, which is why `onRecoverableError` printed nothing on prod).
2. **Under that, a real mismatch — from the 10-21 navigation work.** With the
   promise tracked, hydration got further and failed with **#418**: the
   breakpoint showed the client rendering **4** wheel slots against **15**
   server-rendered ones. `useDeferOnNavigate` (NC-5) decided "is this
   hydration?" from a document flag the root sets after ITS hydration commit —
   but a dehydrated Suspense boundary hydrates in a separate, later pass, after
   that flag has flipped, so the feed deferred its cards mid-hydration. On prod
   cause 1 hid this one; fixing only cause 1 would have swapped a silent remount
   for an error-reported one.
3. **The first card was invisible at first paint anyway.** The card was in the
   DOM before FCP, but `.page-root > *` plays `page-enter` (opacity 0 → 1,
   `backwards` fill) on the document's first load too, so at FCP the feed was at
   opacity 0. An element painted at opacity 0 is not an LCP candidate; locally
   the cookie notice took LCP instead, and for a visitor without the notice LCP
   only ever fired on the remounted card.

Not the cause: the `/posts` route preloads seen right after `load`. They are the
viewport prefetcher (`lib/viewport-prefetch.ts`) firing on `load` while the
router is still in `hydrate()`; with no committed matches to reuse, each preload
re-ran the root loader (`getInitialUser`, `getInitialI18n`) over the network and
`hydrate` waited behind it. Disabling the prefetcher did not stop the remount,
but it did move router hydration from 8.8s to 6.6s — a real second-order cost.

### Fixes

|       | Change                                                                                                                                                                                                                                       | Where                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| LCP-1 | `trackPromise` reads seroval's synchronous settlement (`s` 1/2, `v`) on a deserialized promise, and `Home` tracks the hydrated `initialFeed` before `<Await>` reads it — hydration takes the streamed page in the same render, no suspension | `lib/route/tracked-promise.ts`, `app/routes/_site/index.tsx` |
| LCP-2 | `useDeferOnNavigate` never defers in a hydrating render, detected per component via `useSyncExternalStore`'s server snapshot (which React uses for every hydrating render, including a late Suspense pass)                                   | `components/ui/defer-on-navigate.tsx`                        |
| LCP-3 | `page-enter` held off until the first client navigation (`html[data-navigated]`, set from a history subscription; the page on screen is marked complete first so it never replays)                                                           | `app/globals.css`, `app/routes/__root.tsx`                   |
| LCP-4 | The viewport prefetcher starts from the root's post-hydration effect, not `getRouter()` (still gated on `load`)                                                                                                                              | `app/router.tsx`, `app/routes/__root.tsx`                    |

Why not await the feed on the server (the other candidate): it fixes cause 1
by construction but not causes 2 and 3, and it costs every cold-cache response
its streaming. With a warm timeline cache the streamed page is already in the
first flush (LCP = FCP below), so awaiting buys nothing there; with a cold one
(first request after a deploy: TTFB 650ms locally) the shell painted at 1.87s
and the feed swapped in at 2.46s — awaiting would have held the whole first
paint back to ~2.4s to save that swap. Tracking the promise keeps the stream and
costs nothing. The dependency is on seroval's `s`/`v` fields (seroval 1.6.8,
`PROMISE_SUCCESS`/`PROMISE_FAILURE`); if they ever change, `trackPromise` falls
back to the async path and the symptom is cause 1 again — no wrong data.

### Results

`main` → this branch. Cold load, 412px, 4× CPU, slow 4G, median of 5:

|                                            | TTFB |    FCP |         LCP | LCP element                  | Boundary remounted |
| ------------------------------------------ | ---: | -----: | ----------: | ---------------------------- | -----------------: |
| first visit (cookie notice shown), `main`  | 12ms | 1372ms |      1408ms | cookie notice (card hidden)  |                5/5 |
| first visit, branch                        | 20ms | 1400ms |  **1400ms** | **first `.rmhark__content`** |            **0/5** |
| returning visitor (consent stored), `main` | 15ms | 1368ms | **10836ms** | remounted card               |                5/5 |
| returning visitor, branch                  | 12ms | 1372ms |  **1372ms** | first `.rmhark__content`     |            **0/5** |

(One branch run per set was a cold server — empty timeline cache, TTFB
~650ms — where the feed streamed in after FCP via React's own boundary swap; it
is counted in the medians and is not a remount.) Router hydration finishes at
**6.6s instead of 8.8s** with the prefetcher moved, and the root loader is no
longer fetched again on the client.

Lighthouse 12 mobile against the local build, runs 2–3 (run 1 of each was the
cold server):

|                            | Score |      FCP |          LCP |       TBT |   CLS | LCP element        |
| -------------------------- | ----: | -------: | -----------: | --------: | ----: | ------------------ |
| simulated, `main`          | 72–74 | 2.3–2.5s |     6.2–7.0s |   47–50ms | 0.026 | cookie notice      |
| simulated, branch          |    74 |     2.3s | **5.4–5.5s** | 140–178ms | **0** | `.rmhark__content` |
| applied (devtools), `main` |    94 |    1.94s |        1.94s | 206–227ms |     0 | cookie notice      |
| applied (devtools), branch |    94 |    1.95s |        1.95s | 220–224ms |     0 | `.rmhark__content` |

Under applied throttling LCP equals FCP on both builds — on `main` only because
the cookie notice stands in for the hidden card. The simulated LCP that remains
(5.4s against an observed LCP equal to FCP) is Lantern chaining the paint behind
the stylesheet and module preloads still on the critical path after
§Critical CSS + preload priority — not this boundary. Simulated TBT rises because hydration now
actually hydrates fifteen cards in place where it used to bail out; under
applied throttling it is flat (206–227 → 220–224ms).

### Checked

- No `#418`, no boundary removal, with the prefetcher on and off.
- The 10-21 navigation behaviour is intact on the new build: back/forward
  restores exactly (`/` 2200→2200, `/explore` 1800→1800, `/games` 1800→1800),
  the in-visit return home shows no skeleton, infinite scroll loads (32 → 119),
  the `/explore` autofocus lands, and `DeferOnNavigate` still defers on a
  client switch.
- `page-enter`: `none` on the first load's page, plays on the next client
  navigation; nav-pop and reduced-motion suppression unchanged.

### Not done

- **`RelativeTime`'s pre-hydration fallback** uses `toLocaleDateString(undefined,
…)`, which reads the runtime's locale and time zone — the server's on SSR and
  the browser's while hydrating. For a visitor whose locale or zone differs from
  the server's (any non-`en-US` locale; a post near midnight) that text differs
  and is a hydration mismatch of its own. Not reproducible here (both `en-US`);
  it wants a fixed locale/zone, or the timestamp formatted on the server and
  carried in the data.
- What Lantern still charges to LCP from the critical path (see §Critical CSS
  - preload priority).

---

## Instant navigation

The ask: from a tap or click to the next page's content on screen, as close to
one frame as possible. Every lever below was measured on a built app before it
was kept; two were measured and dropped.

### Method

`pnpm build:frontend` of `main` (`1d5e604`) and of this branch, served side by
side on 127.0.0.1 against the embedded Postgres from §Home LCP (40 users, 400
posts), signed out, desktop viewport. `testing/e2e/page-switch.mjs` at 4× CPU,
medians of 3, three conditions per build:

- **tap** — `el.click()`, 100ms RTT.
- **press** — what a phone sends: `pointerdown`, the ~90ms a finger stays down,
  then the click. Timed from the finger going down.
- **press, cold, slow 4G** — a fresh browser context per sample (nothing
  cached), 150ms RTT, 1.6 Mbps.

The harness gained what this needed ([`testing.md`](testing.md) §6): the press
mode, a real cold mode, `~card` (tap a post card, which is a `div`, not a link),
byte and request accounting for the click and for the settled page view, and a
count of how often the router's pending skeleton or an in-page spinner showed.
It also had a measuring bug: the outgoing page's `main h1` is still mounted when
the URL flips, so every h1 destination "painted" a frame after the click. Only
a marker element that did not exist before the click counts now; the baseline
below was re-measured with the fix.

### Where the time was

| Switch (tap, 4×, 100ms RTT) | paint | what it waited on |
| --- | ---: | --- |
| nav-rail switches (`/`, `/explore`, `/games`, `/library`, …) | 115–250ms | the incoming page's render (`max frame` ≈ paint) — CPU, not network |
| profile → a post | 327ms | spinner on 3/3 |
| explore → a post | 579ms | router skeleton on 3/3, spinner on 3/3 |

Rail links are already warm by the time anyone clicks them (intent preload on
hover, the viewport prefetcher, `touchstart` on `<Link>`), so what is left
there is render cost. Posts were the outlier, for two reasons stacked:

1. **A request waterfall.** `PostDetail` fetches the post body and its comments
   from a mount effect. Opened from anywhere but the home feed (whose store
   seeds it), that is the route's loader and chunk, THEN — after a spinner frame
   — `/api/rmharks/:id` and `/comment`. Post cards are `div`s, so they also get
   no `<Link>` preload on touch.
2. **The pending skeleton's timings.** `defaultPendingMs: 180` is one round
   trip on a phone. A loader that took ~200ms put the skeleton up at 180ms and
   `defaultPendingMinMs: 220` held it to ~400ms — a page that was ready at
   200ms appeared at 400.

### Kept

| | Change | Where |
| --- | --- | --- |
| NAV-I1 | The post body and comments start as the open begins — the route's `beforeLoad` (every navigation; not a preload) and a press on the card body — and `PostDetail` takes them, rendering an already-answered post in its first commit. | `lib/route/intent-fetch.ts`, `lib/feed/post-detail-prefetch.ts`, `app/routes/_site/u/$userid/post/$postid.tsx`, `components/feed/PostDetail.tsx`, `components/feed/RMHarkCard.tsx` |
| NAV-I2 | Same for a profile's first page of posts, from its `beforeLoad`. | `lib/feed/profile-prefetch.ts`, `app/routes/_site/u/$userid/index.tsx`, `components/feed/ProfileColumn.tsx` |
| NAV-I3 | `defaultPendingMs` 180 → 400, `defaultPendingMinMs` 220 → 200. Under 400ms the click is already acknowledged (press state, `NavigationProgress` from 90ms), so the old page stays and the new one replaces it directly. | `app/router.tsx` |

The responses NAV-I1/2 hold are per-viewer (a post's liked state and
visibility), so `intent-fetch` is built around never showing a stale one: in
memory, per tab; **taken once**; started only when the open is already
happening — never on hover, focus or a speculative preload, because a like can
land between a hover and the open but not between a press and its click; and
once answered, usable for 1s only — long enough for the page that started it
to mount, too short to survive a long-press reaction and then an open. In
flight it stays usable (up to 15s), which is when it helps most.
`lib/__tests__/intent-fetch.test.ts` holds those rules.

### Results

`main` → this branch, paint in ms (skeleton / spinner seen, of 3):

| Switch | tap | press | press, cold, slow 4G |
| --- | ---: | ---: | ---: |
| profile → a post | 327 (1/3) → **248** (0/0) | 675 (2/3) → **275** (0/0) | 763 (3/3) → **315** (0/0) |
| explore → a post | 579 (3/3) → **285** (0/0) | 687 (3/3) → **313** (0/0) | 772 (3/3) → **360** (0/0) |
| `/games` → `/store` | 249 → 241 | 273 → 268 | 659 (3/3 skeleton) → **530** (0) |
| post → profile, first post card on screen | 403 → **329** | — | 610 → **478** |
| the nav-rail switches | 115–217 → 110–215 | 226–335 → 226–321 | 246–363 → 246–361 |

No skeleton and no post spinner in any sample on the branch. Data requests per
post open are unchanged (8 → 8): the head start replaces the page's own
requests, it never adds one. A page view fetches nothing new (requests after
`load`: 11–48 per page, identical on both builds) — none of this speculates.
Post → profile's header lands one longer frame later on a tap (290 → 338ms)
because the post list now arrives in the same frame instead of a round trip
after it; the list itself is on screen 74–132ms sooner.

### Measured and dropped

- **Code-only warm-up of the nav rail's route chunks at idle** (one
  `router.loadRouteChunk` per idle slot, after `load` + 3s, behind
  `shouldSpeculate`). Cost: 48 chunks, 54.5 KB brotli (185 KB raw), 48 requests
  on a cold-cache page load. Benefit: none measurable. On a fast link the chunk
  is one quick round trip and the switch is render-bound (`/games` → `/store`
  241 vs 234ms); on a slow one `shouldSpeculate` correctly turns it off (at
  300ms RTT it never ran). Removed.
- **Starting the post fetches on hover/focus too.** It would buy desktop the
  hover-to-click gap, but a hover can be followed by a like and then the open
  within a second, and the page would show the pre-like state. Desktop opens
  are already ~250ms; not worth a stale like.
- **View Transitions.** The post open already runs one (`runLiquidOpen`) and
  nothing measured here pointed at it; adding more would add a capture frame
  to every switch.

### Not done

- **Rail switches are render-bound** (`max frame` 100–230ms at 4×). That is the
  incoming page's commit — §Navigation commit's territory, not the router's.
- **`/store`'s loader returns 45 KB** (one server function) on every open; a
  smaller payload, or a `staleTime` on that route, is the next lever there.
- **A post opened from a `<Link>`** (a notification, search) still gets only
  the loader on hover; its body starts at `beforeLoad`. Fine on desktop, where
  that link is usually already warm.
- **Back to a profile refetches its posts** (take-once, by design). Keeping the
  last list for an instant back navigation needs a revalidation story for the
  per-viewer fields first.
- **The post page is still client-rendered on a cold URL load** (SSR shows the
  spinner; the body is not in the loader). That is first load, not navigation,
  but it is a large LCP cost on every shared post link.

Evidence (runs, JSON, request logs): `/tmp/ui-review/nav/` on the measuring
machine.
