# features/medschools — RMH Med Schools

> Scope: `features/medschools/`. Repo-wide context: [`/CLAUDE.md`](../../CLAUDE.md), [`../CLAUDE.md`](../CLAUDE.md).
> Spec: `docs/superpowers/specs/2026-11-20-rmh-med-schools-design.md`. Phase 3 plan:
> `docs/superpowers/plans/2026-11-22-rmh-medschool-phase3-public-pages.md` (its "Owner revisions" O1-O6 override its
> tasks).

Anonymized US MD and DO admissions-cycle data: counts and reported events, never people. A worker (phases 1-2b, in
`server/medschools-worker/`, code in `scrape/`) collects it from CycleTrack, Admit.org and Student Doctor Network; the
public pages (phase 3) read it.

## What is public (phase 3)

Signed-out readable, in the full-screen app frame of the redesign (see "Design"), not the `_site` shell:

| Route        | Page                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `/med`       | School index (rows on rules) with search, degree, state and program                                   |
| `/med/live`  | Live feed of recent reported events, refreshed by the live signal (SSE), "show older" paging          |
| `/med/$slug` | One school: Activity, History, Forecast, Interviews, Secondaries, Facts tabs (`?tab=`, `?program=` …) |

Eleven anonymous `GET` endpoints (`api/medschools.*.server.ts`, registered `apiRoute` modules, `auth: 'optional'`, read
rate limit, public cache): `schools`, `schools/$slug`, `schools/$slug/activity`, `schools/$slug/history`,
`schools/$slug/arrivals`, `schools/$slug/forecast` (phase 5), `schools/$slug/secondaries`, `schools/$slug/facts` (phase
C), `live`, `live/summary`, `today`. One more is a route file, not a registered module, because it is a stream:
`GET /api/medschools/live/stream` (the live signal, see "The live signal" below). Contracts live in
`medschools.contract.ts`; loaders in `api/read.server.ts`; query factories in `medschools.queries.ts` (no
`createServerFn`). Route loaders seed React Query with `contractQuery`, so the charts exist in the server HTML with
scripting off.

**The public endpoints stay user-independent (phase 4).** Nothing under `/api/medschools/schools*` or `live` reads a
session, a preference or a list; a signed-in member's preferences are applied in the route loader, which prefetches the
same public queries with explicit parameters, so the public cache keys and bodies are what any anonymous caller can type
(`medschools-private.test.ts` holds that a session changes no public byte). `me/ask` is the exception that is personal
but not an aggregate of tracker rows: see "AI Q&A (phase 6)".

**Placement (owner O1):** listed in the Services hub (`app/routes/_site/services/index.tsx`) and site search
(`lib/search/catalog.ts`), **not** in the games/apps catalog. There is no `catalog.ts`, no card art, no image manifest
row; the manifest has `catalog` unset and `listed: false`; `ui/ui-rules.test.ts` pins this. `/med` and `/med/live` are
`STATIC_ROUTES` in `lib/sitemap.ts`; school pages are the `medschools` sitemap chunk.

## Design: a full-screen app (roadmap item 11, phase A)

Owner-approved 2026-11-23 and moved up 2026-11-24 (roadmap item 11; Steel §18 D13 is answered by it). The pages left the
`_site` Steel shell for the `--app-*` app tier, so the Steel content rules (rows on rules, no radius, no shadow) **no
longer govern this feature**; the admin page does not move with it (`components/admin/medschools/`, still Steel). Plan:
`docs/superpowers/plans/2026-11-24-rmh-medschool-redesign.md`.

- **Routes.** `app/routes/med.tsx` is a top-level layout (`MedApp` around an `<Outlet/>`, its own `errorComponent` and
  `notFoundComponent`, no auth gate); the pages are `app/routes/med/*` with unchanged URLs. `features/medschools` is in
  `FULLSCREEN_TIER_DIRS` and `med` in `FULLSCREEN_ROUTE_SEGMENTS` (`eslint-local-rules/design-scope.js`) and in
  `APP_TIER_DIRS` (`lib/__tests__/css-tiers.ts`, so the CSS stays under the `!important`, keyframes and hex gates).
  `/med` is in `SITE_SHEET_ROUTES` (`lib/style-tier.ts`): it takes the lean site stylesheet, not the app superset
  (`--app-*` utilities are already in it).
