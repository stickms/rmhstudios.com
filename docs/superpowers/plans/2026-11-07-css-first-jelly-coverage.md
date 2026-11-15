# CSS-first Plasmatic Jelly: UI coverage inventory

Task
0,
Step
5
of
[`2026-11-07-css-first-jelly.md`](./2026-11-07-css-first-jelly.md).
Read-only
audit
of
`main`
at
`e2f2b2d3`.
Intent:
[`../specs/2026-11-07-css-first-jelly-design.md`](../specs/2026-11-07-css-first-jelly-design.md).

This
is
the
checklist
later
tasks
and
the
T6
browser
sweep
are
held
to.
After
PR
1
these
are
no
longer
installed
or
drawn:
the
glass
engine
(rim
`canvas[data-liquid-glass]`,
haze
`.jelly-haze-canvas`),
CSS
flow
carriers
(`.jelly-flow`),
soft-body
physics,
the
registry,
ambient
arcs.
What
stays:
the
CSS
tier
(`app/liquid-glass.css`,
`app/jelly-material.css`,
`app/jelly-coverage.css`),
a
snapshot-only
scene
feed
for
the
globe,
and
the
click
arc.

## How this was built

- Routes:
  `ls app/routes`,
  `ls app/routes/_site`
  and
  each
  route
  directory
  (106
  entries
  under
  `_site/`,
  107
  at
  the
  top
  level).
  Games
  and
  apps:
  `lib/catalog/games/*.ts`
  (20
  games)
  and
  `lib/catalog/apps/*.ts`
  (14
  apps),
  the
  sources
  behind
  `lib/games.ts`
  and
  `lib/apps.ts`
  (CLAUDE.md
  says
  18
  games
  and
  12
  apps;
  the
  catalog
  files
  say
  20
  and
  14,
  so
  this
  file
  uses
  the
  catalog).
- Engine
  references:
  `grep`
  over
  `*.css`,
  `*.ts`,
  `*.tsx`
  in
  `app/ components/ hooks/ stores/ lib/`,
  excluding
  `lib/jelly`,
  `lib/liquid`,
  `node_modules`
  and
  generated
  files
  (section
  2).
- Cell
  values
  come
  from
  reading
  the
  files
  named
  in
  them.
  A
  cell
  that
  says
  "unknown
  —
  needs
  a
  look"
  was
  not
  determined.
  Per-game
  "role-class
  files
  /
  ui-primitive
  files"
  counts
  are
  rough
  `grep -l`
  counts
  over
  `components/<dir>`,
  enough
  to
  say
  which
  scheme
  a
  game
  leans
  on,
  not
  an
  exact
  census.

**Verification
codes**
(column
5):
`Sweep`
=
the
T6
matrix
script
(`scripts/audit-ui-matrix.mjs`:
route
×
theme
×
width
×
`jellyMotion`,
asserts
no
`canvas[data-liquid-glass]`,
`.jelly-haze-canvas`,
`.jelly-flow`,
no
rAF
at
rest,
screenshot)
·
`Pages`
=
`pnpm audit:pages`
(iOS
edge-pinned
layers,
page
anatomy)
·
`Clip`
=
`pnpm audit:jelly-clip`
·
`Shot`
=
screenshot
in
`light`
and
`graphite`
by
hand
·
`Gate:<name>`
=
the
named
vitest
gate
in
`lib/__tests__/`.

**Task
codes**
(column
4):
T1
scene
feed
replaces
the
engine
·
T2
woken
haze
·
T3
CSS
springs
and
pointer
variable
·
T4
click-only
lazy
arcs
·
T5
delete
dead
code
and
rewrite
rules
·
T6
coverage
sweep.

**Reading
the
engine
column.**
`(a)`
=
harmless
once
the
attribute
or
element
is
never
set.
`(b)`
=
defect,
the
style
or
code
only
works
while
the
engine
runs.
`(c)`
=
unclear,
needs
a
look.
"Fwd"
=
not
broken
today,
but
the
new
CSS
mechanism
for
that
task
will
not
reach
this
area
unless
the
owning
task
handles
it
(section
3
lists
these).

Shell-wide
facts
that
apply
to
almost
every
row:

- `hooks/useLiquidInteractions.ts`
  (mounted
  by
  `components/Providers.tsx:366`,
  skipped
  when
  `isNativeMaterialRoute(pathname)`)
  installs:
  `installLiquidInteractions`
  (line
  48,
  `lib/liquid/runtime.ts`,
  injects
  a
  `.liquid-light`
  span
  and
  drives
  a
  frame
  on
  pointer
  move),
  registry
  (50),
  physics
  (54),
  carriers
  (75),
  arcs
  (83),
  engine
  (89).
  It
  also
  stamps
  `html[data-jelly-ready]`
  (64)
  which
  `app/jelly-material.css:533-538`
  reads
  for
  the
  entrance
  fade.
- Roles
  reach
  a
  surface
  through
  classes
  (`glass-fill`
  391
  files,
  `glass-pane`
  149,
  `glass-chrome`
  28,
  `glass-overlay`
  52,
  `glass-inset`
  131,
  `glass-interactive`
  53,
  `app-glass`
  45,
  `data-liquid-surface`
  1;
  `LiquidTabs`
  87,
  `JellyGroup`
  9).
  The
  static
  CSS
  tier
  (`app/liquid-glass.css`,
  `app/jelly-material.css`
  §2
  and
  §4,
  `app/jelly-coverage.css`)
  already
  paints
  floor +
  rim +
  coat
  on
  every
  host
  where
  `[data-liquid-canvas='on']`
  is
  absent,
  which
  is
  the
  baseline
  after
  T1.
- Two
  stylesheet
  tiers
  (`lib/style-tier.ts`):
  `_site/`
  pages
  load
  `app/site-tier.css`,
  every
  other
  top-level
  route
  loads
  `app/app-tier.css`
  (superset)
  unless
  in
  `SITE_SHEET_ROUTES`.
  Both
  import
  `globals.css`,
  which
  imports
  the
  jelly
  sheets.
- Native-material
  opt-out
  is
  **JavaScript
  only**
  (`lib/native-material-routes.ts`:
  `/tf2`,
  `/tf2/*`,
  `/games`,
  `/games/*`
  skip
  `useLiquidInteractions`).
  The
  CSS
  tier
  still
  loads
  on
  those
  routes;
  they
  neutralise
  it
  with
  route-local
  CSS
  (see
  rows
  N-01,
  N-02).
  A
  CSS-only
  haze
  or
  press
  layer
  from
  T2/T3
  reaches
  them
  unless
  that
  CSS
  is
  scoped.

---

## 1. Coverage table

Columns:
Area
|
How
the
material
reaches
it
today
|
Engine-owned
dependencies
found
|
Task
|
Verified
by
|
Verified.

### 1.1 Site tier: `_site/` pages (radial shell, `PageLayout`)

| Area                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Material today                                                                                                                      | Engine-owned dependencies                                                                                                                                                                                                                                            | Task                     | How verified                                                                       | Verified |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------- | -------- |
| P-01 Feed and social: `index` (feed), `explore`, `search`, `notifications`, `bookmarks`, `drafts`, `history`, `trash`, `saves/`, `lists/`, `thread/`, `v/`, `moments.$id`, `tag.$tag`, `share`, `out`, `feeds.index/$id`, `connections.index/new/u.$id`, `messages/`, `personas/`, `profile/`, `u/`, `groups/`, `communities`, `c.$slug` (+ `_.invite.$code`), `spaces.index/$id`, `events`, `schedule`, `translate`, `canvas`, `qotd`, `quotes`, `photo-of-the-day`, `playlists`, `today`, `recap`, `wrapped` | Role classes via `PageLayout`, `components/feed/*`, post cards (`.glass-fill`), composer fields (`.glass-inset`), `ui/*` primitives | `app/jelly-material.css:196,392-424` (a); `app/liquid-glass.css:195-227` (a); `components/radial/RadialFeed.tsx` uses `data-evert` only                                                                                                                              | T1, T2, T3, T6           | Sweep, Shot (feed in both themes), Clip (overflow containers), Gate:jelly-coverage |          |
| P-02 Content: `blog/`, `news/`, `library/`, `reading/`, `series.index/$id`, `changelog`, `roadmap`, `help`, `museum`, `advent`, `hunt`, `alexdebtcounter`, `analytics`, `safety/`, `when/`, `office-hours/`, `rings/`                                                                                                                                                                                                                                                                                          | Role classes through `PageLayout`; article bodies mostly plain                                                                      | none beyond P-01                                                                                                                                                                                                                                                     | T6                       | Sweep                                                                              |          |
| P-03 Economy and commerce: `wallet`, `shop`, `store/`, `market`, `pricing`, `exchange.index/$id`, `wager.index/$id`, `predictions`, `tournaments.index/$id`, `ventures`, `marathon.index/$shareId`, `wishlist`, `emoji-packs`, `creator-studio`, `create/`, `studio/` (site), `user-builds/`, `builds/`, `apps/`, `services` (+ `services/`), `jams.index/$slug`                                                                                                                                               | Role classes; `components/creator-studio/storefront.css` own card styles                                                            | `components/creator-studio/storefront.css:654` `.store-spot__link[data-liquid-canvas='on']` (a); `components/membership/MembershipPanel.tsx:266` `glass-refract glass-liquid` (alias classes, no engine dependency: `app/liquid-glass.css:113` sets `content: none`) | T1, T6                   | Sweep, Shot (pricing featured card)                                                |          |
| P-04 Gaming inside the site: `arcade`, `achievements`, `leaderboard`, `ranked`, `speedruns`, `progress`, `game-night`, `daily-mutator`, `music-trivia`, `rmhbox-packs`, `rmhladder` (+ 11 files in `rmhladder/`), `rmh-datacenter/` (6), `homes/` (7), `rideshare/` (3), `study/` (3)                                                                                                                                                                                                                          | Role classes; `components/rmhladder`, `components/homes` use many role files (11 each)                                              | none found                                                                                                                                                                                                                                                           | T6                       | Sweep                                                                              |          |
| P-05 Settings (12 files) incl. `settings/appearance.tsx` (jellyMotion, electricArcs, globe cursor pickers)                                                                                                                                                                                                                                                                                                                                                                                                     | Role classes + `LiquidTabs` + `Switch`; appearance page renders each theme's tokens in a scoped preview card                        | `app/routes/_site/settings/appearance.tsx` sets the preferences that stamp `html[data-jelly-motion]` / `html[data-electric-arcs]` (`lib/appearance/prefs.ts:173-191`)                                                                                                | T6 (axes rows X-08/X-09) | Sweep (appearance page), Shot                                                      |          |
| P-06 Admin (40 files under `admin/`), `developer/` (3)                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Role classes, tables, forms                                                                                                         | none found                                                                                                                                                                                                                                                           | T6                       | Sweep (sample: admin index, one table page)                                        |          |
| P-07 Not-found and error shells (`_site.tsx` `notFoundComponent`, root 404, `errors/*`)                                                                                                                                                                                                                                                                                                                                                                                                                        | Role classes                                                                                                                        | none found                                                                                                                                                                                                                                                           | T6                       | Sweep (force a 404)                                                                |          |