- **Shell (`ui/shell/`).** `MedApp` (AppShell + `.app-page`, the cookie notice, a grid of the main column and the live
  rail), `MedTopBar` (over the main column only: 44px round back button, always present: the session's history, else `/`
  from the index and the index from everywhere else; the app's name; `HeaderActions`), `useMedMode` and `ThemeToggle`.
  **Header (owner 2026-11-24):** `HeaderActions` is one group at the bar's end, on the title's row at every width (the
  title ends in an ellipsis on a narrow phone; the icons never wrap): Interview practice (`Mic`), Live activity
  (`Activity`), the member's area (`UserRound`) and the light/dark toggle, each a 44px round link or button with an
  accessible name and a `title`. A page never links to itself (no Live on `/med/live`, no practice on `/med/practice`).
  The member's area, signed in, is an `AnchoredMenu` (keyboard, Escape, focus back): My cycle (`/med/tracker`), My
  school lists, Preferences (`/med/lists#preferences`), Ask about schools; "My stats" joins it when it exists. On those
  pages the button is the ink fill and the item is `aria-current`. Signed out it is a link to
  `/login?callbackURL=<this page>`. The index's old link row (`Places`) is gone; the school page's member links moved
  into the same menu. **The rail** is in the server HTML at every width (frame, the open-live icon link
  `SquareArrowOutUpRight`, the search, the two filters and `RailSkeleton`'s eight static rows) and CSS shows the column
  from 1280px, so nothing shifts when it fills; it starts level with the top bar. Its list (`rail/RailFeed.tsx`) is a
  lazy chunk loaded and queried only at 1280px and up (`useMediaQuery`), replaces the skeleton with the M9 fade and
  keeps its rows, dimmed, on a refetch. The Steel shell's overlays (command palette, "/" shortcut, what's-new) are not
  here, as in the other apps; the margin takeover entry is gone and `ActivityRail` is mounted by `MedApp`.
- **Mode.** Light or dark, device-local (`rmh-medschool-mode`, `{"dark":boolean}`, `engine/mode.ts`), defaulting to the
  OS preference; it does not follow the site Day/Night edition. RMH Music's design: `APP_ROUTE_THEME_BG` entry, the
  `lib/prepaint/theme-routes.ts` list, the device registry, `data-app-dark`.
- **Tokens (`ui/medschools.css`).** `--app-*` for light and dark; `--app-med-*` for the wash, the seven status pairs
  (`swatch`, `ink`, `text`; plus a neutral `withdrawn`) and the chart series (`-n` line, `-n-fill` pastel fill). Every
  colour is a token (the hex gate strips only `--app-*` declarations). Nothing in `ui/` reads `--site-*`
  (`ui-rules.test.ts` holds it for the markup and caps the stylesheet's `--site-*` declarations to one block): only a
  small **overlay bridge** at the end of the palettes, on `<html>` while the app is open, points the Steel names the
  shared anchored menu, confirm and prompt dialogs, toaster and `SortableList` buttons read at this palette (they portal
  outside the app root and are not worth a second copy).
- **Type.** One face, DM Sans (the site font), owner 2026-11-24: `--app-font-display` is `var(--app-font-body)` and
  headings are weight 600 with -0.015em (the page h1 -0.02em). Fraunces and its preload left the layout route.
- **The wash.** `public/images/medschools/wash-{light,dark}.webp`, pre-rendered by `scripts/medschools/render-wash.mjs`
  from the mockup's blobs; a `background-image` of `.medapp-page`, in the flow, never fixed, never animated, fading to
  the exact ground at each tile's top and bottom (iOS fills its bars from the ground). Dropped under
  `prefers-reduced-data`.
- (The B1 to B3 notes below are as built; the controls, pills and spacing they describe were reworked by "The system",
  further down.)
- **Phase B1 (built).** The index, live page, activity rail and their controls are on `--app-*` / `--app-med-*` and the
  `.medapp-*` classes at the foot of `medschools.css`: pill chips (`.medapp-chip`: `aria-pressed` / `aria-checked` is a
  filled wash, a stronger border and weight 600; 36px, 44px on touch), a paper panel (`.medapp-panel`) holding the rows,
  `PageHead` (`ui/shell/`) for the one `<h1>` in place of `PageLayout`'s title row and duplicate back link.
  `SchoolCrest`, `ProgramToggles`, `ProgramSetToggles`, `CategoryToggles`, `OptionGroup`, `SaveToList`, `PrefsNote`,
  `WaveNote` and `skeletons` no longer read `--site-*`. Phase B3 finished the rest.
- **Phase B2 (built).** The school page: `PageHead` with `crest` and `actions`, `SchoolFacts` as wash tiles, and the
  sections as `<nav class="medapp-pills">` of links with `aria-current` (not a tablist; the design-consistency gate
  greps `role="tablist"`, `aria-selected`, `layoutId` and accent underline bars only). Every tab, the charts
  (`.medapp-chart`) and the Interviews practice sub-tab are on `--app-*`; `MedEmpty` is the empty and error panel.
- **Phase B3 (built).** The tracker (with its import, timeline, silence and chance lines), lists, Ask, Practice and the
  rolling and overlap disclosures are on `--app-*` with `PageHead` and paper panels around groups (rows on rules inside,
  `.medapp-list`, `.medapp-item`, `.medapp-subrule`, `.medapp-disclosure`). Form controls are the app's own, in
  `ui/controls/`: `MedButton` (the chip: primary, secondary, ghost, danger), `MedIconButton` (44px round, label is the
  name and the `title`), `MedInput` and `MedTextarea` (`.medapp-field`: 44px, 14px radius, paper, 1px border),
  `MedSearch`, `MedSelect` (the shared Radix select in its `app` tier, so the list portals into `.app-theme`) and
  `MedSwitch` (`role="switch"`, 44px target). They are native elements with the app tier's global focus ring. A page
  uses these, `MedEmpty` and `MedSignedOut`, never the site's `Button`, `Select`, `SearchField`, `Switch`, `Textarea`,
  `PageLayout` or `SignedOutPrompt` (the rules test fails on the import).
- **Status (`ui/status/`).** `status.ts` maps the public `MedEventType` and the tracker milestones onto eight keys:
  acceptance green, rejection red, hold dark blue, secondary light blue, waitlist yellow, matriculation purple,
  interview orange, withdrawn neutral. `StatusIcon` is the round swatch and stroke icon in the status ink (`aria-hidden`
  beside its words), `StatusText` the words in the same hue; colour is never the only cue, the label always prints. The
  public feed's `SECONDARY` is "secondary **received**" (the school sent one), so it reads "Secondary"; only the private
  `SECONDARY_SUBMITTED` milestone reads "Secondary submitted", in the same light blue. `status.test.tsx` reads
  `medschools.css` and holds text at 4.5:1 and icon ink at 3:1 on the paper, the ground and (ink) its own swatch, light
  and dark; none of the mockup's values needed darkening.
- **Matriculating.** `MATRICULATED` is a private tracker milestone, added after `ACCEPTANCE` by the additive migration
  `20261207090000_medschools_matriculated`. Like `SECONDARY_SUBMITTED` it is `SHAREABLE: null`, so share-sync writes no
  event or count for it and no public figure, aggregate or survival curve reads it. It is purple in the member's own
  tracker row and timeline, measured from the acceptance, a closing decision for the chance line, and takes the
  acceptance's cycle rule on import. The live feed shows it only if a source ever reports it (none does).
- **Wash on phones.** The tile is rendered with a 34px blur and blobs 1.3 times larger, and `.medapp-page` sizes it
  `max(100%, 900px)` wide, so a phone shows a centred crop with broad soft blobs; each asset is under 30 KB.

### The system (design polish, owner 2026-11-24)

One spacing scale, one type ramp, one radius family, one control height per context, as `--app-med-*` tokens on
`.medapp-theme` (the head of `ui/medschools.css`) and `.medapp-*` classes. "Human, not AI": restraint, real hierarchy,
few borders, no wall of identical cards, no pill soup, no panels in panels.

- **Space:** 4 / 8 / 12 / 16 / 24 / 32 / 48 (`--app-med-space-1`..`-7`). Gutter 16, 24 from 768px; section gap 24, 32
  from 768px (`.medapp-main` and `.medapp-sections` are flex columns with that gap, so a page writes no `mt-*` between
  sections); panel padding 16, 20 from 768px; a row 12 top and bottom; a heading 12 above its content.
- **Type:** page title 28 (32 from 768px, weight 600), section title 20 (600), body 16, secondary 14 (`.medapp-meta`:
  all help copy, never smaller), meta 13 (row meta, chart text 12-13 inside charts only). Body line height 1.5.
- **Radius:** 10 (`--app-med-radius-sm`: an option inside a group, a step, a note), 14 (`--app-med-radius`: buttons,
  fields, groups, menus), 24 (`--app-med-radius-lg`: panels, charts, tiles); circles only for the round icon buttons and
  the status discs.
- **Controls:** `--app-med-control` is 44px on touch or a phone and 40px with a fine pointer from 768px; a row of
  controls shares it. Buttons are `.medapp-btn` (`MedButton`, `medButtonClass` for a link drawn as one): primary the ink
  fill (one per view), secondary a soft tonal fill (`--app-med-tonal`, the ink at 6%; hover 10%, press 15%), never
  outlined; tertiary a text button with an underline and the tonal hover; danger the tonal shape in the danger colour.
  Icon buttons are `MedIconButton` (round, tonal, the control height; the top bar's are always 44px). Fields
  (`MedInput`, `MedSelect`, `MedSearch`) keep a 1px rule, 16px text (iOS zooms below that) and the select's chevron.
  Labels sit above fields (`.medapp-fieldset`, 14px medium, 8px gap); `.medapp-fields` is two columns from 640px.
- **Choices:** a group of toggles or a single choice is one segmented container (`.medapp-chips`, the tonal well, with
  `.medapp-chip` options; the school's section links are `.medapp-pills` in the same shape): pressed / checked / current
  is the paper fill and weight 600, never colour alone; one line that scrolls sideways when it does not fit. Filters
  with many values are `MedMultiSelect` (a field-shaped trigger that says "All events", "3 types", "MD, MD-PhD" and a
  panel of native checkboxes, in the HTML while closed): `ProgramMultiSelect` and `EventTypeMultiSelect`.
- **Surfaces:** one level of panel. Inside a panel, groups are rules and space (`.medapp-subrule`, `.medapp-group`,
  `.medapp-rows`); a list or prose may sit on the wash with no panel. Empty, failed and signed-out states are `MedEmpty`
  / `MedSignedOut`: centred, a 16px line, a 14px line, one action.
- **Places:** the app's other pages are the top bar's icon buttons and the member's menu (`HeaderActions`). The top
  bar's title is the app's name, "RMH Med Schools"; on the index it is the page's `<h1>` (the index has no title of its
  own) and the left button is a house linking to the site home `/`; every other page has its own h1 and the back arrow.
- **Rows:** the tracker's school rows and the lists' school rows have the name (`.medapp-name`: 600, no underline at
  rest) and meta, and one "⋯" (`MedIconButton`) holding every action (add milestone, edit notes, remove; note, move up,
  move down, remove), so nothing floats beside a row. A tracker school's milestones are `.medapp-steps`: every step the
  same shape (`StepIcon`: the status disc, or a neutral disc for submitted and complete), its words and the date at the
  end. The timeline is `.medapp-timeline`: a 56px date column (tabular), the disc, the words with the wait under them. A
  note is text that opens its editor (`.medapp-notebtn`). The lists reorder from their menus; `SortableList` is not used
  here.
- **Sharing:** the sharing row shows one summary line under the switch; the full privacy wording (all three paragraphs,
  unchanged) is behind "How sharing works" (`.medapp-more`, a native `details`), and stays the switch's accessible
  description.
- **Sources (`ui/SourceRef.tsx`):** a source is one quiet book icon at the trailing end of its heading or value row.
  Hover or focus shows the source on the overlay surface (`AnchoredMenu` as a non-modal dialog), a press or tap pins it
  and focuses "Open source" (a tap never navigates), Escape closes. The full "Source: …" attribution is in the server
  HTML as the button's visually hidden description (the AAMC permission requires it). The link is a deep link:
  `textFragmentUrl` (`engine/text-fragment.ts`, `#:~:text=start,end`) where we hold the page's words, `pdfPageUrl`
  (`#page=N`, the facts DTO's `page`) for an AAMC report. Chart sources are `SourceLinks`: "Sources" and short icon
  links whose accessible name is the full line.
- **Facts copy:** a row never repeats its heading ("Due" under "Deposit") or a word every row shares ("Out of state",
  not "Out-of-state applicants"); related figures share a line ("In-state $X · Out-of-state $Y", "Until Apr 30, 2026");
  a block whose answer makes the rest moot is one line ("Deposit · Not required"); yes / no / case by case is a small
  mark and the word; the DACA report's sentence shows once when it repeats the school's note. Definition rows: a word or
  figure on its label's line, a sentence under it; from 768px the label is a 12rem column.
- **Newest status on the index:** each row is one grid (`.medapp-schoolrow`): crest | the school's words | the status
  words (label in the status colour, the time under it, right-aligned) | the status disc at the far end, every cell on
  the row's centre line (owner 2026-11-24); on a narrow phone the school's words wrap (hyphenated under 360px) and the
  status keeps a readable width. The index column's parts are 16px apart (`.medapp-index`) and its rows 8px top and
  bottom. The newest status (`LatestStatus`) comes from `latest` on `GET /schools` (`latestPublicEvents` in
  `api/read.server.ts`: the live feed's rules, Admit and SDN only, never RMH, the list's program set, the site cycle;
  user-independent). The time is `EventTime`: the server and the hydrating render print the day.
- **The live page's "Today" column (owner 2026-11-24):** on `/med/live` only, `MedApp` mounts `rail/TodayRail` in the
  rail's frame instead of `ActivityRail` (which would repeat the page's feed); every other page keeps the rail. Four
  blocks, each a heading and rows on rules: "Reported in the last 24 hours" (one row per reported type, a toggle that
  sets the page's `type`, `aria-pressed` while it does), "Waves now" (hidden when none), "Most active, last 24 hours"
  (top 5) and, signed in only, "Your schools". The first three are `GET /live/summary` (`api/live-summary.server.ts`:
  the live feed's events, Admit and SDN, never RMH, active schools, the site cycle, `occurredAt` in the last 24 h, the
  `programs` and `state` filters; waves by `schoolWaves`, the live feed's own rule, on today's UTC day); "Your schools"
  joins `me/lists` + `me/tracker` (which schools) with the public list's `latest` (what happened) in the browser
  (`rail/your-schools.ts`). The frame and a skeleton are server-rendered; the summary is a lazy chunk and every query it
  owns is `enabled` only from 1280px, so a phone makes no request for it, an invalidation included.
- **The rail:** its heading, search and the two multi-selects (event types, programs) are sticky inside the rail panel
  (`.medapp-rail-top`) while the list scrolls under them.
- **Live rows (`LiveRow`, owner 2026-11-24):** one component for the live page and the rail (`compact`), so they cannot
  drift: the school's crest (initials without one) with the decision as a 20px status badge on its top-right corner
  (ringed in the paper, `aria-hidden`: the status is written out), the name, the status in its colour, and the time at
  the row's end on its centre line. The live page adds one muted line, program · city, state · source; the rail has
  none. On a phone the live page's time moves under the words.
- **The live signal (SSE, owner 2026-11-24):** the pages refresh when new reports land instead of waiting for a poll.
  Signal only, never data: (1) **publish** — after the worker COMMITS new Admit or SDN events (`commitAdmitEvents`'s
  `newestCreated`, read by `run-admit-live`, `run-admit-history` and, after its transaction, `run-admit-forums`; the SDN
  thread commit in `scrape/sdn/process-thread.ts`, after its transaction; never RMH, whose events are never public one
  by one) it calls `signalNewLiveEvents(newest)` (`live-signal.server.ts`): `{ at }` on the realtime bus, channel
  `rt:medschools:live` (`createBus('medschools')`, key `live`), at most one per 5 s per process (the first at once, a
  burst as one trailing signal), and only when the newest created event is under 7 days old (a backfill of old events
  cannot change any page's head). It never throws; without Redis the bus is in-process and nothing reaches web (the
  compose file gives the worker web's `REDIS_URL`). (2) **stream** — `app/routes/api/medschools/live/stream.ts` over
  `api/live-stream.server.ts`: `auth: 'none'`, no session read, `text/event-stream`,
  `Cache-Control: no-store, no-transform`, `X-Accel-Buffering: no`; `retry: 15000` first, `event: new` / `data: {}` per
  signal, a `: ping` comment every 25 s (below Cloudflare's 100 s idle limit and Apache's `ProxyTimeout 300`), a
  self-close after 30-35 min; at most 2000 streams per web process (503, `Retry-After: 120`) and 32 per address (429,
  `Retry-After: 60`; a campus shares one), answered before subscribing; every exit (abort, cancel, failed write,
  lifetime) unsubscribes and frees the slot. (3) **client** — `ui/useLiveSignal.ts`: ONE `EventSource` per tab (a module
  singleton), open while some consumer is mounted and enabled and the document is visible; closed on hidden and on
  `pagehide` (bfcache), reopened on visible / a persisted `pageshow`, and a reopen after any gap invalidates once
  (signals may have been missed). Consumers: the index (`IndexPage`, every width), `useLiveFeed` (the live page's list;
  the rail's `RailFeed`, mounted only from 1280px) and `TodaySummary` (`enabled` only from 1280px). On `new` it
  invalidates `['medschools','live']`, `['medschools','live-summary']` and `['medschools','schools']` (the index's
  `latest`), debounced 2 s plus up to 3 s of jitter, one refetch per window. React Query refetches only ACTIVE queries,
  and a disabled or unmounted one is not, so at 390px only the page's own list refetches and the rail makes no request
  (checked in a browser). New live rows take `useLiveFeed`'s arrival fade; a refetch keeps the rows (same key: no
  placeholder, no skeleton, no scroll change); an index row's status changes in place. Polling stays as the fallback: 60
  s without the stream, 5 min while it is connected (a safety net for a signal lost in transit; the signal is how news
  arrives, and 60 s polls from every open tab are the load the stream replaces). A refused stream (429 / 503) is retried
  after 1 min, doubling to 10, polling meanwhile. No `EventSource` on the server render. Apache needs no SSE rule:
  `mod_deflate` compresses only its listed types (not `text/event-stream`), and the feed's SSE works through the same
  `ProxyPass /`.
- **Event times (`EventTime`, owner 2026-11-24):** every short event date (the index's newest status, live and rail
  rows, the tracker's steps and timeline) is a focusable `<time>` that shows the exact time on hover, focus or tap, in
  the viewer's own zone ("Tue, Nov 24, 2026, 3:42 PM EST"). The server does not know that zone, so the tooltip is built
  after hydration and the HTML has no server-zone string. A day-only event (`isDayOnlyEvent`: Admit or SDN at exactly
  00:00 UTC, the arrivals rule; a tracker milestone) shows the full date in UTC and "No time reported", never an
  invented time. Inside a button (a tracker step) it is a `title` only. Pure parts in `ui/event-time.ts`.
- **States (owner 2026-11-24):** the index and the live page filter several states at once (`StateMultiSelect`:
  "California (CA)", sorted by name, a filter field, "All states" / "CA, NY" / "5 states"). `?state=CA,NY` is a sorted
  comma list (`parseStates`, at most `MAX_STATES` = 10), an old single code still parses, none is every state. The
  schools and live readers take the same list, each code checked against `HOME_STATE_CODES`, deduped and sorted. The
  home-state preference stays single.
- **Multi-selects on a phone:** under 640px the panel is a full-width sheet under its toolbar (absolute, never fixed)
  with a 16px filter field where it has one and a Done button.
- **Loading (owner 2026-11-24):** once a school page has its school, `ui/prefetch-tabs.ts` fetches the other tabs'
  public queries in the background (one wave per school and program, at idle, one request at a time; skipped under
  Save-Data, Data Saver, 2G or offline; never `me/**`, never a model call). The school's public queries are fresh for 5
  minutes and kept 30 (`schoolScoped`). A same-page change (`cause: 'stay'`) reads the cached prefs in `loadPrefs` and
  never waits on the private request. The router already preloads on intent (`app/router.tsx`).
- **Settings change in place (owner 2026-11-24):** every `navigate()` first calls `holdScroll()` (`ui/hold-scroll.ts`:
  the site's `useScrollRestoration` would otherwise read the new href as a fresh navigation and scroll to the top) and
  passes `replace: true, resetScroll: false`; the section body (`.medapp-tabbody`) is at least a screen tall, so a
  shorter section never clamps the scroll; the section links `resetScroll={false}`; the filtered queries keep their
  previous answer while the next loads (`placeholderData`: `keepPreviousData`, or `keepWithinSchool` so another school's
  figures never show), dimmed by `SkeletonSwap`'s `stale` (`.medapp-stale`, opacity, `aria-busy`), never a skeleton; the
  loaders do not wait on a search change (`waitUnlessStay(cause, …)`: `cause: 'stay'`), so the router's pending frame
  never replaces the page. The live feed keeps one list across filter changes (`useLiveFeed` replaces its rows when the
  new filter's first page lands). `ui/keep-place.test.ts` holds the static half.

## The read rules (`engine/public-read.ts`, pure and client-safe)

- **k floor (spec §6):** `K_FLOOR = 3`. RMH tracker count rows are dropped when `contributors` is null or under 3 (fail
  closed); other sources show as published (their `contributors` is null today). An in-state/out-of-state split is
  returned only when both sides are at least 3; `MedSchoolStats` rows with `residence != GLOBAL` follow the same floor.
  The live feed excludes `source = RMH` entirely. **Tracker figures update once a day (phase 4, Q2):** a public read of
  an RMH row uses `publishedCount` / `publishedContributors` only (`publicCell` in `engine/public-read.ts`, `floorWhere`
  and `publicSum` in `api/read.server.ts`); null published (never published) means absent, and the k floor applies to
  `publishedContributors`. The live `count` / `contributors` follow the tracker and are never public. The daily job
  `medschools.rmh-publish` (00:05 UTC, `scrape/run-rmh-publish.ts`, an exclusive pg-boss queue in
  `server/medschools-worker/`, last run persisted in `MedSourceRun`) copies live to published for every RMH row in one
  statement and deletes rows whose live count is 0 (the writer keeps those at 0 so a cell never vanishes mid-day). Why:
  a back-dated milestone changes a PAST cell, so a date hold-back alone would reveal who just shared. Cells dated today
  (UTC) or later are still dropped (`applyKFloor`, `floorWhere(now)`). **Turning sharing off (or deleting a milestone)
  removes the event at once but leaves the public totals until the next daily update.** The share-sync reconcile never
  writes `published*`; only the job does.
- **What the anonymity claim is:** the public pages and the `med_cycle_event` / `med_cycle_count` tables alone link to
  no one (random UUID ids, a hash recomputed from the server secret, `ingestedAt = occurredAt`). Someone with access to
  the database can still match shared figures against the private tracker tables in the same database. Do not write it
  stronger than that.
- **Never sum sources (spec §10):** the primary series per school x program x cycle x event type is the first present
  source in `PRIMARY_ORDER` (CycleTrack, Admit, SDN, RMH, MDApplicants), after the floor. Others are comparison series.
  Every chart says "Reported events" and names its sources; reported events are never called applicants.
- **Programs (O5):** `ProgramFilter` is `ALL | REG | PHD`; "All" sums REG + PHD **within one source** per day. A school
  shows only its own degree's options (an MD school never offers DO). Null-program events are in no series, total or
  chart: a muted line counts them, the live feed labels them "Program not reported".
- **Explicit `select` on every Prisma read.** `inState`, `dedupeHash`, `ingestedAt` and `MedSdnThread.cursorPostHash`
  are never selected; attribution links point at a school page or a thread, never a post. A live row is
  `{ id, eventType, program, school, occurredAt (minute), source }`; the key set is pinned by the black-box test.
- **Dates are UTC calendar days** (`@db.Date`); format with `formatUtcDay`, never the viewer's zone.
- **Source attribution (O3):** "Source: CycleTrack", "Source: Admit.org", "Source: Student Doctor Network", each linking
  to the school's page on that source where a URL is known (`api/source-links.ts`, names in `SOURCE_NAMES`).

## Charts (`engine/chart-geometry.ts`, `ui/charts/`)

React SVG, server-rendered (the charts are in the HTML with scripting off). **Owner O7 (2026-11-23)** supersedes O2's
ink-only style for these pages; Steel §18 D13 carries the note, and D10 stays open for the rest of the site.

- **Colour (O7.1; status colours, owner 2026-11-24).** A category draws in its STATUS colour: `CATEGORY_COLOR` in
  `ui/charts/chartColors.ts` is `var(--app-med-<stem>-text)` (the stem from `ui/status/status.ts`), the token the row's
  status words use, and its bar body is `var(--app-med-<stem>-fill)` (`fillOf`), so a category's line, bar and legend
  swatch match its row icon everywhere (acceptance green, rejection red, hold dark blue, secondary light blue, waitlist
  yellow, interview orange, matriculation purple, withdrawn neutral). Sources (per-type charts: CycleTrack 1, Admit 2,
  SDN 3, RMH 4, MDApplicants 5) and History cycles (newest first 1..5) are a different concept and keep the slots
  `--app-med-chart-1`..`-5`. `charts.test.tsx` holds both from `medschools.css`: every slot and every category colour at
  least 3:1 on paper and ground in both modes, and every category with a fill. A component never writes a hex. Dash and
  weight stay as the secondary cue. Text is always `--app-text` / `--app-text-muted`. The dataviz validator's contrast
  check passes; its chroma, dark-lightness and CVD checks do not for these status hues (see "Phase B2 as built" in the
  redesign plan).
- **Card and legend (O7.2).** `ChartFrame` is a paper panel (`.medapp-chart`: `--app-surface`, 1px `--app-border`);
  caption, legend, plot, native `<details>` table. A legend (`ChartLegend`: a line swatch per series) is present for two
  or more series; the Activity category legend IS the toggle row (`CategoryToggles` passed as `legend`: aria-pressed
  buttons in a `role="group"`, each with its swatch, the swatch dimmed when off, at least one stays on). There are no
  end labels. The daily bars have their own category toggles (solid block swatches, `bars`).
- **Tween (O7.3).** `tween.ts` (pure, injected scheduler) and `useTween.ts`: the y scale moves from the old to the new
  top in 280 ms, ease-out (`easeOutCubic`), when a toggle, program or source changes it. Lines, bars and gridlines
  follow the animated scale (`yTicksTween`: shared ticks stay, new ones fade in, old ones fade out); an interrupted
  tween continues from where it is drawn. The server render and first client render return the target as is, one frame
  is requested at a time and the last requests none (the `useTween.ts` entry in
  `lib/__tests__/raf-loop-allowlist.test.ts`), and `prefers-reduced-motion: reduce` makes it instant, which is M7's rule
  applied to this tween and nothing more. A clip keeps a mid-tween line inside the plot.
- **Zoom and pan (owner 2026-11-24).** The five time charts pass their x `domain` to `ResponsivePlot`, which keeps a
  view over it (`engine/chart-zoom.ts`: `zoomView`, `panView`, `clampView`, a 7-unit minimum) and hands it to `render`
  and the probe's `x`; DailyBars zooms over its day indexes. Zoom: the three buttons over the plot (shown once
  hydrated), `+` / `-` / `0` on the focused plot, a pinch or ctrl / cmd + wheel (a non-passive listener bound in the
  wrapper's ref callback; a plain wheel scrolls the page). Pan: a mouse drag or two fingers once zoomed; one finger
  still scrubs the probe (`touch-pan-y`). The view is component state, so a toggle or a setting keeps it. No charting
  library: the SVG stays server-rendered and nothing is added to the bundle.
- **Zero start (O7.4).** `withZeroStart` prepends a 0 at the cycle's first day (or the first report, if earlier) to
  every cumulative series, History included.
- **Probe (O7.5).** Hover, touch or focus on the plot (`ResponsivePlot` in `ChartFrame.tsx`): a crosshair at the nearest
  stop (`nearestIndex`), a dot per series, and a tooltip with the date and each visible series' value and swatch on
  `surface-overlay` (it flips and stays inside the card). The plot is a focusable `role="group"` named by the summary;
  Left/Right (and Home, End, PageUp, PageDown, Escape) move the crosshair, and the tooltip is a `role="status"` while
  the keys drive it. Touch scrubs horizontally (`touch-pan-y`) and a tap outside clears it.
- **Dates (O7.6).** History aligns cycles by calendar: `calendarX` maps a date to days after June 1 on a reference
  calendar (so Jun 1 of every cycle is x 0, equal month-days agree across leap years, earlier days are negative), the
  axis prints "Jun 1", "Aug 15" (no year), and a series is named by its cycle ("2026\u20132027").
  `HistoryCycleDto.dayZeroOn` carries each cycle's own day zero. There is no "days since cycle start" anywhere.
- **Button groups (O7.7).** `OptionGroup` is a single-select `role="radiogroup"` of `role="radio"` buttons (roving
  tabindex, arrows move and select and wrap, left and right swap in RTL, wraps on a phone, `Button` styles so 44px on
  touch): Activity's category, History's category and source. It filters, it does not navigate, so it is not `Tabs`;
  `design-consistency.test.ts` did not need to change for it. `ProgramToggles` is the school page's program control, a
  multi-select pair for the school's own degree; the URL param stays `ALL | REG | PHD`. `ProgramSelect` and
  `DegreeProgramSelect` remain for the index and live pages.

The first Activity chart is `CategoryLines` with `CategoryToggles` (O4: `?show=`); then `DailyBars`, stacked bars per
day for several categories at once (owner 2026-11-24: its own `CategoryToggles`, `?daily=interview,acceptance` in
canonical order, absent = every category and dropped from the URL, a single value still parses; each category from its
own primary source, stacked in `CATEGORY_ORDER`; the readout lists each category's count and the total, and "Show data"
has a column per category plus Total); then the `OptionGroup` for one category (`?type=`) and its `CumulativeLine`
(per-source colours), then a native `<details>` table. Each chart is wrapped in `dir="ltr"` so the time axis stays left
to right in `ar`. Each width gets its own viewBox (phone 252, mid 420, wide 640 units: the phone one is sized so a 320
px phone shows it at about 1:1 inside the card), all rendered, CSS shows one.

**d3 containment:** only `engine/chart-geometry.ts` imports `d3-scale` / `d3-shape`; only `ui/charts/*` imports that;
only page components import `ui/charts`. Route files must not (`ui-rules.test.ts`), so d3, zod and the charts stay in
the lazy page chunk. `scripts/check-entry-composition.ts --strict` has tripwires for both; `validateSearch` is
hand-rolled (`engine/search.ts`) because zod is forbidden in the entry.

## School crests

`public/images/medschools/crests/<slug>.webp` (96x96) are downloaded once from Admit's `crest_url` by
`scripts/medschools/fetch-admit-crests.ts` (`scrape/crests.ts`), committed as static files and listed in
`data/medschools/crests.json`. The site never calls Admit for an image at request time. `engine/crests.ts` looks one up;
`ui/SchoolCrest.tsx` draws it (a school with no crest draws nothing).

## Ingest changes that affect what the pages show

- **SDN timing (13aca4241):** an SDN event reported the day it was posted ("got an II today") takes the post's own
  timestamp, so the live feed's "time ago" is the post time. An earlier stated date stays a calendar day (UTC midnight).
  Dedupe and count cells still key on the day.
- **SDN dedupe (f576b1169):** one SDN member counts once per event type per school per cycle: events key on
  `hash(author:<member>:<school>:<cycle>:<type>)`, the member id read from the post header and hashed with the dedupe
  secret inside the `eventKey` closure, so nothing person-shaped crosses the adapter boundary. The first report wins.
  Posts with no member id keep the per-post key.
- **Admit member dedupe and the whole-cycle backfill (owner 2026-11-23).** The live feed is only ~6 h deep, so Admit
  data was thin. Every Admit event now keys on `hash(admit:author:<user id>:<schoolId>:<cycleYear>:<eventType>)` (the
  dedupe secret, inside a closure in `adapters/admit/client.ts`; the id never leaves the adapter and is never stored),
  so one member counts once per type per school per cycle whichever path saw it first: the live feed or the
  profile-history backfill (`scrape/run-admit-history.ts`, queue `medschools.admit-history`). A feed row with no author
  keeps the per-update key. **First report wins, earliest day kept** (`scrape/admit-events.ts`, `replacesTime`): when a
  later sighting of an existing key falls on an earlier calendar day (UTC), the stored date moves back; a smaller
  timestamp on the same day never does (a profile-history date is day-only, stored at UTC midnight by the adapter, and
  must not displace an exact live-feed time; on the same day an exact time replaces a midnight). Arrivals leave out
  ADMIT and SDN events stored at exactly 00:00 UTC (day-only), so the live feed's own exact times still count. When it
  moves, the roll-up re-rolls both days; the roll-up now deletes a cell whose events are gone, so a moved event is never
  counted on two days (the key holds the cycle year, so a move never changes cycle). A stored event with no program
  takes the program a later sighting resolved. The history job discovers members from `getAllCycleResults` (each status
  filter, paged, user id only), fetches each unseen member's profile (`md_phd` plus the history's school slug and
  secondary/interview/decision dates, nothing else), maps every entry to an event (SECONDARY, INTERVIEW, and the
  decision as ACCEPTANCE/WAITLIST/REJECTION/WITHDRAWN/HOLD; a decision with no date or an unknown decision is counted,
  never guessed) with `cycleYearOf` and the alias matching, and rolls up. The live feed ingests the history of any
  member it meets for the first time from the lookup it already made. Progress is `MedAdmitMember` (a keyed hash of the
  member id, a different HMAC input from any event key, plus DONE/FAILED and attempts; pruned after 400 days); the raw
  id lives in memory for one run, discovery is repeated each run, and DONE members are skipped, so a deploy resumes.
  Three failed lookups park a member for a week.
- **One-time ADMIT re-key (`scrape/admit-rekey.ts`).** Old ADMIT rows used the per-update key and would be recounted by
  the backfill. Before the first live write under the new key and before the first history run, `ensureAdmitRekey`
  deletes every ADMIT `MedCycleEvent` and ADMIT `MedCycleCount` cell (an ADMIT cell holds nothing but its events) and,
  in the same transaction, every `MedAdmitMember` progress row and `MedAdmitForumThread` cursor (progress that says
  "already read" would otherwise stop the events refilling: a DONE member is never re-fetched, a caught-up thread never
  re-read), and records a `MedSourceRun` (job `admit-rekey`, status OK) as the done flag, inside that transaction too.
  At most once; a failed attempt is retried and the Admit event jobs write nothing until it succeeds. Mention it in the
  PR text: public Admit series are empty until the feed and the backfill refill them (the first history run is queued at
  worker start).
- **Politeness budgets (owner 2026-11-23).** The history job uses `backfillSpacingMs` 3 s plus 0-1 s random jitter
  (`createPoliteHost` takes `jitterMs`; live sessions keep their spacing); the SDN forums host is 3 s plus jitter for
  every session. Every host has a persisted DAILY request budget (`scrape/request-budget.ts`, `MedRequestBudget`, UTC
  day, retries and robots.txt included) shared by all its jobs; spent budget halts the session (`BudgetExhaustedError`)
  and the job ends PARTIAL until the next UTC day. The history job also has its own daily quota of profile lookups
  (default 600). Env overrides are in `.env.example`.
- **Admit school forums (owner 2026-11-23, `scrape/run-admit-forums.ts`, queue `medschools.admit-forums`, every 3
  hours).** From June 1 through August 31 the run lists and reads the previous cycle's threads too (`forumYearsFor`:
  decisions roll over only on September 1), inside the same per-run request cap. Admit's school forums are a native
  thread per school per cycle (GraphQL `getAllSchoolThreads` and `getSchoolThread`, oldest first; findings in the
  endpoint inventory). The job lists every thread's post count (three requests), and reads a thread only from its
  persisted cursor (`MedAdmitForumThread`: `cursorOffset` plus a keyed hash of the last post, read one post early as an
  anchor; no text, author or id stored). Rules a reader of the data depends on: (1) a post mirrored from SDN is skipped
  (`isSdnMirror` in `adapters/admit/forum.ts`; Admit has no source field, so it is a fail-closed content-and-shape
  check) because SDN already counts it; (2) a native post's events key on
  `hash(admit:author:<user id>:<schoolId>:<cycleYear>:<type>)`, built by `adapters/admit/member-key.ts` which the feed
  and the history now share, so one member counts once per type per school per cycle across the tracker, the history and
  the forum (the writer is `admit-events.ts`: first report wins, earliest date kept, a known program is kept); a post
  with no author id (anonymous, deleted) falls back to a per-post key; (3) program is the SDN text rule (MD unless the
  post says MD-PhD), no profile lookup per author; (4) the model runs off-peak only: at peak the run lists the threads
  and persists their counts (the count past the cursor is the held state, nothing is stored or fetched twice) and the
  next off-peak run reads them; (5) its own AI share (`admit-forums-budget.ts`, label `medschools-extract:admit-forums`,
  default 40% of `MEDSCHOOLS_AI_MONTHLY_USD`); (6) the Admit host budget default is now 3500 (the forums add a 600/day
  quota of their own). Tests: `forum.test.ts` (the adapter boundary), `run-admit-forums.test.ts` (hostile fixtures:
  names, ids, SDN mirrors, quotes, injection), `admit-forums-budget.test.ts`.
- The SDN live queue runs daily (SDN forum activity is slow); AI extraction is capped monthly. Detail:
  `server/CLAUDE.md`.

## Statistics, the Forecast tab and the personal chance (phase 5)

Model and privacy first, then the UI. The plan's decision numbers (D1-D12) and rulings (R1-R12) are in
`docs/superpowers/plans/2026-11-23-rmh-medschool-phase5-forecast.md`.

- **One floor.** `engine/floor.ts` (`floorWhere`, `publicSum`; pure, no Prisma) is the only definition of what is
  public; the readers and the forecast job both import it, and `run-forecast.ts` is pinned to read counts only through
  it. A band fitted on a looser floor would publish an unpublished or sub-k RMH figure.
- **The model (D3, D4; `engine/stats/`, pure, server-side only; `stats-boundary.test.ts` keeps it out of the client
  graph).** Fitted **per program to the primary series, never summed** (REG and PHD; `ALL` on the page reads REG, D12).
  Day `d` is days since the cycle's `dayZeroOn`; the fit sees counts through yesterday UTC (`asOf`, a partial day biases
  the share down). For up to 4 earlier cycles of the same source with a season total of at least 10, the share of the
  season reported by day `d` is weighted `0.5^k` (newest first, renormalised). FULL (weighted share at `asOf` at least
  0.05): the implied total is the count so far over that share; 600 draws with a stratified cycle choice and a Poisson
  remainder, paths `C + R * q(d)`, per-day p10/p50/p90, a summary of the total and the day half of the invites are in
  (`halfDay`). EARLY: the same with the cycle's own total as the Poisson mean and p10/p90 widened 1.5x around the
  median. NONE: no band, the row still exists. A seeded `mulberry32` (`fnv1a` of school, program, type, cycle, `asOf`)
  makes a re-run the same day change nothing. Constants: `engine/stats/constants.ts`, `MODEL_VERSION` 1.
- **The job** is the queue `medschools.forecast` (`FORECAST_CRON`, 06:40 UTC, `MEDSCHOOLS_FORECAST_CRON`; no flag, no
  secret, no model call; detail `server/CLAUDE.md`). It writes `MedForecast` (one row per school, program, cycle and
  type; rows for finished cycles stay, a record of what was predicted, D11) and then `MedWaitCurve`.
- **`MedWaitCurve` is precomputed by the worker (D7).** A request that computed the curve would read other members'
  `COMPLETE` and `INTERVIEW` rows inside a per-user handler (one bad `where` and a stranger's row is on the wire), a
  member back-dating a milestone could move a curve a neighbour is looking at (the once-a-day publish closes only
  same-day differencing; R13 closes the rest), and the scan would be O(all tracker rows) per view. The row holds
  `members`, `invited`, `maxDay` and `{ t, s, n }` steps (`n` = members at risk at the step); nothing about one
  contribution.
- **R13: the curve is coarse (privacy review).** Times are whole weeks (`7 * ceil(t/7)`, `binObs`) before Kaplan-Meier,
  so steps sit only at multiples of 7; `maxDay` is the last week with at least 10 members at risk (`KM_MIN_AT_RISK`),
  and `inviteChance` is null for a target past it (which also puts 10 at risk at the caller's week); the request maps
  `elapsed` to its week and the horizon to whole weeks, so every day of a week has one answer. No curve with fewer than
  10 invite events (`KM_MIN_INVITES`) on top of 20 members. `runWaitCurves` replaces a stored row only when invites or
  members moved by at least 3 (`KM_REFRESH_DELTA`, `worthRefreshing`); a row is CREATED only at 23 members and 13
  invites (`KM_CREATE_MEMBERS`/`KM_CREATE_INVITES`, `worthCreating`: hysteresis, so delete-below-20-then-recreate-at-20
  cannot yield a figure one member from the last); below any floor the row is deleted at once, and a row in an older
  shape is rebuilt. The chance is rounded to the nearest 5%, the basis down to 10. An end date before COMPLETE drops the
  observation; a COMPLETE in the future is status `not-complete-yet`. All constants in `engine/stats/constants.ts`.
- **Each category ends on its own day.** `cycleEndOn(cycleYear, type)` is the day before `cycleYearOf` rolls the type
  over: secondaries May 31, interviews June 30, decisions (acceptance, waitlist, rejection) August 31. The forecast job
  draws each category to its own end, so the path, the total and `halfDay` match the implied total; the response's
  `endOn` is the category's, and the chart's x axis follows the stored band.
- **The observed line and the band agree.** `getForecast` cumulates the live series through the row's `asOf`; when a
  source revised past days since the job ran, the band (and the total) shifts by the difference, never below what is
  observed.
- **Live and Activity waves agree.** Both read REG + PHD summed, the primary source chosen over the whole cycle; the
  live feed reads the page schools' cycle rows from the cycle's first report (a window would miss a burst after a quiet
  spell).
- **Opt-in, and 20 distinct members (D5, D6, R1, R4).** Only cycles with `shareAnonymously` feed the curve; a pair with
  fewer than 20 distinct members with a valid observation has no row (a member with two cycles counts once). The basis
  shown is rounded down to a multiple of 10 so it does not reveal each new member. Every signed-in member sees the
  chance, sharer or not (R2); the sharing switch's copy says the wait between complete date and invite feeds an
  aggregate.
- **Per-event sources do not enter the curve (D9).** An Admit, SDN or RMH event has no person and no complete date;
  joining events to people is exactly what spec section 6 forbids. The engine's input is `{ days, event }` per
  observation, so a future source that carries pairs needs no model change.
- **Waves (D10).** A day of the INTERVIEW primary series whose count is more than 3x the median of the previous 14 days
  (zeros included), at least 5, with 7 previous days of data. Today's partial count is included.
- **Endpoints.** The public ones are now eight (`schools/$slug/forecast` joined) and `SCHOOL_TABS` has four tabs (six
  now, with Secondaries and Facts). Private: `me/chances`, which is one more `me/**` route, signed in, never cached, no
  id parameter.

## The Forecast tab, waves and the personal chance (phase 5, UI and endpoints)

A school tab is four edits, not one: the id in `SCHOOL_TABS` (`engine/public-read.ts`, which `parseSchoolSearch` reads),
a query factory and the loader's prefetch branch in `medschools.queries.ts` (so the chart is in the server HTML), a
label and a branch of the switch in `ui/SchoolPage.tsx` (the strip comes from `SCHOOL_TABS`, the body does not), and the
tab component in `ui/`. The Forecast tab is `ui/ForecastTab.tsx` with `ui/charts/ForecastBand.tsx`.

- **Endpoints.** Public `GET schools/$slug/forecast` (`getForecast` in `api/read.server.ts`: the stored `MedForecast`
  row plus the floored observed series cumulated through the row's `asOf`; `ALL` reads REG; status
  `ready | early | no-history | no-data | pending`). Private `GET me/chances` (`api/chances.server.ts`: the caller's own
  applications from `getTracker`, one `MedWaitCurve` row per school x program, no id parameter, never cached).
- **Chart.** The observed line is the category's colour, solid 2px; the median is dashed 2px; the 10th and 90th
  percentiles are 1px dotted boundaries; nothing is filled or translucent (R1). The x axis is calendar dates, the y axis
  starts at 0 and tweens. `ui/charts/charts.test.tsx` holds the markup.
- **Waves.** `waves` on the Activity response and `wave` on live rows come from `engine/stats/waves.ts` (server only).
  Ticks sit on `CategoryLines` (only while Interview is on) and `DailyBars` (Interview only); `WaveNote` is the
  non-visual reading; a live row says "Part of a wave".
- **The chance** shows on the tracker (`tracker/ChanceLine.tsx`, one query for the cycle under `ME_KEY`) and under the
  Forecast chart (`SchoolChances.tsx`, which passes the site cycle the tab shows, not the newest tracker cycle). It is
  an addition: signed out, loading or failed, the page is whole without it.

## Timeline and silence check (roadmap item 4)

Plan: `docs/superpowers/plans/2026-11-24-rmh-medschool-timeline-silence.md`. On the tracker page, no new endpoint.
`engine/timeline.ts` (pure, client-safe): `buildTimeline` turns the caller's own `TrackerApplicationDto` rows into one
dated line with each step's wait since the step before it; `silenceOf` reads a `ChanceDto`. `getChances` now also
returns `waitingWeeks` and `typical` (`halfWeek`, `mostWeek`, `lastWeek`, `basis`), derived from the one `MedWaitCurve`
row it already read by `typicalWait` (`engine/stats/km.ts`): the first week the invite share reaches 50% and 80% of its
value at `maxDay`, nothing read past `maxDay`; null when no step is in range. No new aggregate, the R13 floors
unchanged. A school with no curve says "Not enough shared data for this school yet" and is never compared. UI:
`ui/tracker/Timeline.tsx`, `SilenceLine.tsx` (under each row, above `ChanceLine`).

## AI Q&A (phase 6)

`/med/ask` and a panel at the foot of every school page (signed in; signed out the page is the sign-in prompt and sends
nothing). Plan: `docs/superpowers/plans/2026-11-23-rmh-medschool-phase6-ai-qa.md` (rulings R1-R19).
`POST/GET /api/medschools/me/ask` (`api/medschools.me.ask.server.ts`), never cached.

- **Two model calls, one task (R2, R3).** `runTaskJson` under the `medschools-qa` `AiTask` (`lib/ai/provider.server.ts`,
  prompts `MEDSCHOOLS_QA_ROUTE` and `MEDSCHOOLS_QA_ANSWER`): route (`{intent, schools, cycle, filters}`, temperature 0),
  then answer (`{segments:[{text, cites}], thin}`). The model names schools as written; the server resolves them against
  the active schools (`engine/qa/route.ts`). An unresolved school or intent `other` ends before the second call. The
  runner is a seam (`api/qa/runner.server.ts`) so every test scripts the model.
- **Retrieval only through the public readers (R5, R6).** `api/qa/retrieve.server.ts` calls `getSchool`, `getActivity`,
  `getHistory` and `getForecast`, so the one floor (`K_FLOOR`, the daily RMH snapshot, in-state splits) and the
  primary-source rule are inherited, never re-implemented. It imports no tracker module and no user id
  (`retrieve.server.test.ts` pins it). A fact's `updatedAt` is the source's last successful run for a count (the
  citation says "source refreshed"), `fetchedAt` for a profile, `computedAt` for a forecast; unknown stays unknown.
- **The validator is the guarantee (R7, R17).** `engine/qa/ground.ts` keeps a segment only when every cite is a
  retrieved fact, it cites at least one, every number in it is in a cited numeric fact, it holds no link, bare domain or
  markup, and a segment citing only forum text (`untrusted`) holds no number. A number is every maximal digit run
  whatever precedes it (CJK and Arabic glue digits to letters; `engine/qa/numbers.ts`), digits normalised, percents
  (`%`, `percent`, `per cent`), `k`/`m` suffixes and a leading minus part of the token, dates, years, ranges; and a
  spelled-out number (`engine/qa/number-words.ts`: English parsed to its value, "a dozen", "half";
  es/fr/pt/ru/ar/hi/zh/ja listed best-effort as unverifiable, so those sentences are dropped). Bidi and zero-width
  characters (`\p{Cf}`) are removed from the sentence before it is checked and shown; lookalike dots (`。` `．` `﹒`
  `[.]` `(dot)`, `evil . com`) count as dots for the domain check. A sentence citing facts of several schools takes a
  number only from a cited fact of a school it names (`schoolNames`). **What it does not guarantee:** that digit-free
  prose is true. A sentence may paraphrase member-reported text (interview questions, feedback, the profile's style and
  length notes, all `untrusted`), because that is what such an answer is; the page says members wrote it and RMH checks
  figures, not words. Dropped segments are not repaired or re-asked: `notice: 'removed-ungrounded'`, and nothing left is
  `no-data`. No derived figures: a computed number is simply not found.
- **Injection (R8).** Facts reach the model only inside `asData(...)`; forum text is cleaned again (`cleanForPrompt`),
  capped and flagged untrusted. A model that obeys planted text still produces nothing the validator keeps
  (`testing/integration/medschools-ask.test.ts` proves it end to end with a fake provider).
- **My chance (R4).** Only on a `my-chance` question: the server runs `getChances(userId, ...)` for the resolved schools
  and returns the rows as `mine`; the model never sees a milestone, date or percent from the tracker. `mine: []` means
  no application; `mine: null` with `notice: 'mine-unavailable'` means the read failed (R18); the UI renders it through
  `ChanceLine` even when the answer is thin. This is the one personal read in `me/**` that is not an aggregate of
  tracker rows, and it reads only the caller's own.
- **Ceilings (R9-R11, R18), in this order before any model call.** Rate limit `ai` 6 per minute per user;
  `isAiConfigured` (503 `AI_UNAVAILABLE`); the shared gate (503 `MEDSCHOOLS_QA_PAUSED`: Q&A may spend
  `MEDSCHOOLS_QA_AI_SHARE`, default 0.25, of `MEDSCHOOLS_AI_MONTHLY_USD`; the scrape gates get the rest,
  `features/medschools/ai-budget.ts`); `assertAiBudget` (402); then the atomic reservation (`reserveQuestion` in
  `api/qa/budget.server.ts`): one transaction under `pg_advisory_xact_lock` on the member writes a `medschools-qa-ask`
  row (the day's count, the tier's cap since UTC midnight, below: 429 `MEDSCHOOLS_QA_DAILY_CAP`) and a
  `medschools-qa-lock` row (the in-flight lease, 120 s since R20, deleted when the question ends: 429
  `MEDSCHOOLS_QA_BUSY`). Both are zero-token, zero-cost, text-free `AiUsage` rows, so the cap and the lease hold across
  every web process and do not depend on the provider's metering write. Any ledger error fails closed (503 paused,
  unavailable). The one thing a lost provider metering write can still do is under-count spend (it is logged by
  `meter`); the daily count cannot slip. The whole question has a 50 s deadline (`QA_DEADLINE_MS`, under the client's 60
  s `AI_TIMEOUT_MS`) plus the request's own `signal`; both model calls take it and never retry. The web tier needs
  `DEEPSEEK_API_KEY`.
- **Think it through (R20).** `think: true` in the ask body (optional) switches DeepSeek thinking on for the **answer
  call only** (`runTask` option `thinking`, same `medschools-qa` task and JSON mode; the route call stays flash). Only
  `message.content` is read: the reasoning text is dropped inside the provider and is never returned, stored, metered or
  logged (it is ungrounded, so it would bypass the validator); the response carries `thinking: boolean` and the page
  says "Thought for N s" (the question's own wall time, measured in `askRun`). `MEDSCHOOLS_QA_THINKING` (default on)
  gates it and `GET me/ask` returns `thinkingAvailable`. Deadlines: whole question 90 s (`QA_THINK_DEADLINE_MS`, answer
  call gets the remainder through the shared signal and a 90 s request timeout), the client's per-call timeout 97 s
  (`QA_THINK_CLIENT_TIMEOUT_MS`; `AI_TIMEOUT_MS` is unchanged), the lease (member and admin) 120 s (`QA_LEASE_MS`). Both
  stay under Cloudflare's 100 s cut of a proxied request, so a long think ends in the app's own refusal, not a 524.
- **Limit tiers, the admin bypass and limit requests (R19).** The daily cap depends on the caller's tier, resolved on
  the server per request by `resolveQaTier` (`api/qa/budget.server.ts`): **admin** is the session's `isAdmin` (the
  `defineHandler` ctx field, the same flag `auth: 'admin'` checks), **member** is `getUserTier(userId) !== 'free'` (the
  Stripe subscription or a gift membership, the source `assertAiBudget` uses; automatic, highest after admin),
  **approved** is an `APPROVED` `MedQaLimitRequest` row, else **free**. Caps: free 25 `MEDSCHOOLS_QA_DAILY_CAP`,
  approved 40 `..._APPROVED`, member 100 `..._MEMBER` (invalid closes that tier). An admin skips the daily cap, the
  one-in-flight lease, the 6 per minute rate limit (`rateLimitExemptAdmin: true` on the ask `POST`) and the member's own
  monthly allowance, and writes no daily-count row; the shared monthly pause (R11) still applies, and so does a ceiling
  of 3 questions in flight per admin (`QA_ADMIN_MAX_IN_FLIGHT`, `medschools-qa-admin-lock` leases under an advisory lock
  keyed on the admin; 429 `MEDSCHOOLS_QA_BUSY`). A decision (approve, decline, revoke) sends the applicant a notice; a
  revoke is recorded in `revokedAt/By/Note` and leaves the approval fields alone; the admin list always includes every
  `APPROVED` row as `active`. `GET me/ask` returns `{ tier, remainingToday, dailyCap }`, null and null for an admin
  ("Admin: no daily limit"). Limit requests (`MedQaLimitRequest`, `api/qa-limit.server.ts`, outside `api/qa/` so the
  privacy pins on that folder stay literal): one PENDING and one APPROVED per member (partial unique indexes in the
  migration), reason at most 500 characters, a decline or revoke blocks a new request for 30 days, admins and paying
  members never see the form (`LimitRequest.tsx`, under the Ask form, not an ink button). Endpoints
  `me/qa-limit-request` (GET, POST) and `admin/medschools/qa-limit-requests` (GET, POST: approve, decline, revoke with
  an optional note), reviewed in the "Q&A limits" tab of `/admin/medschools`. Erased with the account; the schema test
  pins the model's exact columns, none of which can hold a question.
- **What is and is not kept (R12).** The question and the answer exist in memory for the call. No table, no cache, no
  response micro-cache, no log line holds them (logs carry intent, counts and status). The only trace is the `AiUsage`
  row every AI call already writes (user id, task, prompt id, tokens, cost, time; no text), kept under that table's
  existing erasure decision (`lib/account/erasure-registry.ts`). So no erasure operation was added for it (the limit
  request of R19 is its own model with its own erasure op). Pinned by `engine/schema.test.ts` (no `Med*` column can hold
  a question), `api/qa/privacy.server.test.ts` (no writes, no caches, no logging of text) and
  `scripts/medschools/verify-erasure.ts`. The provider receives the question text; the form says so in one line.
- **UI (`ui/ask/`).** `AskPanel` (page or section, pins `slug`), `AskForm` (the one ink button, counter, suggestions),
  `AnswerView` (rows on rules with source numbers), `Citations`, `MyChance`; `askRun.ts` is the pure run controller
  (cancel, one at a time). `ui/` imports `engine/qa` as types only (`qa-boundary.test.ts`). Strings are `ask-*` keys.
  The admin page is `components/admin/medschools/AdminMedSchoolsPage.tsx` (tabs: Aliases, Q&A limits). Not streamed
  (R1); embeddings deferred (R13): a question may name a state and an interview format instead.
- **Tests.** Unit:
  `pnpm exec vitest run features/medschools/engine/qa features/medschools/api/qa features/medschools/ui/ask`. Black box:
  `testing/integration/medschools-ask.test.ts` with `testing/integration/lib/fake-deepseek.ts` (the app is started with
  `DEEPSEEK_API_KEY=integration-fake`, `DEEPSEEK_BASE_URL=http://127.0.0.1:$INTEGRATION_AI_FAKE_PORT/v1`; the
  model-dependent cases skip without `INTEGRATION_AI_FAKE_PORT`, and CI sets it). Visual: `visual-check.mjs --fake-ai`.

## Interview prep (roadmap item 6)

Plan: `docs/superpowers/plans/2026-11-24-rmh-medschool-interview-prep.md`. Practice mode (`ui/practice/`:
`PracticePanel`, `PracticeTimer`, `FollowupsSection`, presentational) is the school page's `?itab=practice` and
`/med/practice` (general questions by program, noindex, `EXCLUDED_ROUTES`, readable signed out). Timer and picking are
pure (`engine/practice.ts`); it starts only on the member's press and ticks on one 1 s interval. **Notes are component
state:** not stored, not in localStorage, cleared on a new question. **General questions are a static versioned module**
(`engine/general-questions.ts`, zod shape in `.schema.ts`, no table: nothing per user or school); text is i18n
`gq-<id>`, and the dynamic keys are NOT found by `i18n:extract`, so add a key to `locales/en/medschools.json` by hand
(the test checks it). **Follow-ups:** `POST me/interview/followups` (`api/qa/followups.server.ts`) reuses
`admitQuestion` (shared budget fail closed, allowance, one daily question, lease), `runUnderLease`, the thinking switch
and the `medschools-qa` task; the model sees only `{ question, notes?, examples }` (other stored questions of an active
school), `parseFollowups` keeps only question-shaped strings (2 or 3, else unreadable and the day's question is
refunded). Nothing is stored or logged beyond counts.

## Secondaries (owner 2026-11-23)

Plan: `docs/superpowers/plans/2026-11-23-rmh-medschool-secondaries.md` ("Owner answers" override its rulings).

- **Tab and endpoints.** `?tab=secondaries` (`ui/SecondariesTab.tsx`, `ui/secondaries/*`; a school tab is the four edits
  above). Public `GET schools/$slug/secondaries` (`api/secondaries.server.ts`, public cache 300/900/3600 s,
  user-independent): groups by program (REG then PHD, no empty heading), prompts with `cycles` (integers, ascending),
  `status`, `previousText`, sources and last check; school-level `sources` (url + check time), `admissions` and
  `turnaround`. Private `GET me/secondaries/overlap` (`source=list&list=<id>` or `source=tracker`, never cached; another
  member's list id is the same 404 as an unknown one). Admin `POST admin/medschools/secondaries` corrects a school's own
  prompts (URL stored, never fetched).
- **Model.** `MedSecondaryPrompt` (unique school x program x `secondaryKey`), `MedSecondaryObservation` (unique prompt x
  cycle x source: `ADMIT`, `SDN`, `SCHOOL`), `MedSecondaryCheck`. Cycles are the distinct `cycleYear`s (entry year; 2027
  is 2026-2027), so two sources in one cycle count once. Marks (`same`, `reworded` at Dice >= `SIM_REWORDED` 0.5, `new`,
  `gone`, `last-cycle`, `null` for a first year) are computed at read by `engine/secondaries/view.ts`; `gone` reads "Not
  seen this cycle" because absence is not proof. Themes are keyword rules (`THEMES_VERSION`). Observations are never
  deleted. **No draft, note or text field exists anywhere** (schema test, no-input tests).
- **Sources and politeness.** Admit secondary-essays page and SDN essay-questions page (`medschools.secondaries`,
  `ADMIT_WEB` host, no model), SDN forum posts (off-peak, own 10% AI share `medschools-extract:secondaries`,
  reject-not-redact), and the school's own pages as a one-time curated import. See `server/CLAUDE.md` for the queue,
  cron and env.
- **School pages: one-time import (no scraper).** `data/medschools/school-pages.json` (221 schools, each school's own
  secondary and admissions pages, read by hand and verified verbatim on 2026-11-23; a header records source and method)
  is validated by `scrape/school-pages.ts` (https, school-owned hosts only, every slug in the registry) and loaded by
  the medschools worker at start (`ensureSchoolPagesImported`, bundled into the worker like the other seed files; a
  `MedSourceRun` with job `school-pages-import` and the file's hash is the done flag, so it runs once per version of the
  file and a deploy needs no operator step): `SCHOOL` observations (`sourceRef` the page url; a page naming no cycle
  goes in the cycle in progress on the check date), one `MedSecondaryCheck` per school and one
  `MedSchoolAdmissionsPolicy` per school and program where the page says whether decisions are rolling. Idempotent. The
  tab shows "Rolling admissions" or "Decisions on set dates", the quote and "Source: <school> admissions page, checked
  <date>". `scripts/medschools/import-school-pages.ts` runs the same import by hand from a full checkout (it needs `tsx`
  and the `features/` source, which the production web image does not carry; `--dry-run` validates only). Editing the
  file and deploying is the way to change the data in production: the worker re-imports a changed file at start.
- **Turnaround.** The tracker's `SECONDARY` milestone reads "Secondary received" and `SECONDARY_SUBMITTED` ("Secondary
  submitted") is offered; it is never shared as a public event (`SHAREABLE`, `share-sync.test.ts`, the integration
  suite). The daily forecast job (`scrape/run-turnaround.ts`, after the wait curves) writes `MedSecondaryTurnaround`:
  one value per member, at least 20 distinct sharing members per school x program (`TURNAROUND_MIN_MEMBERS`), pairs
  negative or over 120 days dropped before the floor, whole-day 25th / median / 75th, replaced only when the member
  count moves by 3, created only at 23 (`TURNAROUND_CREATE_MEMBERS`), deleted at once under 20. The sharing row says so.
- **Overlap view.** `ui/secondaries/OverlapSection.tsx` (a native `<details>` on each list and on the tracker's current
  cycle; the query is enabled only once opened) over presentational `OverlapView`. A PHD item brings the regular prompts
  too.
- **Verification.** `testing/integration/medschools-public.test.ts` and `-private.test.ts` (secondaries, overlap,
  turnaround floors); `scripts/medschools/visual-check.mjs` (`--page secondaries`, `--page overlap`) after
  `seed-visual.ts`.

## School facts: the AAMC MSAR reports (roadmap item 11, phase C step 1)

Plan: "Phase C step 1 as built" in `docs/superpowers/plans/2026-11-24-rmh-medschool-redesign.md`.

- **Source and permission.** The AAMC MSAR "Reports for Applicants and Advisors"
  (`students-residents.aamc.org/medical-school-admission-requirements/...reports-applicants-and-advisors`). The owner
  states that RMH has AAMC's permission to use anything on that page (2026-11-24); the PDFs say they "may be reproduced
  and distributed with attribution for individual, educational, and noncommercial purposes only". So every figure is
  shown as "Source: AAMC MSAR Report for Applicants and Advisors, <year> entering class, <report name>" with a link to
  the page (`factSourceLine`). **This does not cover the MSAR profiles (`mec.aamc.org/msar-ui`): never fetch or use
  them.** MD (AMCAS) schools only; a DO school has no Admissions facts section and nothing is invented for one.
- **Data and import.** `data/medschools/msar-reports.json` (header: source, permission, method, fetch date, per-report
  year) is a one-time curated import like the school pages: validated by `scrape/msar-reports.ts`, loaded at worker
  start by `ensureMsarReportsImported` once per file hash (`MedSourceRun` job `msar-reports-import`), idempotent, the
  table equals the file. The file is in the Dockerfile server-builder COPY line. **No scraper and no request to AAMC
  anywhere.** Rebuild it from PDFs downloaded by hand (one at a time, 3 s or more apart, never committed):
  `python3 -I scripts/medschools/msar_extract.py <pdfs> <raw>`, then
  `pnpm exec tsx scripts/medschools/parse-msar-reports.ts <raw> <pdfs>`, then
  `pnpm exec tsx scripts/medschools/check-msar-reports.ts <pdfs>` (the verifier: every text on its PDF page, every
  structured value from its text, the file reproducible). `data/medschools/msar-aliases.json` maps AAMC school names to
  slugs; an unmapped name is listed as unmatched, never guessed.
- **Model.** `MedSchoolFact` (`program` not null, default `REG`; kinds are validated strings from
  `engine/school-facts.ts`; `source` `AAMC_MSAR_REPORT` now, `SCHOOL_PROFILE` for the class-profile pages of step 2).
  Institutional, no user, no erasure. The report's own year is kept per fact (the Deposit report is 2026, PREview prints
  none).
- **Read.** Public `GET schools/$slug/facts` (`api/school-facts.server.ts`): user-independent, pinned keys, `facts: []`
  for a school without any. UI: `ui/facts/AdmissionsFacts.tsx` on the Facts tab; a block per report, each with its
  source line. MCAT and GPA tiles are the class profiles' (step 2, below), never the AAMC panel's.

### Admit curriculum (roadmap item 11, phase C curriculum, owner 2026-11-24)

Plan: "Phase C curriculum" in `docs/superpowers/plans/2026-11-24-rmh-medschool-redesign.md` (probe results and the
vocabularies seen are there).

- **Source.** Admit.org's `getAllSchoolCurriculum` GraphQL query (no arguments, about 190 schools, one request) through
  `scrape/adapters/admit/` (`SCHOOL_CURRICULUM`, `curriculumRow`, `curriculum.ts`, `client.fetchCurriculum`). It selects
  eight fields and the school slug; **`internal_rank` is Admit's own ranking and is never selected, stored or shown.** A
  null field is "no answer" and makes no row.
- **Job and storage.** `scrape/run-admit-curriculum.ts` (queue `medschools.admit-curriculum`, weekly, one request, a 6
  day persisted minimum interval, first run owed at worker start, `MedSourceRun` job `admit-curriculum`, no model;
  detail in `server/CLAUDE.md`) and `scrape/admit-curriculum.ts` write `MedSchoolFact` rows with source `ADMIT`, program
  `REG`, `cycleYear` 0 (`CURRICULUM_CYCLE`: not an entering class). Match is the ADMIT alias key; unmatched schools are
  counted, never named and never an alias miss. Upsert per school x kind, delete kinds that disappear for a school in
  the reply, **touch only `ADMIT` rows** (never the AAMC ones); an empty reply writes nothing.
- **Values.** The catalogue is `CURRICULUM_KINDS` in `engine/school-facts.ts` with its normalisers: clerkship
  `H_HP_P_F | H_P_F | P_F | OTHER` (exact strings), preclinical `PASS_FAIL | TIERED | OTHER`, shelf
  `NBME | IN_HOUSE | BOTH`, length in years, yes/no flags, home hospitals joined by "; ". The code is `valueText`,
  Admit's string is `valueJson.text` (the endpoint's `printed`) and is always kept, and shown alone when it cannot be
  normalised.
- **Read and UI.** The same `GET schools/$slug/facts` returns them (a row is served only when its kind belongs to its
  source's catalogue; `reportId` is null for them, the key set is unchanged). `ui/facts/Curriculum.tsx` is the paper
  panel "Curriculum" on the school page's **Facts** tab (`?tab=facts`, the sixth tab) above `AdmissionsFacts`; MD and DO
  schools alike when Admit has the school, source line "Source: Admit.org, checked <date>" and "Compiled by Admit.org;
  confirm with the school.". The Admissions facts panel moved off the Activity tab with it.

### MD-PhD programs (owner 2026-11-24)

The Facts tab's last group, "MD-PhD program" ("DO-PhD program" at a DO school): the program's name, its NIH MSTP (T32)
status and its curriculum timeline.

- **Sources.** `data/medschools/mdphd-programs.json` (131 schools: each school's own program page, read by hand, one
  page set per school, 3 s or more apart, the honest user agent) and `data/medschools/mstp-t32.json` (NIH RePORTER: the
  active NIGMS T32 Medical Scientist Training Program grants, 64 schools). Both carry a header with source, method, date
  and the owner decisions, and both are built by `scripts/medschools/build-mdphd-data.ts` from the research records and
  the RePORTER replies (not committed). Every record cites its source: the program page for existence, the timeline and
  its quote; RePORTER for MSTP status. A "no program" answer is kept only when it cites the page read and was not
  flagged low confidence; a school neither file decides shows nothing.
- **Timelines are verified or absent.** A timeline is kept only when its evidence was re-fetched and found on the cited
  page (`engine/mdphd-evidence.ts`: verbatim after folding whitespace, quotes and dashes, every piece of four words or
  more around an ellipsis, letters and digits in order as the fallback for tables). Phase lengths are only those the
  page states; a range stays a range in the phase's words ("3.5 to 4.5 years") and is read from there at render
  (`phaseRange`); the programme's total is the stated one or a range in the quote (`statedTotal`), never a sum. Extra
  phases keep the page's order (a rotation before year 1 is listed beside the bar; clerkships before the PhD at Mount
  Sinai and Iowa are segments in place).
- **The 2-4-2 rule.** A program that publishes no layout (or one naming no PhD research and medical phase) is drawn as
  the typical 2-4-2 (`TYPICAL_TIMELINE`): dashed and unfilled, a dashed "2-4-2" and an info line "Typical layout; the
  program does not publish its own", and its accessible name starts "Typical layout:". It has no source icon because it
  is not the school's statement; a length the page does state shows on its own "Length" row with the quote.
- **The bar.** `engine/mdphd.ts` `barModel` merges neighbouring phases of one kind (a rotation between MS1 and MS2 does
  not split preclinical), `segmentShares` makes widths proportional only when every segment has a length (else equal,
  "Length not stated"). One CSS grid holds the segments and the names and lengths under them; the whole figure is one
  `role="img"` named by the sentence ("Preclinical 2 years, then PhD research 4 years, then clinical 2 years"). Colours
  are `--app-med-phase-*` (aliases of the status pastels: preclinical the neutral pair, research the secondary blue,
  clinical the acceptance green), each segment edged in its ink; `ui/facts/mdphd.test.tsx` holds the edge at 3:1 on
  paper and on its fill in both modes.
- **MSTP from RePORTER.** Funded reads "Funded · T32GM… · FY 2026" with the grant's RePORTER page as the source; a
  program not found there reads "Not listed as an NIH MSTP" and "checked <date>", never "No". Grants are matched to
  slugs by hand in `data/medschools/mstp-aliases.json`, by core project number; every core in the input must be a grant
  or an exclusion with its reason, so a new grant is a decision. Excluded: the veterinary DVM-PhD programs (Colorado
  State, Cornell Ithaca, UC Davis), non-MSTP grants, superseded older awards, and NYU's grant (last FY 2024, ended
  2025-06-30). Multi-school institutions follow the grant's own words: South Texas is UT Health San Antonio, UTHealth
  Houston is McGovern, UCLA-Caltech is UCLA, the MSU College of Osteopathic Medicine MSTP is the DO school, the
  University of Arizona's is Tucson, the Tri-I MST Program is Weill Cornell; Cleveland Clinic Lerner is not mapped from
  Case Western's grant. A school known only from a grant counts as a program (source NIH, no timeline).
- **Model and import.** `MedSchoolFact` rows with `program` PHD and `cycleYear` 0: `MDPHD_PROGRAM` (YES | NO),
  `MDPHD_TIMELINE` (the pattern, total years, phases in `valueJson`, the quote in `note`), `MSTP_T32` (LISTED with the
  grant, or NOT_LISTED). Sources `SCHOOL_PAGE` and `NIH_REPORTER` came with the additive migration
  `20261210090000_medschools_mdphd_sources`. `scrape/mdphd.ts` validates both files (zod; no DVM grant, no grant for a
  school whose page says it has no program) and `ensureMdPhdImported` runs at worker start once per hash of the pair
  (`MedSourceRun` job `mdphd-import`); it is idempotent and deletes only its own kinds and sources when they disappear.
  Both files are in the Dockerfile server-builder COPY line.
- **Read.** The same public `GET schools/$slug/facts` returns `mdphd` (null when nothing is known): `program`,
  `timeline` and `mstp`, pinned by `testing/integration/medschools-public.test.ts`; a "no program" school gets the one
  row and nothing else, and the PHD rows never join `facts`. UI: `ui/facts/MdPhdProgram.tsx`.
- **Re-checking.** `pnpm exec tsx scripts/medschools/check-mdphd.ts [--only slug,slug] [--json out.json]` re-fetches
  every timeline page (one at a time, 3 s plus jitter, the worker's user agent, `pdftotext` for a PDF) and fails when a
  quote is gone. Run it by hand before editing the file; CI does not run it (no network). To change the data, rebuild
  with `build-mdphd-data.ts`, run the checker, and deploy: the worker re-imports a changed pair at start.

## School facts: class profiles (phase C step 2)

"Entering class": MCAT, GPA, applicants, class size and in-state figures from each school's OWN class-profile page, the
first panel on the Facts tab. Plan: "Phase C step 2 as built" in
`docs/superpowers/plans/2026-11-24-rmh-medschool-redesign.md`.

- **Data.** `data/medschools/class-profiles.json`: a header (`source`, `method`, `checkedOn`, `rules`, `verifier`) and
  `schools` (only those with data, sorted by slug), each with `classes` (`label` as the page gives it, `enteringYear` or
  null, `url`, `stats`: `kind`, `value` exactly as written, `unit`, `qualifier`, `evidence` verbatim from the page).
  Researched by hand once (curl, the static contact user agent, 3 s plus jitter, robots.txt, a refusal recorded and not
  worked around) and every figure re-fetched and found on its url. **Rules:** official pages only (the school's domain
  and its PDFs), never the MSAR profiles, AACOMAS / Choose DO, US News, Admit.org, SDN, forums or prep companies; never
  computed, inferred or rounded; mean, median and range kept apart (an unnamed statistic is `MCAT_SCORE`, `GPA_SCORE` or
  `SGPA_SCORE`, shown as plain "MCAT", "GPA", "Science GPA"); qualifiers are the page's own scope, never research notes;
  classes before the 2024 entering class dropped. In the Dockerfile server-builder COPY line.
- **Validation** (`scrape/class-profiles.ts`, zod): https on a school-owned host (`isThirdPartyHost` of
  `school-pages.ts` plus rankings, Choose DO and prep sites), kinds from `PROFILE_KINDS` (`engine/school-facts.ts`),
  value non-empty, the evidence carries the value's digits (`evidenceHasValue`, the verifier's rule; a value in words
  must appear as written), an `OTHER` names itself, no class before 2024, no two classes of one school in one year (or
  two undated). Every slug is in the registry (`class-profiles.test.ts`; the import skips an unknown slug and then
  deletes nothing).
- **Import.** `ensureClassProfilesImported` at medschools-worker start, once per file hash (`MedSourceRun` job
  `class-profiles-import`), idempotent; deletes only `SCHOOL_PROFILE` rows the file no longer produces. One
  `MedSchoolFact` per figure: kind `PROFILE_<KIND>`, and `PROFILE_<KIND>#n` for the n-th figure of one kind in a class
  and program (several `OTHER` figures; the unique key school x program x cycle x kind x source has no other slot, so
  this needs no migration; `profileKindOf` reads it back). `cycleYear` is the entering year, or `PROFILE_UNDATED_CYCLE`
  (0) for a class the page does not date ("current", "most recent"), its label kept; two classes of one school differ in
  `cycleYear`. Program `PHD` when the qualifier says the figure is for the MD-PhD (DO-PhD, MSTP) program only
  (`isPhdOnlyQualifier`; "MD & MD/PhD", "incl. MD/PhD" stay `REG`), else `REG`. `valueText` is the page's string (always
  shown), `valueNum` only a plain number of the kind (`parseProfileNumber`: never "~600", "6,000+", a range or words),
  `valueJson` `{ text, label, qualifier, evidence, url, unit, order }`, `note` the evidence.
- **Read.** The public `GET schools/$slug/facts` adds `classes` (pinned keys in `medschools-public.test.ts`):
  `{ label, enteringYear, url, checkedOn, stats: [{ kind, program, value, num, qualifier, evidence }] }`, newest first,
  an undated ("current") class ahead of the dated ones, figures in the page's order (`classProfilesOf`). Profile rows
  never join `facts`. User-independent; `[]` for a school with no profile.
- **UI.** `ui/facts/EnteringClass.tsx`, the paper panel "Entering class" above Curriculum, MD and DO alike; nothing at
  all for a school without a profile. The newest class's line ("Entered 2026": the page's own label only repeats the
  year; undated: the page's label, cleaned of research notes, and "Year not stated"), then tonal figure tiles
  (`.medapp-figs`, two to a row on a phone, tabular figures): "Median MCAT" / "Mean MCAT" / "MCAT range" exactly per
  kind, GPA and science GPA the same, then Applicants, Interviewed, Class size, In state; only figures the page states,
  never a computed one. Under a tile, the qualifier when it is the page's own scope ("five-year average", "virtual
  interviews", "Oregon Campus column"); a research note on the wording ("labelled Average MCAT") or the page's own words
  for the kind ("MCAT Exam Class Average", "new matriculants") is not shown (`profileQualifierNote`, its `RESTATING`
  words). `OTHER` figures are definition rows named by their qualifier, each with its own source. MD-PhD-only figures
  are a group of their own ("MD-PhD program", "DO-PhD program"). A previous class is a native `details` ("Previous
  class"). Sources: `SourceRef` on the class line (every tile's evidence highlighted: `textFragmentsUrl`, several
  `text=` directives; a PDF opens plain), "Source: <short
  name>'s class profile, checked <date>" and "Figures as the school publishes them." Strings `profile-*`.
- **Re-checking.** `pnpm exec tsx scripts/medschools/check-class-profiles.ts [--only slug,slug] [--json out.json]`
  re-fetches every class url (one at a time, 3 s plus jitter, the worker's user agent, robots.txt, `pdftotext` for a
  PDF) and reports each figure found or not found by the verifier's rules (verbatim, letters and digits in order, or an
  animated counter's data attribute); exit 1 when one is gone. Run it by hand; CI has no network.

## Rolling guidance (roadmap item 5)

"Where applying early matters": a native disclosure under each list and the tracker's current cycle
(`ui/rolling/RollingSection.tsx`, query enabled only once opened) over presentational `RollingView`. Private, never
cached `GET me/rolling` (`source=list&list=<id>` or `source=tracker`; `overlapQuery` validates it; another member's list
is the same 404 as an unknown one), `api/rolling-guidance.server.ts`, which reads the caller's own items plus the public
`MedSchoolAdmissionsPolicy` rows and nothing else; no fetch of a school's page. **A program never borrows the other's
fact** (`engine/rolling.ts`, `policyProgramOf`): a PHD item or application reads the PHD row only, REG and ANY read the
REG row only, and a missing row is "The school's page does not say". Order: rolling, set dates, unknown; inside each a
tracker school with no step recorded first, then the member's own order. Wording is always "the school says" with the
page's verbatim quote and a dated link, one neutral context sentence, no advice. Plan:
`docs/superpowers/plans/2026-11-24-rmh-medschool-rolling-guidance.md`.

## Tracker import (owner 2026-11-23)

A member uploads a `.xlsx`, `.csv`, `.docx`, `.pdf` or `.txt` (2 MB), or pastes text; DeepSeek flash reads it into
tracker dates; the member reviews a preview and presses "Add to my tracker". Endpoints `POST me/tracker/import/parse`
(multipart `file` or JSON `{ text }`; `parseMedImportFileApi` / `parseMedImportTextApi`) and
`POST me/tracker/import/save` (`saveMedImportApi`), both signed in and `no-store`.

- **Bounded input.** The body is read as a stream with a byte cap (`api/import/body.server.ts`: 2 MB plus form overhead,
  chunked uploads included). `.xlsx`/`.docx` are read by `lib/zip/bounded-zip.server.ts`, which inflates with a real
  limit (the sizes an archive declares are the sender's) and a per-file total; sheet XML is walked by a linear `indexOf`
  scanner (`elements()` in `xlsx.server.ts`) with caps on rows, cells and strings, because the lazy regexes it replaced
  were quadratic. A PDF read has a wall-clock deadline, the request signal and a page cap.
- **Only dates, and nothing is kept.** The file is read in memory (`api/import/extract.server.ts`, the generalised
  resume reader plus `xlsx.server.ts` and a CSV parser), its cleaned text goes to one call under the `medschools-import`
  task (prompt `MEDSCHOOLS_IMPORT`), and the preview is returned. No bytes, text or filename is stored, cached or logged
  (the log line is counts and a status); the only trace is the text-free `AiUsage` row. The model's `notes` is read by
  nothing. Pinned by `api/import/privacy.server.test.ts` and the integration test's scan of every table.
- **The server is the validator** (`api/import/validate.ts`, pure): the envelope and each row and date are checked on
  their own; a date is kept only when its `raw` quote is in the text AND holds a date token that reads as exactly that
  month and day (`rawSupportsDate`: ISO year-first, M/D/Y, D/M, or a month name either way round; two numbers that
  merely appear never count) and a school name is shown only if the text holds it (else "Unrecognised school" and the
  picker); an invented date is dropped and counted in `dropped`; a year the file never wrote is chosen by the cycle
  rules (`engine/import.ts`, `inferYear`, flagged `yearInferred`); a numeric date that reads two ways is flagged
  `ambiguous`; the date must be inside the cycle's window; schools resolve by written name and alias, never by a slug
  from the model (no unique match: `school: null`, the member picks). The cycle is the one most dated milestones belong
  to, else the model's hint, else the current one.
- **Gates are the Q&A's** (`admitQuestion`, `api/qa/lease.server.ts` `runUnderLease`): rate limit `ai`,
  `isAiConfigured`, the shared monthly pause, the member's allowance, then one of the day's questions and the in-flight
  lease. One import is one daily question; spend counts against the Q&A share; admin bypass and the pause apply. A reply
  the server cannot read as JSON (cut off at the token limit, or prose) is a fixed-message 503 `AI_UNAVAILABLE`
  (`UnreadableReplyError`, never the parser's message, which quotes the model's echo of the file) and refunds the day's
  question (`Reservation.refund()`); a provider failure or the deadline does not (the call was made). The model gets at
  most 300 rows (`IMPORT_LIMITS.rows`), returns at most 60 schools and may use 8000 output tokens. A file the reader
  cannot read (415 `MEDSCHOOLS_IMPORT_UNSUPPORTED`), over 2 MB (413 `..._TOO_LARGE`) or with no digit or no date found
  (422 `..._EMPTY`) ends before, or without spending, the model call where it can. The sentences are in
  `components/errors/refusal-sentence.ts`; the view renders every refusal through `useRefusalText`.
- **Save** (`importMilestones` in `api/tracker.server.ts`) goes through share-sync's row writers in one `withShared`
  transaction, so a date is shared only if the cycle's sharing is already on and only the shareable types. The body
  names schools by slug and never an application, cycle or user (strict schema). Conflict rule: an existing different
  date is kept unless that date carries `overwrite: true`; the same date is `unchanged`; an out-of-window date or a
  school that is not active is `invalid`. A cycle is created (unshared) only when the first school needs it.
- **UI (`ui/tracker/import/`).** "Import from a file" on the tracker opens `TrackerImport` (a `lazy` chunk, so it is off
  the tracker's critical path); while open it is the whole view, so "Add to my tracker" is the one ink primary (R4). The
  upload uses `api(parseMedImportFileApi, { body: FormData })` (`lib/contract/client.ts` sends multipart with no
  content-type), so no raw `fetch` was added. `model.ts` holds every rule the preview applies (pure, tested): which
  dates are new, same, conflicting or invalid, what `saveBody` writes (an unticked row or date is simply absent), and
  `retarget` when the cycle changes (a year the file wrote stays; a hand-edited date is final). `ImportPreview.tsx` is
  rows on rules, 44 px targets on touch, the picker for an unmatched school. Strings are `import-*` keys. A file the
  browser can see is unsupported or too large is refused before it is sent, with the server's own sentence.
- **Tests.** Unit:
  `pnpm exec vitest run features/medschools/ui/tracker/import features/medschools/api/import features/medschools/engine/import.test.ts features/medschools/api/tracker-import.server.test.ts`.
  Black box: `testing/integration/medschools-import.test.ts` (fake provider, needs `MEDSCHOOLS_DEDUPE_SECRET` for the
  sharing case). Visual: `visual-check.mjs --fake-ai --page import`.

## Testing and verification

- Unit: colocated `*.test.ts(x)` (`pnpm exec vitest run features/medschools`); `ui/ui-rules.test.ts` holds the app-tier,
  i18n and bundle rules for every ui file and the route files.
- Black box, public: `testing/integration/medschools-public.test.ts` (pinned key sets, no RMH or `contributors` in
  responses, no hashes in the HTML, the `programs` set on the index and live feed, the removed "today" block, 404 for
  unknown slugs, sitemap). It writes its own fixture school; CI's database is empty.
- Black box, private: `testing/integration/medschools-private.test.ts` (two schools of its own and the global cast's
  alice, bob and carol; needs `MEDSCHOOLS_DEDUPE_SECRET` in the app and in the test, `ci-checks.yml` sets both).
  Anonymous 401 on every `me/**` route with no public cache header; foreign ids 404; sharing through the publish job
  (run directly with `runRmhPublish`) and only at 3; off removes the event at once and the figure at the next publish;
  edits, deletes and 20 mixed requests from two clients end equal to a recompute; nothing person-shaped in the event
  row; list caps, default-list race and preference round trip; the arrivals and live (`q`, `state`, `types`, `programs`)
  key sets.
- **Erasure and audit scripts (scratch or read-only).** `scripts/medschools/verify-erasure.ts` (scratch database only)
  seeds three members, kills the erasure pre-step midway through a failing database wrapper (injected in the script, not
  in the product), re-runs it, runs the real `anonymizeAccount` and checks events, counts, rows and `auditRmh`.
  `scripts/medschools/check-rmh-events.ts` runs `auditRmh` against any database, read-only, and prints `orphanEvents`,
  `mismatchedCells` and `missingEvents` (exit 1 unless all are zero). **Run it after rotating
  `MEDSCHOOLS_DEDUPE_SECRET`** (every event reads as an orphan until the hashes are recomputed; see Private, below).
- Seed: `scripts/medschools/seed-visual.ts` writes **FIXTURE** rows (never real figures) into a scratch Postgres (it
  refuses any database whose name lacks `scratch` or whose host is not localhost). Use it for screenshots and
  `pnpm audit:pages --routes …`.
- **Visual pass (O6): `scripts/medschools/visual-check.mjs`** signs up one member, fills a tracker, two lists and
  preferences through the real endpoints, and shoots index, live, a school (activity with a tooltip open, history with
  arrivals, the three Interviews sub-tabs), a DO school's program toggles, the tracker and the lists page at 320x568,
  390x844, 844x390, 768x1024, 1024x600, 1280x800, 1920x1080 and 2560x1080 in Day and Night, plus `ar` at 390 and 1280.
  It asserts no sideways scroll, that the edition asked for is the edition painted, chart text of at least 11 px below
  1024, 44 px controls on touch and `dir=rtl` in `ar`. **Night and a signed-in page:** the pre-paint script reads
  `localStorage['rmh-style']` (`graphite` is Night), but a signed-in visit paints the ACCOUNT's saved edition over the
  device's (`lib/prepaint/account-seed.ts`), and the idle sync saves whatever the last visit used, so a Night pass that
  follows a Day pass paints Day on the tracker and lists pages unless the account is set first
  (`PUT /api/preferences/appearance`; the script does). Nothing is wrong with Night on these routes: they were ordinary
  `_site` pages when this was written; since phase A they are an app route whose light/dark is `rmh-medschool-mode`, so
  `visual-check.mjs` still asserts Steel R1 and edition classes and is due an update (phase B).
- **Ask pages in the visual pass (phase 6).** `visual-check.mjs --fake-ai` also shoots the Ask page (signed out, idle,
  answered, partial, declined, my-chance, the wait, the cap reached and the 429 refusal) and the school page's panel
  (idle, answered). It hosts the fake DeepSeek of `testing/integration/lib/fake-deepseek.ts` itself, so the app must be
  started with `DEEPSEEK_API_KEY=integration-fake DEEPSEEK_BASE_URL=http://127.0.0.1:7798/v1` and
  `RATE_LIMIT_MULTIPLIER=50`, and `DATABASE_URL` must name the scratch database (it clears and plants the member's
  `ai_usage` rows). It asserts no sideways scroll, 44 px controls, and Steel R1 on the page content (no shadow,
  gradient, filter or backdrop filter). Without the flag only the signed-out and idle pages run. It found that the
  grounding validator dropped every sentence naming "Admit.org" (a domain-shaped source name); a domain is now allowed
  when it is in our own fact text.
- i18n: namespace `medschools`; new keys carry a prefix (`index-`, `live-`, `school-`, `chart-`, `event-`, `program-`,
  `source-`); the hub row's two strings are `nav-rmh-medschools` and `services-medschools-desc` in `feed`.

## Programs, lists, the activity rail and arrivals (owner 2026-11-23)

- **Program set.** `engine/programs.ts` is the one definition: four keys (`md`, `md-phd`, `do`, `do-phd`), the URL param
  `programs=md,do-phd` (canonical order; the old `degree` and `program` links still parse onto it), the preference
  (`MedUserPrefs.programs`, text[]; empty means "not chosen" and the older `programFilter` and `degree` columns still
  answer for old rows), and the three public readers (`programs` on the list, live and rail queries). All four on is no
  filter and the only set that includes events with no program reported. The index, live page, rail and preferences use
  `ProgramSetToggles`; the school page keeps `ProgramToggles` for its own degree (`ALL | REG | PHD`).
- **Preferences and lists on the public pages (plan task 12).** Each route loader awaits `loadPrefs` first, then
  prefetches the public queries with explicit parameters, so the public cache keys never carry a list, user or
  preference. `?list=<id>|all` on the index is a client filter over the returned schools. `/med/lists` holds the lists
  and the preferences (`#preferences`).
- **Activity rail.** `ui/shell/MedApp.tsx` mounts the lazy rail beside the page (>= 1280px only; neither rendered nor
  fetched below; it used to be the Steel shell's margin takeover). `ui/rail/ActivityRail.tsx` uses `useLiveFeed` (60 s
  head refetch, M9 fade) and one `IntersectionObserver` on the sentinel through `useSentinel` to load older pages: data
  loading only, so B3's no-decorative-observer rule is untouched. Server side it is the live endpoint with `q` (name,
  short name or an exact state code), `state` and `types`.
- **When results arrive.** `GET /schools/$slug/arrivals`: weekday and Eastern-hour counts and per-cycle first and median
  report days, aggregated in SQL from ADMIT and SDN events with an exact time (SDN midnights are day-only and excluded).
  Aggregates only; a cycle needs 3 events; the arrays are empty (and the section hidden) under 10 events.
- **Interviews** has `?itab=overview|questions|format`; Overview compares reported invites with Admit's yearly interview
  count (labelled "Source: Admit.org", hidden when unknown) and keeps the floored stats.

## Private: the tracker, sharing, lists and preferences (phase 4)

Pages `/med/tracker`, `/med/lists` and (phase 6) `/med/ask` (signed out they show a sign-in prompt, `noindex`; neither
is a school slug). Endpoints, all signed in, `Cache-Control` never public, no DTO with a user, cycle or event id:
`me/tracker` (GET), `me/tracker/cycle` (PUT, DELETE), `me/tracker/applications` (POST), `.../applications/$id` (PATCH,
DELETE), `.../applications/$id/milestones/$type` (PUT, DELETE), `me/lists` (GET, POST), `me/lists/$id` (PATCH, DELETE),
`me/list-order`, `me/list-items` (save a school, creating "My schools" on first use), `me/lists/$id/items/$itemId`,
`me/lists/$id/item-order`, `me/lists/$id/add-to-tracker`, `me/prefs` (GET, PUT). Another member's id is a 404, never
a 403.

- **One writer (D1).** `api/share-sync.server.ts` is the only module that writes the tracker rows or an RMH event or
  count (`share-ratchet.test.ts`). The database cascade deletes milestones without application code seeing it, and an
  event is found only through a milestone id, so every delete path reads the ids first.
- **The hash is recomputed, never stored (D2, D3).** `dedupeHash(secret, 'RMH', 'milestone:<id>')`; storing it on the
  milestone would let a database dump join events to the tracker without the secret. An event's id and a RMH count row's
  id are random UUIDs (a cuid carries its minute), `ingestedAt = occurredAt`, `inState` null, program the application's.
- **`contributors` is exact (D4):** a cell's count is its events, and the schema's uniques (milestone per application
  and type, application per cycle, school and program, cycle per user and year) make them distinct people.
- **Reconcile, do not patch (D5).** Every write that can change shared state runs `reconcileShared`: the user lock, read
  the flag and milestones, compute the wanted events, school locks in sorted order, write, recompute the touched cells.
  Rapid toggles and two tabs end equal to the final flag and milestones.
- **What is shared:** the school, the program, the type (secondary, interview, waitlist, rejection, acceptance,
  withdrawn, hold) and the calendar day. Never submitted or complete dates, home state, notes, or any link to the
  member. Sharing needs an account at least 7 days old and `MEDSCHOOLS_DEDUPE_SECRET` set (503
  `MEDSCHOOLS_SHARING_UNAVAILABLE` otherwise; the tracker still works). Public tracker figures update once a day (see
  the read rules above).
- **Account deletion (D9, Q3).** `eraseSharedMedEvents` runs at the deletion request and again before the erasure
  transaction (idempotent; a missing secret with events present fails loudly and leaves the account scheduled);
  `medschoolsErasureOps` deletes the four user-keyed models (`MedTrackerCycle`, `MedSchoolList`, `MedUserPrefs`,
  `MedQaLimitRequest`), children by cascade, and nulls `decidedBy` and `revokedBy` on the limit requests the member
  decided or revoked as an admin. `pnpm docs:deletion` lists them.
- **Preferences (D13, D14).** They apply only where the URL is silent, decided in the route loader; `?program=ALL` is an
  explicit choice and beats a stored `PHD`. A page whose defaults came from preferences says so in one line.
- **Rotating `MEDSCHOOLS_DEDUPE_SECRET` orphans every shared event** (the hashes are keyed by the old secret). Do it
  deliberately: set the new value on the web and `jobs` tiers, then run `check-rmh-events.ts`; expect `orphanEvents` to
  equal the number of shared events, and delete them (or re-share) before the next daily publish.