### 1.2 Top-level pages that are not games or apps

| Area                                                                                                                                                                                                                                                                                                                            | Material today                                                                                                                  | Engine-owned dependencies                                                                                                                    | Task   | How verified                                        | Verified |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------- | -------- |
| T-01 `login` (site-sheet route)                                                                                                                                                                                                                                                                                                 | `glass-pane glass-liquid glass-refract` (`login.tsx:433`), `ui/button`, `ui/input`                                              | none                                                                                                                                         | T6     | Sweep                                               |          |
| T-02 `offline` (site-sheet route)                                                                                                                                                                                                                                                                                               | `glass-inset`, `glass-pane`                                                                                                     | none                                                                                                                                         | T6     | Sweep                                               |          |
| T-03 Legal and trust: `privacy`, `terms`, `cookies`, `copyright`, `security`                                                                                                                                                                                                                                                    | `components/lockdown/LegalLayout`, `access/LegalSummaryBox`, `security/SecurityPage`: unknown — needs a look which role classes | unknown — needs a look                                                                                                                       | T6     | Sweep, print emulation (X-07)                       |          |
| T-04 Org and marketing: `rmh-capital/` (6: index, firm, businesses, insights, careers, contact), `rmh-pmc/` (6: index, capabilities, command, intelligence, operators, contact), `adaptive-intelligence`, `optimization`, `breaches`, `covid`, `black-lives-matter`, `services.rebar-rutabaga`                                  | Own per-page CSS (`components/rmh-capital/*.css`, `rmh-pmc/*.css`) plus `ui/*`; no role-class files in the first two            | none found                                                                                                                                   | T6     | Sweep                                               |          |
| T-05 Parody and trackers: `kaikaidebtcounter`, `sohumbum.tsx`, `sohumbum2/` (index, `$date`), `sohumtracker/` (index, `$date`, `month.$month`, `week.$week`), `pf2ecal`, `rmhcalculator`                                                                                                                                        | Own components; unknown — needs a look which use role classes                                                                   | unknown — needs a look                                                                                                                       | T6     | Sweep                                               |          |
| T-06 Shared and embedded views: `embed.post.$id`, `embed.replay.$id`, `replays.$id` (`GameReplayPlayer`, `data-jelly-zone="playfield"` at `components/replays/GameReplayPlayer.tsx:234`), `library.$slug`, `library.albums.$albumId`, `news.$slug`, `v.$slug`, `v.new`, `ref.$code`, `controller.$code` (`party/ControllerPad`) | Site-sheet routes except `replays`, `controller`; role classes in `PageLayout`-less shells: unknown — needs a look              | none found                                                                                                                                   | T6     | Sweep (one of each kind)                            |          |
| T-07 Discord Activity: `discord/` (index, `lights-out`, `rmhbox`)                                                                                                                                                                                                                                                               | Minimal head (`__root.tsx`), game UI inside                                                                                     | none found; whether the Discord CSP blocks anything the new CSS needs (e.g. `@starting-style`, `animation-timeline`): unknown — needs a look | T2, T6 | Sweep (if Discord shell can be emulated), else note |          |
| T-08 Non-UI routes (`*.xml.ts`, `ads[.]txt.ts`, `.well-known*`, `handle.ts`, `deeplink*.ts`, `rmh-internal-affairs*.ts`, `sitemap*`, `api/`)                                                                                                                                                                                    | n/a, no markup                                                                                                                  | n/a                                                                                                                                          | none   | n/a (exempt)                                        |          |

### 1.3 Radial shell (`components/radial/*`, `components/feed/SiteShell`)

| Area                                                                                                                                                                                                                    | Material today                                                                                                | Engine-owned dependencies                                                                                                                                                                                                                                                                                   | Task                               | How verified                                                                                               | Verified |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| R-01 Top bar `.radial-topbar.glass-chrome` (`RadialShell.tsx:209`) with `JellyGroup` items (`[data-slot='jelly-group-item']` rules `radial.css:405,443,461,3879`); full-bleed square bar below 640px (`radial.css:351`) | `glass-chrome` role; `data-jelly-press-through` (`RadialShell.tsx:209`)                                       | `components/radial/radial.css:4009-4010` `.radial-topbar__signin[data-liquid-canvas='on']`, `.radial-topbar__search[...]` (a); `data-jelly-press-through` read only by `lib/jelly/physics.ts:656-659` (c: pressing an inner button must not press the whole bar once CSS `:active` replaces physics)        | T1, T3, T6                         | Sweep (phone + desktop), Pages (iOS edge), Shot                                                            |          |
| R-02 Hub and orb (`RadialHub.tsx`, `.radial-hub__orb`, `RadialWheel`, `WheelCard`)                                                                                                                                      | `WheelCard.tsx` `glass-fill` + `data-evert`; orb is its own CSS                                               | none found                                                                                                                                                                                                                                                                                                  | T6                                 | Sweep (open the hub), Pages                                                                                |          |
| R-03 Veil (`.radial-hub__veil`, `radial.css:1488-1662`) and the iOS root-canvas tint                                                                                                                                    | Own CSS; `html.ios-webkit:has(.radial-hub[data-phase='open'])`                                                | none found; `perf-lite` and `ios-webkit` hide it (`radial.css:1661`)                                                                                                                                                                                                                                        | T6                                 | Gate:ios-edge-contract, Pages                                                                              |          |
| R-04 Globe (`LiquidGlobe.tsx`, `jelly-glass.ts`, `RadialWheel` stage)                                                                                                                                                   | Own WebGL shader; refracts page via `lib/liquid/glass/scene-store` snapshot                                   | Imports kept modules (`scene-store`, `color`, `policy`, `jelly-glsl`, `optics`, `globe-material`, `governor.governedDprCap`, `ambient-tick`, `tiers`). Reads the snapshot the engine publishes, so T1's scene feed must publish it. `radial.css:1999-2001` notes the globe is deliberately NOT `data-jelly` | T1 (scene feed), T6                | Gate:scene-feed test; Sweep (globe docked + hub open); Shot both themes (snapshot refresh on theme switch) |          |
| R-05 Globe dock (`RadialGlobeDock.tsx`, `.rad-globe-dock__shimmer`)                                                                                                                                                     | Own CSS; hover-only shimmer (`radial.css:931-945`)                                                            | Comment at `radial.css:894-895` says the globe's drift is "on the jelly ambient clock" (kept `ambient-tick.ts`) (a)                                                                                                                                                                                         | T6                                 | Sweep (`still`), Shot                                                                                      |          |
| R-06 Nav rail (`RadialNavRail.tsx`, desktop)                                                                                                                                                                            | `data-evert`, `data-liquid-material="off"` on the rail (lines 92, 104) so no material on the rail itself      | none found                                                                                                                                                                                                                                                                                                  | T6                                 | Sweep (desktop 1440)                                                                                       |          |
| R-07 Live rail, side feed, quick panels (`RadialLiveRail*`, `RadialSideFeed`, `QuickPanel`, `TopBarPanels`, `rail-slot`)                                                                                                | `QuickPanel` `glass-overlay` (line 163); `RadialLiveRailContent` `glass-fill` ×2                              | none found                                                                                                                                                                                                                                                                                                  | T6                                 | Sweep                                                                                                      |          |
| R-08 Feed column in the shell (`RadialFeed.tsx`, `RmharkMedia`, `radial-feed__*`, `.rmhark__*`)                                                                                                                         | `data-evert` pill; `radial.css:2781` says the pill is a jelly body (`data-fluid-press`) with no CSS transform | physics-owned press on the pill (c: T3 must restore the cue in CSS)                                                                                                                                                                                                                                         | T3, T6                             | Sweep, Shot                                                                                                |          |
| R-09 Eversion overlay (`components/radial/eversion/*`, `lib/eversion/*`)                                                                                                                                                | Own GL capture; `[data-evert]` state layer in `app/globals.css:4642-4750` is an opacity layer, no engine      | `lib/eversion/gl/shaders.ts:76-77` imports `lib/liquid/optics` and `globe-material` (kept). `lib/evert-auto.ts:138` sets `data-liquid-glass="lit"` on the hover ghost; `app/liquid-glass.css:208` `.evert-ghost[data-kind='hover'][data-liquid-canvas='on']` (a)                                            | T6 (spec: out of scope for change) | Sweep (hover a field), `/eversion-lab`                                                                     |          |

### 1.4 Glass roles and shared primitives (`components/ui/*`, `components/site/*`)

| Area                                                                                                                                                         | Material today                                                                                                                                                                                                     | Engine-owned dependencies                                                                                                                                                                                                                                                                                                                  | Task                                | How verified                                                                                | Verified |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| U-01 `.glass-fill` (cards, rows; `ui/card.tsx:50`)                                                                                                           | Role class + `--jelly-floor` + rim                                                                                                                                                                                 | `app/jelly-material.css:196,207,392` (a); `app/liquid-glass.css:195` (a); entrance fade `jelly-material.css:533` needs `html[data-jelly-ready]` (kept by T1)                                                                                                                                                                               | T1, T2, T3                          | Gate:jelly-coverage, jelly-contract; Sweep; Shot                                            |          |
| U-02 `.glass-pane` (singular panels; `GlassPane`, `Card pane`)                                                                                               | Role class                                                                                                                                                                                                         | `components/ui/liquid-glass.tsx:22,40` `data-liquid-glass={refract ? 'refract' : undefined}` (a: inert, but the `refract` prop and `components/profile/ProfileHero.tsx:196` become no-ops, T5 cleanup)                                                                                                                                     | T1, T2, T5                          | Sweep (profile hero), Shot                                                                  |          |
| U-03 `.glass-chrome` (sticky chrome, 28 files)                                                                                                               | Role class                                                                                                                                                                                                         | `app/jelly-material.css:392,414` (a)                                                                                                                                                                                                                                                                                                       | T1, T2                              | Sweep, Pages                                                                                |          |
| U-04 `.glass-overlay` (floating UI, 52 files) and `.glass-scrim`                                                                                             | Role class                                                                                                                                                                                                         | `app/globals.css:6266-6309` degrade lists (a)                                                                                                                                                                                                                                                                                              | T1, T2                              | Sweep (open menu, dialog, sheet)                                                            |          |
| U-05 `.glass-inset` (fields, tab tracks)                                                                                                                     | Role class + well shade                                                                                                                                                                                            | `app/jelly-material.css:213,424` (a); `app/liquid-glass.css:217` (a)                                                                                                                                                                                                                                                                       | T1, T2                              | Sweep (login, settings)                                                                     |          |
| U-06 `.glass-interactive` (53 files) and `data-slot` hosts                                                                                                   | `app/jelly-coverage.css:140-148`                                                                                                                                                                                   | `app/jelly-material.css:363` `:hover > .jelly-flow` (a)                                                                                                                                                                                                                                                                                    | T2, T3                              | Sweep                                                                                       |          |
| U-07 `Button` (`ui/button.tsx`; variants default/outline/secondary/ghost/link/accent are "flat until touched", `signal` and semantic fills are always slabs) | `app/liquid-glass.css:122-129` coat; `app/jelly-material.css:385-408` rim; `data-jelly-rest="flat"` (`button.tsx:107`)                                                                                             | `data-jelly-rest='flat'` is read only by the engine (`lib/liquid/glass/engine.ts:321,757`) and by the `perf-lite`/print affordance at `app/liquid-glass.css:311-318` (c: after T1 flat buttons permanently wear the static coat + rim except `ghost`/`link`; `button.tsx:16` comment about the slab "drawn only while touched" goes stale) | T1 (look), T3 (press), T5 (comment) | Shot (each variant, both themes), Sweep                                                     |          |
| U-08 `IconButton`, `Skeleton`                                                                                                                                | `data-jelly-flow="off"` at `ui/icon-button.tsx:48` and `ui/skeleton.tsx:28` (tells the carrier service to skip them)                                                                                               | (a) today; Fwd: T2's CSS haze layer must honour the same opt-out                                                                                                                                                                                                                                                                           | T2                                  | Gate:jelly-coverage (`jelly-coverage.test.ts:348` pins the attribute); Sweep                |          |
| U-09 Fields: `Input`, `Textarea`, `Select` trigger, `SearchField`, `Slider`, `Switch`                                                                        | `glass-inset` (`input.tsx:14`, `textarea.tsx:35`, `select.tsx:184`); `Switch` `data-jelly="control"` (`switch.tsx:27`); `Slider` `data-jelly="drag"` (`slider.tsx:57`)                                             | `app/jelly-coverage.css:156` `[data-jelly-flow='on']` (a); drag wobble comes from physics (`hooks/useFluidDrag`, T3)                                                                                                                                                                                                                       | T2, T3                              | Sweep, Shot (focus ring over haze)                                                          |          |
| U-10 `LiquidTabs` (87 files; track `.glass-inset`, thumb `[data-tab-thumb]`)                                                                                 | `app/jelly-coverage.css:332-344` thumb coat; `data-jelly-scope="off"` when `glow` (`liquid-tabs.tsx:495`); `layoutId` capsule merge uses `#glass-goo`                                                              | `liquid-tabs.tsx:442,476` `data-evert` (a)                                                                                                                                                                                                                                                                                                 | T3, T6                              | Sweep (tab switch), Gate:design-consistency                                                 |          |
| U-11 `JellyGroup` (`ui/jelly-group.tsx`, 9 files)                                                                                                            | `data-liquid-material="off"` on the parent (`jelly-group.tsx:79`), `data-jelly-press-through` (`:45`), flat members, glow on `data-evert` layer                                                                    | `data-jelly-press-through` read only by `lib/jelly/physics.ts:656-659` (c, same as R-01)                                                                                                                                                                                                                                                   | T3                                  | Sweep (top bar), Gate:jelly-group test                                                      |          |
| U-12 Dropdowns and menus (`ui/menu.tsx`, `ui/anchored-menu.tsx/.css`, `select.tsx` content)                                                                  | `glass-overlay`; rows plain with `data-evert` and `data-jelly="off"` (`menu.tsx:166-168`, `select.tsx:279-281`)                                                                                                    | none found                                                                                                                                                                                                                                                                                                                                 | T2, T6                              | Sweep (open a menu), Shot                                                                   |          |
| U-13 Popovers (`ui/overlay-panel.tsx`, `site/NotificationsPopover`, `site/FriendsSheet`)                                                                     | `glass-overlay`: unknown — needs a look for each                                                                                                                                                                   | none found                                                                                                                                                                                                                                                                                                                                 | T6                                  | Sweep                                                                                       |          |
| U-14 Dialogs (`ui/dialog.tsx/.css`, `confirm-dialog`, `site/LanguageFirstRunModal`)                                                                          | `glass-overlay` content, `glass-scrim`; some game dialogs opt out with `data-jelly="off" data-liquid-material="off"` (`cursed-logic/ShopModal.tsx:33`, `HowToPlayModal.tsx:19`, `gabriels-horn/RulesSheet.tsx:66`) | `dialog.tsx:135` `jellyTarget` passes the sheet to `useFluidDrag`, which imports `lib/jelly/physics` (`hooks/useFluidDrag.ts:13`) (c: T3 needs a `drag-report` shim)                                                                                                                                                                       | T3                                  | Sweep (open dialog), Shot                                                                   |          |
| U-15 Sheets (`ui/sheet.tsx/.css`, `site/FriendsSheet`, `liquid-tabs` sheet variant)                                                                          | `glass-overlay`, same `useFluidDrag` dismiss                                                                                                                                                                       | same as U-14                                                                                                                                                                                                                                                                                                                               | T3                                  | Sweep                                                                                       |          |
| U-16 Tooltips (`ui/Tooltip.tsx`)                                                                                                                             | `glass-overlay shadow-site rounded-site-sm`; tail painted with `--site-glass-overlay-fill`                                                                                                                         | none found                                                                                                                                                                                                                                                                                                                                 | T2                                  | Sweep (hover a tooltip)                                                                     |          |
| U-17 Toasts: sonner `<Toaster>` in `Providers.tsx`; `components/shared/AppToaster.tsx` (app tier, `data-jelly-arcs="off"` at line 65)                        | `app/jelly-coverage.css:324` `[data-sonner-toast]`                                                                                                                                                                 | `jelly-coverage.css:324` `[data-sonner-toast][data-jelly-flow='on']` (a)                                                                                                                                                                                                                                                                   | T2                                  | Sweep (trigger a toast)                                                                     |          |
| U-18 Command palette (`components/site/CommandPalette.tsx`, `CommandPaletteMount`)                                                                           | `glass-scrim` (line 543), `glass-overlay` (555), rows `glass-interactive` (627)                                                                                                                                    | none found                                                                                                                                                                                                                                                                                                                                 | T2, T3                              | Sweep (open with the shortcut)                                                              |          |
| U-19 `Card`, `Badge`, `EmptyState`, `Pagination`, `Breadcrumbs`, other `ui/*`                                                                                | Role classes or plain tokens                                                                                                                                                                                       | none found                                                                                                                                                                                                                                                                                                                                 | T6                                  | Sweep                                                                                       |          |
| U-20 `ui/liquid-morph.tsx` (tab capsule/droplet metaball) and `GlassFilter` host (`ui/liquid-glass.tsx:7`, mounted `app/routes/__root.tsx:711`)              | SVG `#glass-goo` filter used only by the tab capsule (`app/globals.css:1885-1898`); `liquid-morph` runs its own settle-limited rAF (`raf-loop-allowlist.test.ts:32,346`)                                           | imports `lib/liquid/droplet` (not engine). No engine attribute. `filter-cost-budget` documents it as an allowed `url()` filter                                                                                                                                                                                                             | none (spec out of scope)            | Gate:filter-cost-budget, raf-loop-allowlist; Sweep (tab switch, assert no rAF after settle) |          |
| U-21 `ui/selection-bar`, `ui/swipe-row`, `ui/sortable-list`, `ui/schedule-control`, `ui/widget-frame`, `ui/horizontal-scroller`                              | `selection-bar.tsx:79` `data-jelly-press-through`                                                                                                                                                                  | same (c) as R-01                                                                                                                                                                                                                                                                                                                           | T3                                  | Sweep                                                                                       |          |

### 1.5 App tier (`--app-*`, `components/shared/app-theme.css`)

| Area                                                                                             | Material today                                                                                                                                             | Engine-owned dependencies                                                                                                                 | Task   | How verified                                         | Verified |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------- | -------- |
| A-01 `.app-glass` (45 files)                                                                     | Role in the app palette; own static floor + coat + border (`app-theme.css:590-605`)                                                                        | `app-theme.css:607` `.app-glass:is([data-jelly-haze='on'], [data-jelly-flow='on'])` (a); `:612` `.app-glass[data-liquid-canvas='on']` (a) | T1, T2 | Sweep (RMHbox, RMHTube), Shot with `--app-*` palette |          |
| A-02 `[data-liquid-surface]` and `.app-theme [class~='bg-(--app-surface)']` cards                | `app-theme.css:639-680` (CARD role knobs, static rim)                                                                                                      | `app-theme.css:683-690` `[data-jelly-haze='on'], [data-jelly-flow='on']` (a); comment `:634-637` describes carriers (a)                   | T1, T2 | Sweep                                                |          |
| A-03 `--app-jelly-*` tokens (`app-theme.css:163,279,583-589,642-648,746`)                        | `--app-jelly-flow-speed`, `--jelly-flow-gain` feed only the carrier                                                                                        | (a) once carriers go; T2 must decide whether the new haze reads them                                                                      | T2     | Sweep, Gate:jelly-tokens                             |          |
| A-04 App high contrast (`.app-high-contrast`, stamped by `AppShell.tsx:31`)                      | Hides carriers and haze (`app/jelly-material.css:475`); `--app-jelly-on: 0` pattern (`components/tf2-hud/*.css:222-223`)                                   | (a)                                                                                                                                       | T2     | Sweep (app high-contrast setting)                    |          |
| A-05 RMHbox (`/rmhbox`, `/rmhbox/$lobbyId`, `/rmhbox/minigames/$minigameId`; `RMHboxShell`)      | `app-theme`, 44 files with role classes/`app-glass`/`data-liquid-surface` incl. minigames wit-war, wiki-race, undercover-agent, rhyme-time, category-crash | none beyond A-01/A-02                                                                                                                     | T6     | Sweep (lobby + one minigame)                         |          |
| A-06 RMHTube (`/rmhtube`, `/rmhtube/$roomId`; `RmhTubeShell`)                                    | `app-theme`, 14 files                                                                                                                                      | none beyond A-01/A-02                                                                                                                     | T6     | Sweep                                                |          |
| A-07 RMHMusic (`/rmhmusic`, `$roomId`, `player`)                                                 | `app/routes/rmhmusic.tsx` wraps in `app-theme`; 1 role file                                                                                                | none beyond A-01/A-02                                                                                                                     | T6     | Sweep                                                |          |
| A-08 RMHStudy (`/rmhstudy`, `$roomId`, `planner`; `RmhStudyShell`)                               | `app-theme`, 7 files                                                                                                                                       | none beyond A-01/A-02                                                                                                                     | T6     | Sweep                                                |          |
| A-09 RMHType (`/rmhtype`, `$roomId`, `multiplayer`, `solo`; `RmhTypeShell`)                      | `app-theme`, 6 files                                                                                                                                       | none beyond A-01/A-02                                                                                                                     | T6     | Sweep                                                |          |
| A-10 RMH Studio (`/studio`, `StudioAppShell`)                                                    | `app-theme`, 3 files; `studio.css` has `app-high-contrast` rules                                                                                           | none found                                                                                                                                | T6     | Sweep                                                |          |
| A-11 Gabriel's Horn (`/gabriels-horn`), CS (`/csgo`), Portal, Half-Life 2 (`sp-game/*`)          | Use `AppShell` (`GabrielsHornGame`, `CsPlayPage`, `SpPlayPage`)                                                                                            | none found; `gabriels-horn/RulesSheet.tsx:66` opts out (a)                                                                                | T6     | Sweep                                                |          |
| A-12 Standalone app menus `:is(.app-page, .app-screen)` buttons (`app/liquid-glass.css:135-138`) | Coat on buttons in full-screen menus without `AppShell`                                                                                                    | none                                                                                                                                      | T6     | Sweep (a game main menu)                             |          |

### 1.6 Games (20 in `lib/catalog/games`, plus uncatalogued top-level game routes)

For
each:
menu,
pause
and
HUD
chrome
are
in
scope;
play-fields
stay
excluded
(`data-jelly-zone="playfield"`).
"role/ui
files"
=
rough
count
of
files
in
`components/<dir>`
using
role
classes
/
using
`ui/`
primitives.

| Area                                                                                                                                                                                                                                         | Material today                                                                                                                                                                          | Engine-owned dependencies                                                                                                                                                                                                                       | Task       | How verified                                  | Verified |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------- | -------- |
| G-01 Altair (`/altair`, `/altair/multiplayer`)                                                                                                                                                                                               | Own scheme (`altair` css 1 file), 0 / 0 role/ui; HUD `data-jelly-zone="hud"` (`altair/hud/GameHUD.tsx:130`), `MobileDPad` `data-jelly-scope="off"`                                      | none found                                                                                                                                                                                                                                      | T6         | Sweep (menu + HUD)                            |          |
| G-02 CS: Global Offensive (`/csgo`)                                                                                                                                                                                                          | `CsPlayPage` inside `AppShell`; `components/csgo-game`                                                                                                                                  | none found                                                                                                                                                                                                                                      | T6         | Sweep                                         |          |
| G-03 Daily Puzzles (`/daily` index, `alibi`, `chainlink`, `globeset`, `impostor`, `lights-out`, `outcast`, `spectrum`; plus `/discord/lights-out`)                                                                                           | Role classes (15 files) + ui primitives (15); `DeskScene` and `GlobeSetGlobe` are `playfield`, `GlobeSetRoom` HUD                                                                       | `GlobeSetGlobe` is its own WebGL globe (see W-04)                                                                                                                                                                                               | T6         | Sweep (index + one puzzle)                    |          |
| G-04 Dream Rift (`/dream-rift`)                                                                                                                                                                                                              | Own scheme; `MobileControls` HUD + `data-jelly-scope="off"`                                                                                                                             | none found                                                                                                                                                                                                                                      | T6         | Sweep                                         |          |
| G-05 Gabriel's Horn (`/gabriels-horn`)                                                                                                                                                                                                       | `AppShell`; own CSS (2 files); `Dice` is `playfield`                                                                                                                                    | none found                                                                                                                                                                                                                                      | T6         | Sweep                                         |          |
| G-06 Half-Life 2 (`/half-life-2`), Portal (`/portal`)                                                                                                                                                                                        | `sp-game` pages in `AppShell`                                                                                                                                                           | none found                                                                                                                                                                                                                                      | T6         | Sweep                                         |          |
| G-07 Hearthworks (`/hearthworks`)                                                                                                                                                                                                            | Own scheme (`hw` css), board `playfield`                                                                                                                                                | none found                                                                                                                                                                                                                                      | T6         | Sweep                                         |          |
| G-08 House Always Wins (`/house-always-wins`)                                                                                                                                                                                                | Own scheme; HUD, `TouchPad` `data-jelly-scope="off"`, field `playfield`                                                                                                                 | none found                                                                                                                                                                                                                                      | T6         | Sweep                                         |          |
| G-09 Kowloon Knockout (`/kowloon-knockout`)                                                                                                                                                                                                  | Own scheme (5 css files); `MobileControls` scope off                                                                                                                                    | `components/kowloon-knockout/MenuBackdrop.tsx:19`, `MenuFighters3D.tsx:34`, `arena/ImpactDirector.tsx:9` import `lib/jelly/tiers` (kept) (a)                                                                                                    | T6         | Sweep (menu)                                  |          |
| G-10 Laundry Sort (`/laundry-sort`)                                                                                                                                                                                                          | `ui` primitives (5 files); HUD `HudReadout` `data-jelly-zone="hud"`, field `playfield`                                                                                                  | none found                                                                                                                                                                                                                                      | T6         | Sweep                                         |          |
| G-11 Neon Driftway (`/neon-driftway`)                                                                                                                                                                                                        | 1 role file, 3 ui files; touch controls scope off                                                                                                                                       | none found                                                                                                                                                                                                                                      | T6         | Sweep                                         |          |
| G-12 Nightrail (`/nightrail`)                                                                                                                                                                                                                | HUD `NightrailHud.tsx:212`, field `playfield`, touch controls scope off                                                                                                                 | none found                                                                                                                                                                                                                                      | T6         | Sweep                                         |          |
| G-13 RMHbox (see A-05)                                                                                                                                                                                                                       |                                                                                                                                                                                         |                                                                                                                                                                                                                                                 |            |                                               |          |
| G-14 Slice It! (`/slice-it`, `artist.$key`, `edit.$songId`, `player.$handle`)                                                                                                                                                                | **Own scheme** `.slice-theme` / `.slice-tokens` (`features/slice-it/ui/slice-it.css`); route wrapper `data-jelly-scope="off"` (`app/routes/slice-it.tsx:14`); 3 role files, 24 ui files | `slice-it.css:433-434` `.slice-theme :is(.jelly-flow, .jelly-haze-canvas, canvas[data-liquid-glass]) { display: none }` (a; Fwd for T2, see section 3); `slice-it.css:240-310` `html.perf-lite … [data-jelly-rest='flat']` rules (c, with U-07) | T2, T6     | Sweep (menu, results), Shot                   |          |
| G-15 Synapse Storm (`/synapse-storm`)                                                                                                                                                                                                        | Own scheme (2 css); `HUD` hud zone, `GameBoard` playfield, `PuzzleCard` scope off                                                                                                       | none found                                                                                                                                                                                                                                      | T6         | Sweep                                         |          |
| G-16 Temple of Joy (`/temple-of-joy`)                                                                                                                                                                                                        | Own WebGL globes (`TempleGlobes.tsx`, playfield), `TempleHud` hud, `bowl/BowlOverlay.tsx:490` opts out                                                                                  | none found                                                                                                                                                                                                                                      | T6         | Sweep                                         |          |
| G-17 VELUM2099 (`/velum2099`)                                                                                                                                                                                                                | 1 role file, 1 ui file, 2 css                                                                                                                                                           | none found                                                                                                                                                                                                                                      | T6         | Sweep                                         |          |
| G-18 Versecraft (`/versecraft`)                                                                                                                                                                                                              | 1 role file; `LineArrangePuzzle` playfield                                                                                                                                              | none found                                                                                                                                                                                                                                      | T6         | Sweep                                         |          |
| G-19 Void Breaker (`/void-breaker`)                                                                                                                                                                                                          | Own scheme; HUD `app-hud` hud zone, stage playfield, touch controls scope off                                                                                                           | none found                                                                                                                                                                                                                                      | T6         | Sweep                                         |          |
| G-20 Uncatalogued top-level games: `/balatro` (`BalatroPage`, frame playfield), `/lights-out`, `/secret` (`cursed-logic` (ShopModal/HowToPlayModal opt out), `signal-forge` (9 ui files, playfield), `vega` (playfield), index), `/dunesday` | Own schemes                                                                                                                                                                             | none found                                                                                                                                                                                                                                      | T6         | Sweep                                         |          |
| G-21 Game menu/pause/HUD chrome, all games, `html[data-game-state='playing']`                                                                                                                                                                | Ambient motion and carriers pause under `data-game-state=playing` (`app/jelly-material.css:457`, `app/jelly-arcs.css:30`, `app/jelly-coverage.css:350`)                                 | `jelly-coverage.css:349-350` hides only `.jelly-flow`, `.jelly-haze-canvas` inside playfield/hud (a; Fwd for T2/T3: new layers must also stop there)                                                                                            | T2, T3, T4 | Sweep (enter a game, assert nothing animates) |          |

### 1.7 Apps (14 in `lib/catalog/apps`)

| Area                                                                                                                                                                                    | Material today                                                                                                                                                                   | Engine-owned dependencies                                                                         | Task                                | How verified                                    | Verified |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------- | -------- |
| AP-01 Dunesday (`/dunesday`)                                                                                                                                                            | Own scheme (1 css)                                                                                                                                                               | none found                                                                                        | T6                                  | Sweep                                           |          |
| AP-02 RMHConnections, RMHdle                                                                                                                                                            | External (Discord links)                                                                                                                                                         | n/a                                                                                               | none                                | n/a (exempt)                                    |          |
| AP-03 RMH Strategies (`/strategies` index, `incidents`, `sahur`, `profile/{index,reputation,settings}`, `puzzles/{index,$mode,archive,leaderboard}`, `safehouse/{index,drops,recruit}`) | unknown — needs a look (no `components/strategies` dir; code lives elsewhere)                                                                                                    | unknown — needs a look                                                                            | T6                                  | Sweep                                           |          |
| AP-04 RMH TF2 Hub (`/tf2`, `play`, `workshop`, `loadout/{index,l.$slug,mine}`, `hud-editor/{index,editor,h.$slug,mine,s.$token}`)                                                       | **Native material (exempt).** `isNativeMaterialRoute` skips `useLiquidInteractions`; `Tf2HudShell` uses `AppShell` with `--app-jelly-on: 0` (`components/tf2-hud/*.css:222-223`) | See N-01. `components/tf2-hud/loadout/EffectParticles.tsx:6` imports `lib/jelly/tiers` (kept) (a) | T2, T3 (Fwd: scope new CSS out), T6 | Sweep (assert hud-editor shows no gel/haze/rim) |          |
| AP-05 RMHCalculator (`/rmhcalculator`)                                                                                                                                                  | unknown — needs a look                                                                                                                                                           | none found                                                                                        | T6                                  | Sweep                                           |          |
| AP-06 rmhcode (`/rmhcode`, `/rmhcode/auth`)                                                                                                                                             | 1 role file                                                                                                                                                                      | none found                                                                                        | T6                                  | Sweep                                           |          |
| AP-07 RMHHomes (`_site/homes`, 7 files), RMH Ladder (`_site/rmhladder`, 11 files)                                                                                                       | Site tier, 11 role files each                                                                                                                                                    | none found                                                                                        | T6                                  | Sweep                                           |          |
| AP-08 RMHMusic, RMH Study, RMHTube, RMH Type, RMH Studio                                                                                                                                | See A-05 to A-10                                                                                                                                                                 |                                                                                                   |                                     |                                                 |          |

### 1.8 Other WebGL and special material code

| Area                                                                                                                                                                                                                                                                                                | Material today                                                                                                   | Engine-owned dependencies                                                                                                                                                                                                                                                  | Task               | How verified                                                         | Verified |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------- | -------- |
| W-01 `GlobeCursor` (`components/globe-cursor/GlobeCursor.tsx`, `GlobeCursorRoot`, `lib/globe-cursor/*`, settings panel)                                                                                                                                                                             | Its own GPU canvas, moved by `transform`; hides under native-cursor routes                                       | Imports `lib/jelly/ambient-tick` (:6) and `lib/jelly/tiers` (:14), both kept (a)                                                                                                                                                                                           | none               | Gate:raf-loop-allowlist; Sweep (assert only the cursor's own canvas) |          |
| W-02 Elections (`/elections`: `components/elections/GlobeCanvas.tsx`, `LiquidGlobe.tsx`, `elections.css`)                                                                                                                                                                                           | Own WebGL scene, own CSS sheet; reads `html[data-jelly-motion]` directly (`GlobeCanvas.tsx:166`)                 | none from the engine (a); `jellyMotion` contract is the only coupling                                                                                                                                                                                                      | none               | Sweep (`still`: globe stops), excluded canvases list for T6          |          |
| W-03 Temple of Joy globes (`TempleGlobes.tsx`, `bowl/*`)                                                                                                                                                                                                                                            | Own WebGL                                                                                                        | none found                                                                                                                                                                                                                                                                 | none               | Sweep                                                                |          |
| W-04 Globe Set (daily puzzle) `GlobeSetGlobe.tsx`                                                                                                                                                                                                                                                   | Own WebGL, `playfield`                                                                                           | none found                                                                                                                                                                                                                                                                 | none               | Sweep                                                                |          |
| W-05 `/design` (`components/design/LiquidGlassPage`)                                                                                                                                                                                                                                                | Site-style page documenting the material: unknown — needs a look whether it embeds engine demos                  | none found by grep                                                                                                                                                                                                                                                         | T5 (docs), T6      | Sweep                                                                |          |
| W-06 `/jelly` lab (`app/routes/jelly.tsx`, `components/radial/eversion/lab` is separate)                                                                                                                                                                                                            | Role-class demos, a `strike()` button, text describing ambient drift, soft body, refraction                      | `jelly.tsx:213,223` `data-liquid-glass="refract"` demo (c: lab copy claims refraction and drifting haze that no longer exist); `:7` `import { strike } from '@/lib/jelly/arcs'` (c: `strike` needs the arcs runtime, which T4 only installs lazily on first `pointerdown`) | T2, T3, T4, T5     | Manual: every lab section in both themes; Sweep                      |          |
| W-07 `/liquid-glass`                                                                                                                                                                                                                                                                                | 301 redirect to `/jelly`                                                                                         | none                                                                                                                                                                                                                                                                       | none               | n/a                                                                  |          |
| W-08 `/eversion-lab` (`components/radial/eversion/lab/EversionLab.tsx`, access gated)                                                                                                                                                                                                               | Lab for eversion; spec says out of scope                                                                         | none found                                                                                                                                                                                                                                                                 | none               | Sweep only if reachable                                              |          |
| W-09 Eversion `[data-evert]` state layer (`app/globals.css:4642-4750`; users `ui/menu`, `ui/select`, `ui/liquid-tabs`, `ui/jelly-group`, radial feed/rail/wheel, `site/LanguageSwitcher`, `calendar/PersonPicker`, `homes/LocationSearch`, `rideshare/LocationSearch`, `creator-studio/storefront`) | Opacity-only `::before`; `evert-auto` ghost                                                                      | `lib/evert-auto.ts:138` `data-liquid-glass="lit"`, `app/liquid-glass.css:208` (a)                                                                                                                                                                                          | none               | Sweep (hover and focus a menu row and a field)                       |          |
| W-10 Page-snapshot capture (`lib/liquid/glass/scene.ts` over `lib/eversion/capture`)                                                                                                                                                                                                                | Excludes `canvas[data-liquid-glass]`, `.jelly-haze-canvas`, `.jelly-flow` from the clone (`scene.ts:32-34`)      | (a)                                                                                                                                                                                                                                                                        | T1                 | Gate:scene-feed test                                                 |          |
| W-11 Native-material routes `/games` and `/games/*` (Steam-style library: `app/routes/games.tsx`, `games/_library*`, `components/steam/steam.css`)                                                                                                                                                  | **Native material (exempt, JS only).** `.stm-legacy` neutralises glass classes (`steam.css:1331-1346`)           | `steam.css:1340` `.stm-legacy .jelly-flow, .stm-legacy canvas { display: none !important }` (a; Fwd for T2/T3). The brief names only the TF2 HUD editor as native-material; `lib/native-material-routes.ts` also lists `/games`                                            | T2, T3, T6         | Sweep (assert no gel/haze/press spring on `/games`)                  |          |
| W-12 `lib/liquid/runtime.ts` fallback cursor light (`.liquid-light` span, `app/liquid-glass.css:236-283`)                                                                                                                                                                                           | Installed by `useLiquidInteractions.ts:48` on every host; skips hosts carrying engine canvases (`runtime.ts:93`) | `runtime.ts:93` `host.matches('[data-liquid-canvas],[data-liquid-layer]')` is never true after T1, so every host gets the light (c: no task owns this; the spec's "cursor-light" removal names the engine's, not this one)                                                 | T1/T3 (decide), T5 | Gate:raf-loop-allowlist; Sweep (pointer move, assert no rAF at rest) |          |

### 1.9 Cross-cutting axes

| Area                                                                                                    | Material today                                                                                                                                                                                                                        | Engine-owned dependencies                                                                                                                                       | Task                                                        | How verified                                               | Verified |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- | -------- |
| X-01 Theme `.style-default` (Daylight, picker id `default`, bare `:root` tokens; `app/globals.css:945`) | Picker offers only `graphite` (Midnight, default) and `default` (Daylight) (`stores/themeStore.ts:34-57`)                                                                                                                             | `--site-jelly-*` tokens only                                                                                                                                    | T1 (rim), T2, T6                                            | Sweep (theme `default`), Gate:jelly-legibility (4.5:1)     |          |
| X-02 Theme `.style-light` (`globals.css:1034`)                                                          | Defined in CSS, not in the picker; retired ids self-heal to `graphite`                                                                                                                                                                | tokens only                                                                                                                                                     | T6                                                          | Sweep with a forced class                                  |          |
| X-03 Theme `.style-graphite` (Midnight, `globals.css:1129,1138,1950`)                                   | Default theme                                                                                                                                                                                                                         | tokens only                                                                                                                                                     | T1, T2, T6                                                  | Sweep, Gate:jelly-legibility                               |          |
| X-04 Themes `.style-sepia` (`:1232`), `.style-nocturne` (`:1317`), `.style-ultra` (`:1409`)             | Defined in CSS, not in the picker (retired decorative themes)                                                                                                                                                                         | tokens only                                                                                                                                                     | T6                                                          | Sweep with a forced class (one of them, per T6 Step 1)     |          |
| X-05 `.style-high-contrast`, `.style-liquid-glass`                                                      | Mentioned only in comments (`globals.css:755,843,1637,2095`); no rule block defines them. The site has no high-contrast theme (CLAUDE.md)                                                                                             | none                                                                                                                                                            | none                                                        | n/a (not shipped)                                          |          |
| X-06 Phone (390) and desktop (1440) widths                                                              | `@media (max-width: 767.98px)` pane tint (`app/liquid-glass.css:117-121`); handheld query `(pointer: coarse) and (max-width: 1024px)` (`jelly-material.css:464`); top bar full-bleed below 640px                                      | `jelly-material.css:464-468` hides `.jelly-flow__current` (a)                                                                                                   | T2 (touch: static floor, no pointer listener)               | Sweep (both widths), Pages                                 |          |
| X-07 Print                                                                                              | `@media print` strips floor, rim, carriers, canvases (`jelly-material.css:492-517`, `liquid-glass.css:279-288,315`, `jelly-coverage.css:392`, `jelly-arcs.css:34`)                                                                    | `jelly-material.css:513` `[data-jelly-body]` (a); `liquid-glass.css:316` `[data-jelly-rest='flat']` (c, with U-07)                                              | T2, T3                                                      | Sweep (`page.emulateMedia({ media: 'print' })`)            |          |
| X-08 RTL locales `ar`, `ur`                                                                             | `html[dir=rtl]` set pre-paint; rules in `globals.css` (5 `dir=rtl` matches); none in the jelly sheets or `radial.css`/`app-theme.css`                                                                                                 | Fwd: the haze gradient axis (`--jelly-flow-axis-deg`) and the rim's light direction (red top-left) are not mirrored today; keep or mirror deliberately in T1/T2 | T1, T2, T6                                                  | Sweep (`ar` and `ur`, desktop + phone)                     |          |
| X-09 `html.perf-lite`                                                                                   | Hides carriers/haze/rim canvases/light (`jelly-material.css:475`, `liquid-glass.css:271-277`), keeps static floor and rim; set by `lib/perf-tier.ts` `reconcileSoftRender()` (also the early return at `useLiquidInteractions.ts:57`) | `liquid-glass.css:311` `html.perf-lite [data-jelly-rest='flat']` (c); `html.perf-lite .slice-theme … [data-jelly-rest='flat']` (`slice-it.css:240-310`) (c)     | T2, T5 (re-scope)                                           | Sweep with `html.perf-lite` forced                         |          |
| X-10 `jellyMotion` Lively / Calm / Still (`html[data-jelly-motion]`, `jelly-material.css:35-93`)        | Calm sets `--jelly-flow-speed`, `--jelly-amp`; Still pauses carriers (`:456`), hides arc layer (`jelly-arcs.css:30`), stops dock shimmer (`radial.css:942`) and the elections globe (`GlobeCanvas.tsx:166`)                           | `jelly-material.css:456` pauses `.jelly-flow > span` (a; Fwd: T2's new layer must also be `none` under Still)                                                   | T2, T4                                                      | Sweep (`lively` and `still`), Gate:appearance-jelly-motion |          |
| X-11 `electricArcs` Full / Clicks / Off (`html[data-electric-arcs]`, absent when `full`)                | `jelly-arcs.css:30` hides the arc layer for `off`; `hooks/useCelebration.ts:60` dynamically imports `lib/jelly/arcs`                                                                                                                  | `useLiquidInteractions.ts:82-83` installs ambient arcs; `app/routes/jelly.tsx:7` `strike` (c, see W-06)                                                         | T4                                                          | Sweep (all three; click-count of onsets ≤ 3/s)             |          |
| X-12 iOS edge-pinned layers (`html.ios-webkit`)                                                         | `app/globals.css:2034` hides `.site-aurora, .radial-backdrop, .jelly-arc-layer`; full-bleed top bar; veil tint via root canvas                                                                                                        | `.jelly-arc-layer` is created by the arcs runtime (a)                                                                                                           | T4 (click-arc layer must stay hidden/off-edge on iOS)       | Gate:ios-edge-contract; Pages                              |          |
| X-13 Touch / no-hover devices                                                                           | Plan Review Focus 1: haze static, no pointer listener, `:active` still springs                                                                                                                                                        | `lib/liquid/runtime.ts` and physics both listen for pointer moves today                                                                                         | T2, T3                                                      | Sweep with touch emulation                                 |          |
| X-14 Scrolling                                                                                          | `html[data-scrolling]` is stamped by `lib/scrollbar-reveal.ts:28`, not by the engine; carriers merely read it (`jelly-material.css:454`)                                                                                              | (a)                                                                                                                                                             | T2 (scroll-tied variant is an `animation-timeline` feature) | Sweep (scroll a feed)                                      |          |

---

## 2. Engine-owned selectors in use

Scope:
references
to
the
listed
names
in
`*.css`,
`*.ts`,
`*.tsx`
under
`app/ components/ hooks/ stores/ lib/`,
excluding
`lib/jelly`
and
`lib/liquid`.
Classes:
**(a)**
harmless
once
never
set;
**(b)**
defect;
**(c)**
unclear.
`data-liquid-scene`
has
**no**
reference
outside
the
engine
itself
(`lib/liquid/glass/engine.ts:635,2004,2025,2042,2194`).
Pure
`--jelly-flow-*`
/
`--site-jelly-flow-speed`
custom-property
lines
are
tokens,
not
selectors,
and
are
listed
as
one
item
(item
38).

### 2.1 CSS

| #   | Reference                                               | Exact selector or text                                                                                                                                                                                                                                                                             | Class | Note                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `app/jelly-material.css:196`                            | `html:not(.perf-lite) :is([data-jelly-haze='on'], [data-jelly-flow='on'])`                                                                                                                                                                                                                         | (a)   | Sets `--jelly-floor: none, none` only when the attribute is present. Absent attribute keeps the static floor, which is the intended baseline.                                                                                                                                                                                                                                   |
| 2   | `app/jelly-material.css:226,238,252,318,352`            | `.jelly-flow`, `.jelly-flow > span`, `.jelly-flow > .jelly-flow__drift`, `.jelly-flow > .jelly-flow__current`, `.jelly-flow.jelly-flow--rim-only`                                                                                                                                                  | (a)   | Dead once no node has the class. T2 reuses the keyframes and gradients, T5 deletes.                                                                                                                                                                                                                                                                                             |
| 3   | `app/jelly-material.css:363,367,370`                    | `:is(.glass-interactive, [data-slot='button'], [data-evert]):hover > .jelly-flow`; `[data-slot='button']:is([data-variant='ghost'], [data-variant='link']) > .jelly-flow` (+ `:hover`)                                                                                                             | (a)   | Child combinators on a node that never exists.                                                                                                                                                                                                                                                                                                                                  |
| 4   | `app/jelly-material.css:375`                            | `[data-jelly-haze='on'] > .jelly-flow`                                                                                                                                                                                                                                                             | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 5   | `app/jelly-material.css:392,414,424`                    | `…:not([data-liquid-canvas='on']):not([data-liquid-material='off'])` (static rim; border dampening; field well)                                                                                                                                                                                    | (a)   | Always true after T1, so every host wears the static rim. That is the intended baseline; the look must be compared in T1 Step 8.                                                                                                                                                                                                                                                |
| 6   | `app/jelly-material.css:433`                            | `.jelly-haze-canvas`                                                                                                                                                                                                                                                                               | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 7   | `app/jelly-material.css:454-459`                        | `html[data-scrolling] .jelly-flow > span`, `html[data-jelly-idle] .jelly-flow > span`, `html[data-jelly-motion='still'] .jelly-flow > span`, `html[data-game-state='playing'] .jelly-flow > span`, `:focus-visible > .jelly-flow > span`, `:is(.glass-inset, …):focus-within > .jelly-flow > span` | (a)   | `data-jelly-idle` is stamped only by `lib/jelly/flow-carriers.ts` (`CARRIER_IDLE_ATTR`); `data-scrolling` is stamped by `lib/scrollbar-reveal.ts`. Fwd: T2 must reproduce each pause condition on the new layer.                                                                                                                                                                |
| 8   | `app/jelly-material.css:464-466`                        | `.jelly-flow > .jelly-flow__current` (handheld)                                                                                                                                                                                                                                                    | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 9   | `app/jelly-material.css:475,493-494`                    | `:is(.perf-lite, .app-high-contrast) :is(.jelly-flow, .jelly-haze-canvas)`; `@media print { .jelly-flow, .jelly-haze-canvas }`                                                                                                                                                                     | (a)   | The degradation contract; T2 must restate it for the new layer.                                                                                                                                                                                                                                                                                                                 |
| 10  | `app/jelly-material.css:513`                            | `[data-jelly-body]` (print reset of `translate`/`scale`)                                                                                                                                                                                                                                           | (a)   | `data-jelly-body` is stamped by physics/engine. T3 must keep the print reset for whatever replaces it.                                                                                                                                                                                                                                                                          |
| 11  | `app/jelly-material.css:533,538`                        | `html[data-jelly-ready]`                                                                                                                                                                                                                                                                           | (a)   | Kept: T1 Step 6 keeps stamping it in `useLiquidInteractions.ts:64`. If T1 drops that, the entrance fade silently never runs.                                                                                                                                                                                                                                                    |
| 12  | `app/jelly-material.css:8-32,219-225,373-374,451-453`   | comments naming `data-jelly-haze`, `data-jelly-flow`, `data-liquid-canvas`, `.jelly-flow`, `flow-carriers.ts`                                                                                                                                                                                      | (a)   | Comment text only; T5 rewrites.                                                                                                                                                                                                                                                                                                                                                 |
| 13  | `app/jelly-coverage.css:151`                            | `…:not([data-liquid-canvas='on'])` (rim on `[data-slot]`, switch, skeleton)                                                                                                                                                                                                                        | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 14  | `app/jelly-coverage.css:156`                            | `:is([data-jelly], [data-slot='switch'], [data-slot='skeleton'])[data-jelly-flow='on']`                                                                                                                                                                                                            | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 15  | `app/jelly-coverage.css:162,171`                        | `[data-jelly='lite'] > .jelly-flow`; `:is([data-jelly='off'], [data-jelly='none']) > .jelly-flow`                                                                                                                                                                                                  | (a)   | Fwd: these are the opt-out contract for carriers; the new layer needs the same exclusions.                                                                                                                                                                                                                                                                                      |
| 16  | `app/jelly-coverage.css:324`                            | `html:not(.perf-lite) [data-sonner-toaster] [data-sonner-toast][data-jelly-flow='on']`                                                                                                                                                                                                             | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 17  | `app/jelly-coverage.css:349-350`                        | `[data-jelly-zone='playfield'] :is(.jelly-flow, .jelly-haze-canvas)`; `html[data-game-state='playing'] [data-jelly-zone='hud'] :is(…)`                                                                                                                                                             | (a)   | Fwd: play-fields and in-play HUDs must also exclude the new layer (U-08, G-21).                                                                                                                                                                                                                                                                                                 |
| 18  | `app/jelly-coverage.css:24`                             | comment                                                                                                                                                                                                                                                                                            | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 19  | `app/liquid-glass.css:167-180`                          | `:is(.liquid-glass-canvas, .jelly-haze-canvas)` fade rules, `[data-liquid-fresh]`, `[data-liquid-settled]`, `@starting-style`                                                                                                                                                                      | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 20  | `app/liquid-glass.css:184-191`                          | `:is([data-liquid-canvas='on'], [data-liquid-layer], [data-jelly-flow='on'], [data-jelly-haze='on']) { isolation: isolate }`                                                                                                                                                                       | (c)   | Isolation is applied **only** while the engine/carriers are attached. The T2 pseudo-element haze sits at a negative z-index and needs an isolated host; once these attributes are never set the host has no stacking context and the layer can paint under an ancestor's background. Plan T2 does not mention isolation.                                                        |
| 21  | `app/liquid-glass.css:192-194`                          | `[data-liquid-layer][data-liquid-static] { position: relative }`                                                                                                                                                                                                                                   | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 22  | `app/liquid-glass.css:195,208,214,217,227`              | `…[data-liquid-canvas='on']…` (static coat steps aside, `border-color: transparent`, `.evert-ghost[data-kind='hover'][data-liquid-canvas='on'] { background: none }`)                                                                                                                              | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 23  | `app/liquid-glass.css:295`                              | `[data-liquid-canvas='on']:not([data-liquid-material='off'])[class~='border-site-border']`                                                                                                                                                                                                         | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 24  | `app/liquid-glass.css:304`                              | `html:not(.perf-lite) [data-jelly-gel='on']:not([data-liquid-material='off']) { background-color: transparent; background-image: none }`                                                                                                                                                           | (a)   | Hides the fill only while the attribute is set. Never set means the static fill shows. Fine.                                                                                                                                                                                                                                                                                    |
| 25  | `app/liquid-glass.css:153-166,181-183,198-201,299-303`  | comments                                                                                                                                                                                                                                                                                           | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 26  | `components/shared/app-theme.css:607`                   | `html:not(.perf-lite) .app-glass:is([data-jelly-haze='on'], [data-jelly-flow='on'])`                                                                                                                                                                                                               | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 27  | `components/shared/app-theme.css:612`                   | `.app-glass[data-liquid-canvas='on']`                                                                                                                                                                                                                                                              | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 28  | `components/shared/app-theme.css:683-688`               | `…:is([data-jelly-haze='on'], [data-jelly-flow='on'])` on `.app-theme` cards                                                                                                                                                                                                                       | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 29  | `components/shared/app-theme.css:365,636`               | comments naming `data-scrolling`, `[data-jelly-flow='on']`                                                                                                                                                                                                                                         | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 30  | `components/radial/radial.css:4009-4010`                | `.radial-topbar__signin[data-liquid-canvas='on']`, `.radial-topbar__search[data-liquid-canvas='on']`                                                                                                                                                                                               | (a)   | Hairline goes clear only while the engine draws the rim. After T1 the hairline always shows; check in R-01.                                                                                                                                                                                                                                                                     |
| 31  | `components/creator-studio/storefront.css:654`          | `.store-spot__link[data-liquid-canvas='on']`                                                                                                                                                                                                                                                       | (a)   | Same as 30.                                                                                                                                                                                                                                                                                                                                                                     |
| 32  | `features/slice-it/ui/slice-it.css:433-434`             | `.slice-theme :is(.jelly-flow, .jelly-haze-canvas, canvas[data-liquid-glass]), .slice-tokens :is(…) { display: none }`                                                                                                                                                                             | (a)   | Dead today. Fwd for T2 (section 3, D-F3).                                                                                                                                                                                                                                                                                                                                       |
| 33  | `components/steam/steam.css:1340`                       | `.stm-legacy .jelly-flow, .stm-legacy canvas { display: none !important }`                                                                                                                                                                                                                         | (a)   | Fwd for T2/T3 (D-F4).                                                                                                                                                                                                                                                                                                                                                           |
| 34  | `app/jelly-arcs.css:6`                                  | comment: `<canvas class="jelly-arc-layer" … data-liquid-glass="off" data-jelly-arcs="off">`                                                                                                                                                                                                        | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 35  | `app/globals.css:3740-3767`                             | `:where(*:not([data-scrolling]))` scrollbar rules                                                                                                                                                                                                                                                  | (a)   | `data-scrolling` is owned by `lib/scrollbar-reveal.ts`, not the engine. Unaffected.                                                                                                                                                                                                                                                                                             |
| 36  | `app/globals.css:4783`                                  | comment: `data-liquid-glass="lit"` on the evert ghost                                                                                                                                                                                                                                              | (a)   |                                                                                                                                                                                                                                                                                                                                                                                 |
| 37  | `app/globals.css:3444-3451`                             | `a:not(.glass-interactive):not([data-jelly-active]):active`, `button:…:not([data-jelly-active]):active`, `[role='button']…`, `[role='tab']…`, `[role='menuitem']…`, `summary:not([data-jelly-active]):active` → `opacity: 0.6`                                                                     | (b)   | `data-jelly-active` is stamped by `lib/jelly/physics.ts` (and the engine) to **suppress** this opacity cue while the soft body squishes. When T3 stops installing physics, nothing sets it and every link, legacy button, tab and menu item flashes to 60% on press **in addition to** the CSS spring. (`data-jelly-active` is not on the brief's list but is the same family.) |
| 38  | `--site-jelly-flow-speed`/`--app-jelly-flow-speed` etc. | `app/globals.css:344,1012,1099,1209,1295,1383,1515`; `components/shared/app-theme.css:163,279,583-589,642-648,746`; `app/jelly-coverage.css:45-84,183-184,290-291`                                                                                                                                 | (a)   | Tokens consumed by the carrier's `animation-duration`. Harmless unused; T2 decides whether to reuse.                                                                                                                                                                                                                                                                            |

### 2.2 TypeScript and TSX

| #   | Reference                               | Exact text                                                                     | Class | Note                                                                                                                                  |
| --- | --------------------------------------- | ------------------------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 39  | `hooks/useLiquidInteractions.ts:64,124` | `setAttribute('data-jelly-ready', '')` / `removeAttribute('data-jelly-ready')` | (a)   | Kept by plan (T1 Step 6).                                                                                                             |
| 40  | `hooks/useLiquidInteractions.ts:23`     | comment: "`.jelly-flow` first child"                                           | (a)   | Rewritten in T1.                                                                                                                      |
| 41  | `components/ui/icon-button.tsx:48`      | `data-jelly-flow="off"`                                                        | (a)   | Input to the removed carrier service. Fwd for T2 (D-F2).                                                                              |
| 42  | `components/ui/skeleton.tsx:28`         | `data-jelly="lite"` + `data-jelly-flow="off"`                                  | (a)   | Same. Pinned by `lib/__tests__/jelly-coverage.test.ts:348`.                                                                           |
| 43  | `components/ui/liquid-glass.tsx:22,40`  | `data-liquid-glass={refract ? 'refract' : undefined}`                          | (a)   | Inert without the engine; the `refract` prop (used by `components/profile/ProfileHero.tsx:196`) becomes a no-op. T5 removes the prop. |
| 44  | `app/routes/jelly.tsx:213,223`          | `data-liquid-glass="refract"` and the label text                               | (c)   | A lab demo of a feature that is gone; copy is wrong after PR 1 (D-C4).                                                                |
| 45  | `lib/evert-auto.ts:17,138`              | `el.setAttribute('data-liquid-glass', 'lit')`                                  | (a)   | Inert after T1; `lib/jelly/soft-policy.ts:211,269` (kept) still lists `[data-liquid-glass]`, also inert.                              |
| 46  | `lib/scrollbar-reveal.ts:5,28`          | `const ATTR = 'data-scrolling'`                                                | (a)   | Not engine-owned; it is the source the carriers read.                                                                                 |

### 2.3 Gate tests that pin the engine-era contract

These
are
not
UI,
but
each
fails
or
asserts
a
removed
thing
when
the
owning
task
changes
the
CSS.
The
spec
lists
them
as
"gates
expected
to
change";
they
are
in
the
inventory
so
they
are
amended
in
the
same
commit
as
the
change
that
breaks
them.

| #   | Reference                                                     | Pinned text                                                                                                                                                                                                                                                           | Class | Owner                           |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------- |
| 47  | `lib/__tests__/site-infinite-animation.test.ts:16,26,190-273` | the `jelly-drift`/`jelly-current` keyframes run only under `.jelly-flow >`; `html[data-scrolling]` pause; `[data-liquid-canvas='on']`, `[data-jelly-flow='on']`, `[data-jelly-haze='on']` isolation selectors (lines 271-273)                                         | (b)   | T2 (N3, N12), T5                |
| 48  | `lib/__tests__/jelly-contract.test.ts:539,594`                | "no `@keyframes` except the sanctioned `.jelly-flow` haze drift"                                                                                                                                                                                                      | (b)   | T2                              |
| 49  | `lib/__tests__/jelly-coverage.test.ts:333,348,393-399`        | message "motion comes from the jelly services and .jelly-flow carriers"; `expect(skeleton).toMatch(/data-jelly-flow="off"/)`; and at 393-399 the legacy press-cue probe fails if any `:active` selector of the cue lacks `:not([data-jelly-active])` (item 37's rule) | (b)   | T2 for 333/348; T3 for 393-399  |
| 50  | `lib/__tests__/jelly-legibility.test.ts:224`                  | token list entry `--site-jelly-flow-speed`                                                                                                                                                                                                                            | (a)   | T5 only if the token is removed |

### 2.4 Same family, outside the brief's list (found while reading)

Engine-
or
physics-stamped
names
that
outside
code
reads.
Included
because
"only
works
while
the
engine
runs"
is
the
test.

| #   | Reference                                                                                                                       | Exact text                                                                    | Class | Note                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 51  | `app/liquid-glass.css:311,316`; `features/slice-it/ui/slice-it.css:240-241,298-310`; `components/ui/button.tsx:107` (writes it) | `[data-jelly-rest='flat']`                                                    | (c)   | Read by the engine to keep a flat button slab-less until touched. After T1 the attribute only drives the `perf-lite`/print opaque affordance. `button.tsx:16` comment goes stale. Check the look of each flat variant (U-07).                                                                                                                               |
| 52  | `components/radial/RadialShell.tsx:209`, `ui/jelly-group.tsx:45`, `ui/selection-bar.tsx:79`                                     | `data-jelly-press-through`                                                    | (c)   | Read only by `lib/jelly/physics.ts:656-659` to stop a container squashing when an inner control is pressed. CSS `:active` matches every ancestor; T3 must replace this semantic (D-F5). Task 8: retired; the setters (and the scroller pill) carry `data-jelly-press-body`, a press body that squashes as one for any member (`app/jelly-material.css` §8). |
| 53  | `app/jelly-material.css:513`, `app/liquid-glass.css:145,236,275`                                                                | `.liquid-glass-canvas`, `.liquid-light`, `[data-jelly-body]`                  | (a)   | `.liquid-glass-canvas` is engine-only. `.liquid-light` is injected by `lib/liquid/runtime.ts` (W-12) and is not removed by any task.                                                                                                                                                                                                                        |
| 54  | `lib/liquid/runtime.ts:93` (inside `lib/liquid`, listed because it survives)                                                    | `host.matches('[data-liquid-canvas],[data-liquid-layer]')`                    | (c)   | Fallback light skips engine-drawn hosts; after T1 it lights every host (W-12, D-C5).                                                                                                                                                                                                                                                                        |
| 55  | `lib/jelly/tiers.ts:329`, `lib/liquid/glass/scene.ts:32-34` (kept files)                                                        | `'canvas[data-liquid-glass],.jelly-haze-canvas,.jelly-flow,.jelly-arc-layer'` | (a)   | Exclusion lists that name removed layers. Harmless; T5 tidies.                                                                                                                                                                                                                                                                                              |

### 2.5 Tally

Items
1-55
(the
token
lines
are
one
item,
38):
**(a)
46,
(b)
4,
(c)
5**.
The
four
(b)
items
are
item
37
(a
live
CSS
rule)
and
items
47-49
(gate
tests
that
pin
the
engine-era
contract).
The
five
(c)
items
are
20,
44,
51,
52
and 54.
Item
53
mixes
three
names
and
is
counted
(a).
Items
1-36
and
38
are
CSS,
39-46
are
TS/TSX,
47-50
are
gate
tests,
51-55
are
the
same-family
names
outside
the
brief's
list.

---

## 3. Defects to fix

### 3.1 Existing rules or code that depend on the engine (classes (b) and (c))

| ID   | Defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Item                 | Owner                                                                                                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-B1 | `:not([data-jelly-active]):active { opacity: 0.6 }` presses (`app/globals.css:3444-3451`) lose their suppressor when physics stops being installed: double press cue on every link, tab, menu item, legacy button. Rewrite the guard to the new press state (or remove the opacity cue for hosts that spring). **T3 must amend the gate in the same commit:** `lib/__tests__/jelly-coverage.test.ts:393-399` (item 49) fails CI if any `:active` selector of the cue lacks `:not([data-jelly-active])`, so changing the guard without updating that probe breaks the build. | 37, 49               | T3                                                                                                                                                                     |
| D-B2 | Gate `site-infinite-animation` N3/N12 pins the carrier selectors and `[data-liquid-canvas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | jelly-flow           | jelly-haze='on']` isolation list.                                                                                                                                      | 47  | T2  |
| D-B3 | Gate `jelly-contract` allows `@keyframes` only for the `.jelly-flow` drift.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 48                   | T2                                                                                                                                                                     |
| D-B4 | Gate `jelly-coverage` pins carriers in its message and `data-jelly-flow="off"` on the skeleton.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 49                   | T2                                                                                                                                                                     |
| D-C1 | `isolation: isolate` only under engine/carrier attributes (`app/liquid-glass.css:184-191`): T2's negative-z-index haze layer needs its own isolation (and `position: relative`) on every role host, or it paints under ancestors.                                                                                                                                                                                                                                                                                                                                           | 20                   | T2                                                                                                                                                                     |
| D-C2 | `data-jelly-press-through` has no CSS equivalent: pressing a button in the top bar, a `JellyGroup`, a `LiquidTabs` strip or a selection bar would also press the container.                                                                                                                                                                                                                                                                                                                                                                                                 | 52, R-01, U-11, U-21 | T3 Task 8: retired; the setters (and the scroller pill) carry `data-jelly-press-body`, a press body that squashes as one for any member (`app/jelly-material.css` §8). |
| D-C3 | `data-jelly-rest="flat"` look and the `button.tsx:16` comment; verify each flat variant (default, outline, secondary, ghost, link, accent) against the engine look in both themes.                                                                                                                                                                                                                                                                                                                                                                                          | 51                   | T1 (look), T3                                                                                                                                                          |
| D-C4 | `/jelly` lab: refraction demo and ambient/soft-body copy describe removed behaviour; `strike()` depends on the arcs runtime that T4 installs lazily on `pointerdown`, so the lab's own button may strike before the runtime exists.                                                                                                                                                                                                                                                                                                                                         | 44, W-06             | T2, T3, T4, T5                                                                                                                                                         |
| D-C5 | `lib/liquid/runtime.ts` fallback light (`.liquid-light`): installed by `useLiquidInteractions.ts:48`, per-pointer-move frame, now applied to every host (`runtime.ts:93` never skips). No task owns it. Decide in T3 (replace with `--px/--py`) or delete in T5, and keep `raf-loop-allowlist` honest.                                                                                                                                                                                                                                                                      | 54, W-12             | T3, T5                                                                                                                                                                 |
| D-C6 | Hub `RadialFeed` pill: `radial.css:2781` documents that the pill's press is physics-owned (no CSS transform); T3 must give it a CSS press or it loses its cue.                                                                                                                                                                                                                                                                                                                                                                                                              | R-08                 | T3                                                                                                                                                                     |

### 3.2 Forward risks: not broken today, broken by the new mechanism unless handled

| ID    | Risk                                                                                                                                                                                                                                                                                                                                                                                                        | Owner                                                                                                                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-F1  | Opt-outs that only the carrier service honours: `[data-jelly='lite']`, `[data-jelly='off'                                                                                                                                                                                                                                                                                                                   | 'none']` (`jelly-coverage.css:162,171`), `[data-liquid-material='off']`, `[data-jelly-enter='off']`. The pseudo-element haze must exclude the same hosts. | T2  |
| D-F2  | `data-jelly-flow="off"` on `IconButton` and `Skeleton` (and `jelly-coverage.test.ts:348`) is the only thing keeping carriers off them; the CSS layer must read it (or those components must be re-tagged and the test amended).                                                                                                                                                                             | T2                                                                                                                                                        |
| D-F3  | Own-scheme games hide carriers with `display: none` on `.jelly-flow`/`.jelly-haze-canvas` (`slice-it.css:433-434`). A pseudo-element layer is not matched, so Slice It! (and any other own-scheme page that relied on the carrier service skipping it) would show haze. Re-scope in the owning CSS.                                                                                                         | T2                                                                                                                                                        |
| D-F4  | Native-material routes (`/tf2/*`, `/games/*`) opt out in JavaScript only. A CSS-only haze/press layer reaches them. TF2 relies on `--app-jelly-on: 0` and `/games` on `.stm-legacy` (`steam.css:1331-1346`); the new CSS must be excluded the same way (a root marker such as a data attribute on the route shell, or verify each route's neutralising CSS covers pseudo-elements and `scale`/`translate`). | T2, T3, T6                                                                                                                                                |
| D-F5  | Play-field and in-play HUD exclusion (`jelly-coverage.css:349-350`, `[data-jelly-zone]`, `html[data-game-state='playing']`) targets `.jelly-flow` only; restate for the new haze and the CSS press.                                                                                                                                                                                                         | T2, T3                                                                                                                                                    |
| D-F6  | Pause conditions that lived in `jelly-material.css:454-459` (`scrolling`, `idle`, `still`, game playing, focus-visible, focused field) must each have a counterpart on the new layer; `still` and `perf-lite` and print are mandatory (WCAG 2.2.2).                                                                                                                                                         | T2                                                                                                                                                        |
| D-F7  | `html[data-jelly-ready]` gates the entrance fade; if T1 reorders `useLiquidInteractions.start()` and drops the stamp, the fade silently stops.                                                                                                                                                                                                                                                              | T1                                                                                                                                                        |
| D-F8  | RTL (`ar`, `ur`): rim light direction and `--jelly-flow-axis-deg` are not mirrored; decide deliberately.                                                                                                                                                                                                                                                                                                    | T1, T2                                                                                                                                                    |
| D-F9  | Snapshot for the globe: nothing publishes `publishGovernorStep` after T1 (already noted in the plan); the globe's own canvases are the only allowed canvases in T6's "no canvas at rest" assertion, plus `GlobeCursor`, elections `GlobeCanvas`, temple/globeset globes.                                                                                                                                    | T1, T6                                                                                                                                                    |
| D-F10 | The brief names only the TF2 HUD editor as native-material; `lib/native-material-routes.ts` also exempts `/games` and `/games/*`. T6 must treat both as exempt, not as failures.                                                                                                                                                                                                                            | T6                                                                                                                                                        |
