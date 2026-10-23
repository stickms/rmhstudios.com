# Plasmatic Jelly 04: coverage, accessibility, performance and degradation

Status: plan, 2026-10-23. Baseline: `main` at the "put the shader liquid glass back on cards
and controls" commit. The engine now admits `.glass-fill`, `.glass-inset`, `[data-evert]`,
solid buttons and fields, with `GLASS_BUDGET.maxSurfaces = 24` and 3–24px bevels.
Sibling plans: 01 material, 02 soft body, 03 arcs, and 05 gates/docs. This plan owns four
things. **Where** jelly applies (every element category gets a tier). **How** coverage
reaches the hand-rolled surfaces. **What it may cost** on each device tier. **What a
visitor can turn down** to keep it accessible.

Where this plan sets a number that 01–03 also wrote down, this plan's number is the final
one. 01 §6 hands those caps to this plan. Two numbers in 01 and 02 were written against
the old 8-slab budget and are corrected here (§3.1).

---

## 0. Decisions at a glance

| #   | Decision |
| --- | -------- |
| C1  | **Four tiers.** **S**, shader jelly: rim canvas plus an animated haze canvas. **C**, CSS jelly: a static haze plus a compositor carrier while in the live set. **L**, jelly-lite: rim, static haze and press only, no ambient motion. **X**, excluded. Every category in §1 maps to exactly one default tier, and the device tier (§3) can only demote it. |
| C2  | **Coverage is central first.** Role classes, `components/ui/*`, the engine selector and the `bg-(--app-surface)` adapter already reach about 90% of rendered surfaces with no per-file edits. The remainder is 249 hand-rolled surface class strings in 141 files, plus raw dialogs, ranges and switches. A codemod handles them, and a ratchet gate stops new ones (§2). |
| C3  | **24 is the rim budget, not the motion budget.** Up to 24 slabs keep event-driven rim canvases. At most **8** of them get an animated haze canvas on desktop (4 on handheld). The rest move through CSS carriers. Total animated area is capped at **1.5 viewports**. |
| C4  | **One clock.** All ambient motion is driven by 01's ambient clock (30 Hz active, 12 Hz idle, 0 Hz hidden or blurred) and a downscale-only **jelly governor** in that same loop. It adds no new rAF and never flips a document class mid-session. |
| C5  | **No battery API.** `navigator.getBattery` is Chromium-only, it was removed from Firefox, and Safari has never had it. The governor's measured frame time stands in for it: it catches Low Power Mode, thermal throttling and weak GPUs alike. |
| C6  | **WCAG 2.2.2 needs an in-account control.** Ambient haze moves automatically, runs past 5 s and sits beside content. That holds even for decorative motion. A new appearance setting, **Jelly motion: Lively / Calm / Still**, is that control. It is a material setting, not the retired reduced-motion setting, and **no OS media query is read** (CLAUDE.md §7 holds). |
| C7  | **Photosensitivity:** 03's flash ledger (≤ 3 onsets/s) is adopted as a site-wide rule. Ambient haze is bounded to slow, low-contrast modulation. Both are pinned by pure-policy tests. |
| C8  | **High contrast, forced colours, OS reduced transparency and print get no jelly material**, only press (tier L minus haze). `perf-lite` gets tier L everywhere. Game play-fields are always X, and while a game is in play its HUD drops to L. |
| C9  | **Focus rings and text are never jelly.** Rings render outside the host, are never deformed or hazed, and stay at the 2px accent outline. Deformation never covers them (§4.5). |
| C10 | Shared runtime modules owned here: `lib/jelly/selectors.ts`, `lib/jelly/registry.ts` (03 consumes it), and `lib/jelly/tiers.ts`. `tiers.ts` holds the degradation matrix, the off predicate and per-device budgets; 02 keeps `lib/jelly/policy.ts` for physics eligibility, so the off predicate lives in `tiers.ts`, not `policy.ts` as 03 assumed. |

---

## 1. Coverage map

Tiers:

- **S**: engine-admitted. Rim canvas (event-driven), plus a haze canvas while inside the
  ambient-slot cap (§3.1). Tier L lattice deformation comes from 02.
- **C**: static CSS haze and CSS rim (01 §3.4, §3.6), plus a `.jelly-flow` carrier while in
  the live set. Tier E envelope body comes from 02.
- **L**: static haze and CSS rim, with press only (02 Tier E with ζ → 1, no wobble) and no
  ambient motion.
- **X**: excluded, for the reason given.

The default is what a desktop with a fine pointer gets. §3.2 says how each device tier
demotes it. "Engine role" is `roleOf()` in `lib/liquid/glass/engine.ts`.

| Category | Default | Mechanism (where it is applied) | Notes and reasons |
| -------- | ------- | ------------------------------- | ----------------- |
| Dialogs, sheets, overlay panels | S (overlay) | `.glass-overlay` in `dialog.tsx`, `sheet.tsx`, `overlay-panel.tsx` | Haze is interior-quiet (01 §5.4). Wobble amplitude is scaled by area (02 D3), so a 600px dialog barely moves. |
| Scrims (`.glass-scrim`) | X for motion | static tint | Full-viewport layer: `static-backdrop.test.ts` rules apply, with no ambient animation ever. |
| Menus, selects, popovers, command palette, emoji/reaction pickers | S (overlay) | `anchored-menu.tsx`, `select.tsx`, `menu.tsx` | Items are X on their own. Hover is a haze bloom inside the parent. |
| Toasts (sonner) | S (overlay) | add `[data-sonner-toast]` to `SELECTOR` (it cannot take `.glass-overlay`; `Providers.tsx` explains why) | At most 3 visible. Arcs may never strike a toast, because unbidden flashes are what 2.3.1 is about. |
| App toasts (`AppToaster`) | S | `.app-glass` on the toast | Same rule as sonner toasts. |
| Tooltips | C | `Tooltip.tsx` (`.glass-overlay`), demoted by size | Too short-lived and too small for a slot. Add a policy rule: an overlay under 4,000 px² does not take an ambient slot. |
| Sticky headers, nav rail, mobile dock, selection bar, quick nav | S (chrome) | `.glass-chrome`, `.site-sticky-chrome`, `RadialNavRail`, `RadialQuickNav`, `selection-bar.tsx` | Chrome redraws on scroll already. Ambient haze pauses during scroll (§3.3). |
| Panes: heroes, composers, settings sections, `PageLayout` sections | S (pane) | `.glass-pane`, `GlassPane` | Explicit `[data-liquid-glass]` opt-ins rank with panes. |
| Cards and list rows (`.glass-fill`, `Card`, `widget-frame`, `empty-state`) | C, or S when a slot is free | `.glass-fill` (338 files) | The repeated-content tier. At most 8 cards animate at once (live set). |
| Feed posts (`RMHarkCard`, `PostDetail`) | C | `.glass-fill` | Images, video and embeds sit **above** the haze (z ≥ 0) and are never hazed. Media keeps its colour. |
| Buttons: solid variants (`default`, `accent`, `destructive`, `danger`, `warning`, `secondary`) | S (control) when a slot is free, else C | `[data-slot=button]` | An accent body carries the accent as its pigment. That is allowed because an accent marks an explicit action. |
| Buttons: `outline` | C | `[data-slot=button]` | Has a border but a clear body, so the haze is faint. |
| Buttons: `ghost`, `accent-ghost` | L, on hover only | `[data-slot=button][data-variant=ghost]` | No resting body. Haze appears with the hover tint. |
| Buttons: `link` | X | — | Text. |
| Raw `<button>` with a surface (`bg-site-*`, border) | migrate (§2) | codemod to `Button`/`IconButton`/role class | The 563 raw site-tier buttons in 244 files are mostly unstyled wrappers. Only the styled ones migrate. |
| Raw `<button>` without a surface (row wrappers, disclosure toggles, toolbar glyphs) | X | — | Part of the parent's jelly. A body on every wrapper would double-jelly cards. |
| Icon buttons (`IconButton`, circular controls) | L | `icon-button.tsx` gains `data-slot="button"` + `data-variant="ghost"` | Circular shape kept. Press droplet only. |
| Inputs, textareas, search fields, select triggers | C (inset), rim-only flow | `.glass-inset`, `[data-slot=input|textarea]` | 01 §5.5: only the 8px edge band moves; caret and glyph area stay still. Never S: `input,textarea,select` are in `EXCLUDE`. |
| Native checkbox and radio (61 raw) | X | `accent-color` only | Forced-colours safe and native. Their labels' rows are part of the parent. |
| Switch | C | `switch.tsx`: the thumb is a jelly droplet, the track an inset | 14 raw `role="switch"` in 8 files migrate to `Switch`. |
| Slider primitive | C | `slider.tsx` thumb droplet, inset track | — |
| Raw `input[type=range]` (55 sites) | L | one central rule in `app/jelly-coverage.css` (track inset, thumb rim) | Mostly in games and apps. Centralised rather than migrated. |
| Tabs (`LiquidTabs`, 79 uses) | C | track `.glass-inset`; the selection thumb is a droplet that stretches between tabs (02 Tier E) | Central: one file. |
| Badges, notification counts | L, without press | `badge.tsx`, `notification-badge.tsx` | Static rim only. A pulsing count would be 2.2.2 motion that carries meaning. |
| Avatars (`UserAvatar`, 102 uses) | L | ring-only rim on `UserAvatar` | No haze over faces. Press squish only when the avatar is a control. |
| Back-to-top, FAB-like discs | C | `back-to-top.tsx` (`.glass-overlay` + `.glass-bevel-sm`) | — |
| Skeletons | L, no press | `skeleton.tsx` | Static haze only. A loading shimmer must not stack on top of jelly motion. |
| Spinners, radial loader, progress | X | — | Already in motion. Must not gain more. |
| Inline text links, body text, headings | X | — | Text is never jelly. |
| Images, video, maps, charts' plot area, code and rich-text editors, iframes, embeds | X | — | Their frames are C or S. Their content is never hazed. |
| Radial hub orb and globe | own renderer | `jelly-glass.ts`, `LiquidGlobe.tsx` (engine excludes `.radial-globe__stage`, `.radial-hub__orb`) | Already "gelatinous glass", and the visual reference for the material. Arcs may leave the globe rim (03). It keeps its own rAF and governor. |
| Site backdrop (aurora, radial backdrop field) | X for motion | — | `static-backdrop.test.ts` stays as it is. Full-viewport perpetual motion cost 1020 ms CPU/s (performance-audit-2026-10-08). |
| App tier `.app-glass`, `AppShell` header | S | `.app-glass` | Already in `SELECTOR`. |
| App tier cards `bg-(--app-surface)` (179 uses, 90 files) | C | adapter selector in `app-theme.css` gains the static haze and carrier eligibility | No per-file edit. `data-liquid-surface` (1 use) is the explicit form. |
| Game menus, pause screens, lobbies, results | C (S for the pause overlay) | `.app-screen`/`.app-page` button coat rule; game `.app-glass` panels | Games own the GPU, so S only when play is paused. |
| Game HUD chrome while playing | L | `[data-jelly-zone="hud"]` | Ambient motion near a moving play-field fights for attention and frame time. |
| Game play-fields (canvas, WebGL, DOM boards) | X | `[data-jelly-zone="playfield"]` | Engine admission 0 and arcs off while `data-game-state="playing"` (§3.2). |
| Scrollbars | X | tokens + `lib/scrollbar-reveal.ts` | Native scroll affordance. Never decorated. |
| `::selection` | X | token | Must stay crisp over text. |
| Focus rings | X, invariant | `globals.css` §focus-visible | §4.5. |

---

## 2. Reaching every element with minimal churn

### 2.1 Central first (no per-file edits)

Current reach of the central hooks, counted on `main` (`.tsx`/`.ts`/`.css` under
`components app lib hooks`, excluding tests):

| Hook | Files | Occurrences |
| ---- | ----- | ----------- |
| `.glass-fill` | 338 | 628 |
| `.glass-pane` | 151 | 238 |
| `.glass-inset` | 110 | 156 |
| `.glass-overlay` | 63 | 120 |
| `.glass-chrome` | 35 | 76 |
| `.glass-interactive` | 47 | 63 |
| `.glass-scrim` | 8 | 15 |
| `.app-glass` | 3 (CSS only) | 23 |
| `<Button>` | — | 1,251 |
| `<Badge>` / `<UserAvatar>` / `<Card>` / `<LiquidTabs>` / `<Dialog>` | — | 135 / 102 / 79 / 79 / 65 |
| `bg-(--app-surface)` (adapter) | 90 | 179 |

The new CSS goes in **one** file, `app/jelly-coverage.css`, imported after 01's
`app/jelly-material.css`. Keeping it out of the material sheets means coverage and
material never edit the same file. It holds:

1. tier-L and tier-X declarations by element type: avatars, badges, skeletons, native
   range, `[data-jelly-zone]`;
2. the `html[data-jelly-motion="calm|still"]` and device-tier demotions (§3.2, §4.2);
3. the game-play demotion `html[data-game-state="playing"]`.

`lib/jelly/selectors.ts` exports `JELLY_SELECTOR`. It equals the engine's `SELECTOR`
plus `[data-sonner-toast]` and `[data-jelly]`, the generic opt-in for anything without a
role. It also exports `JELLY_EXCLUDE`: the engine's `EXCLUDE` plus
`[data-jelly-zone="playfield"]`, `[data-jelly="off"]`, `video`, `iframe` and `img`. The
engine, the carrier service (01 M3), physics (02) and arcs (03) all import these, so
there is one definition of "is jelly".

### 2.2 Grep commands (re-run them to refresh counts)

```bash
# role usage
for c in glass-fill glass-pane glass-chrome glass-overlay glass-inset glass-scrim app-glass; do
  printf '%s ' "$c"; grep -rl --include=*.{ts,tsx,css} -- "$c" components app lib hooks | grep -v __tests__ | wc -l; done
# hand-rolled surfaces on one line (lower bound)
grep -rn --include=*.tsx -E 'rounded-site' components app | grep -E '\bborder\b' \
  | grep -E 'bg-site-(surface|bg|elevated)\b' | grep -v 'glass-' | wc -l          # 100
# the accurate count (multi-line className / cn() aware)
node scripts/codemods/jelly-roles.mjs --report                                # 249 surfaces, 141 files
# raw controls that bypass primitives
grep -rlE --include=*.tsx 'role="dialog"' components app | grep -v components/ui | wc -l   # 39 files
grep -rnoE --include=*.tsx 'type="range"' components app | wc -l                            # 55
grep -rlE --include=*.tsx 'role="switch"' components app | grep -v components/ui | wc -l   # 8 files / 14
grep -rnoE --include=*.tsx '<select(\s|>|$)' components app | wc -l                        # 10
```

The `--report` numbers come from a className-aware scan of 1,906 `.tsx` files. It counts
a className containing a surface background (`bg-site-surface|surface-opaque|bg|elevated`
or `bg-(--app-surface)`), a `rounded*` and a `border`, but no `glass-`/`app-glass`/`data-liquid`:

| Tier | Hand-rolled surfaces | Files |
| ---- | -------------------- | ----- |
| Site | 120 | 65 |
| Apps (rmhtube, rmhstudy, rmhtype, rmhcalculator, rmhmusic, studio, shared) | 55 | 30 |
| Games (the `FULLSCREEN_DIRS` list + dunesday, vega, bums-rush, rebar-rutabaga) | 74 | 46 (mostly rmhbox) |

### 2.3 Prioritised offenders

Ordered by traffic first, then count:

1. **Feed** (visible on `/`): `components/feed/RightSidebar.tsx` (4),
   `FlashcardsColumn.tsx` (3), `SpotifySongSearch.tsx` (3), `GroupChatsColumn.tsx` (2),
   `GroupChatView.tsx` (2), `DeckStudyColumn.tsx` (2). Raw buttons with surfaces:
   `ComposeBox.tsx` (30 raw buttons), `ComposeModal.tsx` (14), `CommentItem.tsx` (7),
   `ShareModal.tsx` (6), `ImageCropModal.tsx` (6).
2. **News and library:** `components/news/NewsHero.tsx` (3); `components/library/BookReader.tsx`,
   `AlbumViewer.tsx`, `UploadModal.tsx`, `LibraryCollections.tsx` (buttons and 4 raw dialogs).
3. **Casino (`components/rmhcoins`, 49 single-line hits):** `HoldemControls.tsx` (6),
   `HoldemLobby.tsx` (6), `BaccaratLobby.tsx`, `BlackjackLobby.tsx`, `RouletteLobby.tsx` (5
   each), `RouletteTable.tsx` (4), `BaccaratControls.tsx`, `PlinkoGame.tsx`,
   `BlackjackControls.tsx` (3 each). One codemod pass; the lobbies share a shape.
4. **Economy and social dialogs:** `economy/TipDialog.tsx`, `gifting/GiftCoinsButton.tsx`,
   `replays/GameReplayPlayer.tsx` (5), `shared/ReactionMenu.tsx`,
   `shared/EmojiPickerPanel.tsx`, `site/LanguageSwitcher.tsx`, `site/KeyboardShortcuts.tsx`.
5. **Apps:** `rmhtype/RmhTypeRoomPage.tsx` (6), `rmhtube/RmhTubeLanding.tsx` (5),
   `rmhstudy/RmhStudyLanding.tsx`, `RmhStudyRoomPage.tsx` (4 each), `RmhStudyFlashcards.tsx`,
   `rmhtype/RmhType{Landing,MultiplayerPage,SoloPage}.tsx` (3 each), `rmhtube/{ChatPanel,MemberList}.tsx`.
6. **Games:** `components/rmhbox/**` (≈56 adapter hits plus 46 files of hand-rolled ones),
   then raw dialogs in `components/dunesday` (7) and `temple-of-joy` (3).

### 2.4 Codemod (`scripts/codemods/jelly-roles.mjs`)

The codemod defaults to a dry run; `--write` applies, `--report` prints the counts above.
Each rule has a reason, and the hard cases go to a human:

| Pattern in one className | Rewrite | Notes |
| ------------------------ | ------- | ----- |
| surface bg + border + rounded, not positioned | drop `bg-site-surface border border-site-border`, add `glass-fill` | Default for repeated content. If the file renders it exactly once, the `--report` output flags it as a `glass-pane` candidate for review. |
| the above + `fixed`/`absolute` + `z-*` + an edge anchor | `glass-overlay` | Same detection as design-consistency rule (7). |
| `bg-(--app-surface)` inside an app/game dir | leave (the adapter covers it) | Zero churn. |
| raw `<button>` with a surface bg or border | `<Button variant=…>` when the classes map cleanly (`bg-site-accent` → default, `bg-site-surface` → secondary, border only → outline), else add `data-jelly` | Done by hand where props differ (`asChild`, refs). |
| raw `role="switch"` | `<Switch>` | 8 files; by hand. |
| raw `role="dialog"` overlay | `<Dialog>`/`<Sheet>`/`<OverlayPanel>` | 39 files; by hand. The codemod only lists them. |

It never touches files under `FULLSCREEN_DIRS` without `--games`, so site and game passes
can land and be reviewed separately.

### 2.5 Ratchet gate

New `lib/__tests__/jelly-coverage.test.ts` (built by 05, rules specified here). It uses the
same frozen-count pattern as "never lets a stylesheet get worse than its frozen count" in
`design-consistency.test.ts`:

- the hand-rolled-surface count per file may only go down (debt map frozen at today's 249);
- no new `role="dialog"` or `role="switch"` outside `components/ui`;
- no `data-jelly="off"` outside `[data-jelly-zone]`, media and a short justified allowlist;
- it scans more than 1,500 files, so a broken walker cannot make it pass vacuously.

`check-consistency.sh` previews the added-lines version.

---

## 3. Performance budgets

### 3.1 The numbers (final; supersede 01 §2.7 and 02 D7)

| Budget | Desktop, fine pointer | Tablet / coarse > 1024px | Handheld `(pointer: coarse) and (max-width: 1024px)` | `perf-lite` | Game playing |
| ------ | --------------------- | ------------------------ | ----------------------------------------------------- | ----------- | ------------ |
| Rim slabs (`GLASS_BUDGET.maxSurfaces`) | 24 | 16 | 10 | 0 | 2 (pause UI only) |
| **Ambient slots** (haze canvases redrawn on the clock) | 8 | 6 | 4 | 0 | 0 |
| CSS carriers (live set) | 24 | 16 | 8 | 0 | 0 |
| Animated area (haze + carriers) | ≤ 1.5 viewports | ≤ 1.25 | ≤ 1.0 | 0 | 0 |
| Ambient clock | 30 Hz / 12 Hz idle | 30 / 12 | 15 / 8 | 0 | 0 |
| Tier E bodies (02) | 12 | 8 | 6 | 3, press only | 0 |
| Tier L lattices (02) | 8 (= ambient slots, not 24) | 6 | 4 | 0 | 0 |
| Ambient arcs (03) | ≤ 1 per 2 s | ≤ 1 per 2 s | 0 | 0 | 0 |
| Click arcs | ≤ 3 bolts per click | ≤ 2 | 1 | 0 | 0 |
| Flash ledger (all arcs) | ≤ 3 onsets / 1000 ms | same | same | — | — |

Why the ambient slots are 8 rather than 24: each animated haze canvas is a compositor
layer that is re-rastered on every tick. 24 continuously invalidated layers plus 24 rim
copies is the 2026-10-08 failure in a new form, a page that never goes idle across many
layers. Ambient slots go by priority overlay → chrome → pane → fill → control, then by
distance to the pointer (fine pointer) or to the viewport centre (coarse). The other
admitted slabs keep their rim canvas and move with a carrier. 01 must key carrier
suppression on `data-jelly-haze="on"` (a haze canvas exists), **not** on
`data-liquid-canvas="on"` (a rim canvas exists). Otherwise 16 rim-only slabs would sit
frozen.

Carriers drop from 01's proposed 40 to 24. With 1–2 transform spans each, the carriers
come to 24–48 compositor layers. Beyond that, layer memory on a 3× DPR phone matters more
than frame time.

### 3.2 Device and state tiers

`lib/jelly/tiers.ts` exports `jellyTier(env): 'full' | 'coarse' | 'handheld' | 'lite' | 'off'`
and `JELLY_BUDGETS[tier]`. The inputs are only signals the site already uses:

- `html.perf-lite` (pre-paint, `lib/perf-tier.ts`);
- the handheld query, copied exactly from `handheld-tier.test.ts`. That test's near-miss
  scan must be extended to `lib/jelly/tiers.ts` and `app/jelly-coverage.css`;
- `(hover: hover) and (pointer: fine)`;
- the off predicate (§3.4);
- `html[data-jelly-motion]` (§4.2);
- `html[data-game-state="playing"]`, stamped by the shared game-session hook in
  `lib/game-capabilities.ts`.

The tier is computed once per route and on media-query change. It never flips because of
a frame-rate reading; that is what the governor (§3.3) is for, and the governor touches
only engine-internal knobs. This follows `lib/perf-tier.ts`'s reasons for not restyling
the document under the user.

### 3.3 Runtime controls (all inside the engine's existing frame)

- **Hidden tab:** clock 0, every body cleared, arcs scheduler paused. Existing teardown
  semantics are kept.
- **Window not focused** (`blur`, `document.hasFocus() === false`): clock 0, with the haze
  frozen on its last frame. This is a cheap win for second-monitor tabs. Resume on
  `focus`.
- **Scrolling:** ambient haze ticks pause, carriers get `animation-play-state: paused`
  through `html[data-scrolling]` (one attribute, already tracked by the engine's
  `scrolling` flag), and ambient arcs are suppressed. Rim refresh is unchanged.
- **Offscreen:** the registry's single IntersectionObserver uses `rootMargin: 0` for
  live-set and ambient-slot membership, and a separate 200px pre-warm margin for canvas
  allocation. Nothing outside the viewport animates. Carriers detach after 2 s
  offscreen; 01 M3 already detaches them.
- **Idle:** 12 Hz after 20 s without input, as in 01 D4. Add: **0 Hz after 120 s without
  input**, with the frame held, resuming on any pointer, key, scroll or focus. Tab-open
  dashboards then cost nothing while unattended, and "always-on" still holds whenever a
  person is there.
- **Jelly governor** (`lib/jelly/governor.ts`, pure, tested). It is modelled on
  `lib/eversion/gl/governor-tiers.ts`: downscale-only, a warm-up of 30 ticks, and a
  2 s window. If p90 jelly frame cost exceeds the target (below), or p90 rAF dt exceeds
  1.5× the clock period, it steps down in this order:
  1. clock 30 → 20 Hz;
  2. ambient slots halved;
  3. carriers halved;
  4. ambient arcs off;
  5. haze canvases at 0.125 scale;
  6. clock 0 (static haze).

  It takes at most one step per 2 s and never steps back up within a route. This is the
  battery and thermal answer (C5). Safari Low Power Mode caps rAF at 30 Hz, and the dt
  rule catches it on the first window.
- **Save-Data / 2g:** already `perf-lite`.

### 3.4 Off predicate (`lib/jelly/tiers.ts → jellyOff(doc)`)

`jellyOff(doc)` returns true when any of these holds. It merges the engine's `off()`,
`runtime.ts`'s `disabled()` and 03 D8:

- `prefers-reduced-transparency: reduce`;
- `forced-colors: active`;
- print;
- `.style-high-contrast` or `.app-high-contrast`;
- legacy `.reduce-transparency` (cleared by Providers, kept for safety);
- `html[data-jelly-motion="still"]`, for **motion** only;
- `html[data-material]` not equal to `jelly`, until 05 deletes the flag (01 D9).

`perf-lite` is not "off". It is the `lite` tier, which keeps static haze and press.

### 3.5 Frame-time and rest-cost targets (advisory, measured; not CI-blocking, per `docs/performance-slo.md`)

| Metric | Desktop (1920×1080, mid laptop) | Handheld (Moto G-class, 4× CPU throttle) |
| ------ | ------------------------------- | ---------------------------------------- |
| Jelly main-thread work per ambient tick (registry, clock, physics, carrier bookkeeping) | ≤ 2.0 ms | ≤ 3.0 ms |
| GPU per tick (haze draws + copies) | ≤ 2.5 ms | ≤ 4.0 ms |
| Browser CPU at rest, input in the last 20 s, on `/` | ≤ 250 ms/s (baseline 63 static; 1020 was the failure) | ≤ 200 ms/s at 15 Hz |
| Browser CPU after 120 s idle | ≈ baseline (≤ 80 ms/s) | ≈ baseline |
| Scroll frames on `/` feed fling | no dropped-frame regression vs `main` | same |
| INP p75 (RUM, `lib/rum.ts`) | no regression beyond 10 ms vs the 7 days before rollout | same |

Measured by a new `testing/e2e/jelly-budget.mjs`. It uses CDP `Performance.getMetrics`
(`TaskDuration`) over 10 s windows on `/`, a dense feed and an app route, at both device
profiles, with the method of `docs/performance-audit-2026-10-08.md`. Its results go into
a new `docs/performance-audit-<date>.md` before the `data-material` flag is removed.

---

## 4. Accessibility

### 4.1 The motion question, stated honestly

The repo retired the reduced-motion setting and OS motion overrides on purpose (CLAUDE.md
§7: "must not return"). Under Liquid Glass that was defensible: at rest nothing moved,
and all motion was user-initiated and short. Plasmatic Jelly changes the facts.

- **WCAG 2.2.2 Pause, Stop, Hide (A).** Ambient haze and carriers start automatically,
  last more than 5 s, and appear beside content. The Understanding document states that
  the criterion applies to decorative content too. The "essential" exception does not
  apply. **Conformance needs a mechanism to pause, stop or hide the motion.** Because of
  the non-interference requirement, this holds on every page, not only where the haze is
  noticeable.
- **WCAG 2.3.1 Three Flashes (A)** applies to arcs: bright, brief, repeated. It is covered
  by 03's ledger plus area and red limits (§4.4).
- **WCAG 2.3.3 Animation from Interactions (AAA)** applies to soft-body wobble and click
  arcs. AAA is not required, but "Still" (below) satisfies it at no extra cost.

### 4.2 The control: `Jelly motion` (Lively / Calm / Still)

This is a **material** setting in Settings → Appearance, next to 03's `electricArcs`. It
does not restore `reduce-motion`. It reads no OS media query. It does not touch navigation
transitions, framer-motion variants or `useReducedMotion()`, which keeps returning
`false`.

| Value | Ambient haze / carriers | Soft body (02) | Arcs (03, combined with `electricArcs`) |
| ----- | ----------------------- | -------------- | ---------------------------------------- |
| `lively` (default) | full budgets (§3.1) | full | as the arcs setting says |
| `calm` | amplitude × 0.4, clock ≤ 12 Hz, slots and carriers halved | wobble ζ 0.85 (one overshoot), no neighbour nudge | ambient off; clicks per `electricArcs` |
| `still` | **no ambient motion**: static haze frame, carriers detached, clock 0 | press only (ζ → 1), no hover body | off, whatever `electricArcs` says |

Pipeline. It mirrors `alwaysEvertGlobe` and `navTransition`, and the same pipeline 03 D9
uses:

- **`lib/appearance/prefs.ts`:** `JELLY_MOTION_LEVELS`, `DEFAULT_JELLY_MOTION = 'lively'`,
  `resolveJellyMotion()` (unknown → default), `JELLY_MOTION_KEY = 'rmh-jelly-motion'`
  (cached only when not the default), and `applyJellyMotion(html, v)`, which sets or
  removes `data-jelly-motion`.
- **`prefs-schema.ts`:** `jellyMotion: z.enum(JELLY_MOTION_LEVELS).nullable().optional()`.
- **`prisma/schema.prisma`:** `jellyMotion String? @db.VarChar(8)`, nullable with no
  backfill. **Do not reuse the retired `reduceMotion` column.** It holds stale values
  from users who set an old preference with different semantics, and reviving it would
  quietly change their site. **One migration carries both `jellyMotion` and 03's
  `electricArcs`**; whichever workpackage lands first adds both.
- **API, seed and store:** the GET/PUT `jellyMotion` field in
  `app/routes/api/preferences/appearance.ts`, then `lib/appearance/account-seed.ts`,
  `stores/themeStore.ts`, and the `components/Providers.tsx` applier.
- **Pre-paint:** the `__root.tsx` theme script reads `rmh-jelly-motion` and stamps
  `data-jelly-motion` before first paint. This keeps `fouc-contract.test.ts` green.
  Signed-out visitors keep it in localStorage.
- **Discoverability:** besides Settings → Appearance (`AppearancePanel.tsx`), add a
  one-tap **"Pause ambient motion"** toggle to the radial quick panel (`QuickPanel.tsx`)
  that cycles to `still` and back. 2.2.2 expects the mechanism to be easy to find, and
  Settings is three levels deep. All strings go through `t()` in the `settings`
  namespace, followed by `pnpm i18n:extract`.
- **Tests:** `lib/__tests__/appearance-jelly-motion.test.ts`, modelled on
  `appearance-nav-transition.test.ts`, checks that the list, schema, API, pre-paint
  script and applier agree.

**Owner decision flagged:** this plan treats `Jelly motion` as compatible with §7
because it is a material/appearance control and honours no OS signal. If the owner wants
the OS `prefers-reduced-motion` to pre-select `calm` for first-time visitors, that is a
one-line pre-paint change, but it reverses §7 and needs the owner's explicit approval.
It is not done by default.

### 4.3 Motion safety bounds (apply to `lively` too)

These are vestibular and attention limits. They are pinned in `lib/jelly/tiers.ts` and
asserted by `lib/jelly/__tests__/tiers.test.ts`:

- Ambient drift ≤ 12 px/s, feature size ≥ 120 px, luminance period ≥ 6 s (01 §5.3). No
  luminance modulation faster than 3 Hz anywhere in the haze.
- No ambient motion of a surface's **position**: haze moves inside a still host. Host
  movement comes only from user input (02), capped at 3% and 4px (02 D3).
- Large surfaces (> 250,000 px²) get no host affine and lattice amplitude × 0.5. Big
  moving areas are the vestibular trigger.
- Nothing ambient goes on full-viewport layers (static-backdrop gate).

### 4.4 Photosensitivity (arcs)

Adopt 03 D7 as written, plus three coverage-level rules:

1. The ledger is **site-wide**. It counts arcs, and also any future "plasma pulse" (01's
   `pulse(el, k)`) above 0.1 relative-luminance change.
2. The arc hue clamp applies to custom accents and user themes (`lib/themes/tokens.ts`).
   A saturated red accent never yields a red flash. `ensureReadableAccent()`-style
   clamping goes in `lib/jelly/arcs` colour resolution.
3. No arc strikes a toast, a field with focus, or an element under the caret.

### 4.5 Focus

- The ring stays `outline: 2px solid var(--site-accent); outline-offset: 2px` (globals.css
  §focus-visible). It is drawn by the host, so 02's Tier E affine carries it along, and
  Tier L deformation happens inside the canvas, which is clipped to the host box.
  **Rule: no jelly layer paints outside the host's border box**, so nothing can cover the
  ring. 02's "canvas overdraw margin" must stay at or below the ring offset (2px), or the
  ring offset on jelly roles rises to match. Pinned in the policy test.
- `:focus-visible` on a jelly host freezes that host's carrier and haze (clock skip). A
  ring over a moving ground is harder to track.
- Keyboard activation gets the press body and at most one dim arc (03 D4). Tab order,
  hit areas and layout never change; Tier E is visual only.
- Fields keep "caret + border" as their focus cue. The inset rim band never animates
  while the field is focused.

### 4.6 Contrast

01 §5.2 `jelly-legibility.test.ts` is the authority. Text ≥ 4.5:1 and muted text ≥ 3:1
over worst-case composites, and luminance spread ≤ 0.04. This plan adds:

- **1.4.11 non-text contrast:** an input's or switch track's boundary (hairline +
  rim) must reach ≥ 3:1 against the composite in every theme. Today's 85%-border mix on
  `.glass-inset` is close to the line in Daylight, so add the assertion and darken
  `--site-border` in that block if it fails.
- **User themes:** extend the publish-gate contrast lint (`theme-tokens.test.ts`) with the
  same composite, so a published theme cannot be legible only without haze.
- **Colour-vision modes** change no jelly token, because jelly carries no meaning. Badges
  keep their glyphs.

### 4.7 Forced colours, reduced transparency, print, screen readers

- **Forced colours:** no canvases, carriers, haze, arcs or physics transforms. The
  existing `:is(.glass-*)` block in `globals.css` (`border: 1px solid;
  background-image: none`) gains `.jelly-flow, .jelly-haze-canvas, .jelly-arc-layer
  { display: none }` and `[data-jelly-body] { translate: none; scale: none }`.
- **OS reduced transparency:** opaque `--site-surface-opaque` surfaces and no haze. Press
  is kept, because it is not a transparency effect.
- **Print:** everything hidden, flat surfaces.
- Every jelly layer is `aria-hidden="true"` and `pointer-events: none`, with no live
  regions. Arcs never take focus or announce.

---

## 5. Theme matrix

| Theme / mode | Material | Haze colour | Ambient motion | Arcs | Soft body |
| ------------ | -------- | ----------- | -------------- | ---- | --------- |
| Daylight (`default`, `#fff`) | S/C/L as §1 | ink-derived milky grey (`--site-text` 3–5%); white haze is invisible on white | yes | `source-over`, darker than the ground (03 §1.3); no white flash | full |
| Midnight (`.style-graphite`, `#000`) | S/C/L | luminous (`--site-glass-light` 4–8%) with a 3% plasma subsurface | yes | `lighter` composite; ≤ 0.1 ΔL over the glow | full |
| High contrast (`.style-high-contrast`) | none: opaque surfaces, 2px-equivalent borders | none | none | none | press only |
| User themes (`rmh-user-theme` vars) | S/C/L | derived from `--site-bg` luminance, as the engine's `readTheme()` does | yes | accent-derived, red-clamped | full |
| Custom accent | — | — | — | accent-derived, clamped | — |
| Colour-vision modes | unchanged | unchanged | — | — | — |
| App tier dark / light (`.app-theme`, `.app-light`) | `--app-jelly-*` (01 §4.3) | as Midnight / Daylight | yes, not in play | yes, not in play | full |
| App high contrast (`.app-high-contrast`) | none | none | none | none | press only |
| Game own palettes (Slice It, Temple of Joy…) | HUD reads `--app-*` | — | menus only | menus only | menus only |
| `data-jelly-motion="calm"` | unchanged | unchanged | × 0.4, ≤ 12 Hz | clicks only | damped |
| `data-jelly-motion="still"` | unchanged (static haze) | unchanged | none | none | press only |
| `perf-lite` | static haze + CSS rim, no canvases | unchanged | none | none | press only |
| OS reduced transparency, forced colours, print | none | none | none | none | press (none in print) |
| RTL (`ar`, `ur`) | unchanged; the haze flow is direction-neutral | — | — | — | the release overshoot of 02's directional nudge mirrors with `dir` |

Browser review floor (§0.9 of design-language): Daylight, Midnight and High contrast ×
320px and 1440px × `lively` and `still`, plus one app route in app-light. That makes 12
screenshots per UI workpackage.

---

## 6. Implementation list and ownership

Coverage work splits into seven workpackages with disjoint file sets. Files owned by
01–03 are listed only as hand-offs.

| WP | Owner | Creates (C) / modifies (M) | Depends on |
| -- | ----- | -------------------------- | ---------- |
| **P1 Tiers and budgets** | perf agent | **C** `lib/jelly/tiers.ts` (tier, `JELLY_BUDGETS`, `jellyOff`, motion bounds), `lib/jelly/governor.ts`, `lib/jelly/selectors.ts`, `lib/jelly/__tests__/{tiers,governor,selectors}.test.ts`. **M** `lib/__tests__/handheld-tier.test.ts` (scan the two new files). | — (lands first; interfaces only) |
| **P2 Registry** | perf agent | **C** `lib/jelly/registry.ts`: one IntersectionObserver and one ResizeObserver over `JELLY_SELECTOR`, visibility/size/priority, `ambientSlots()` and `liveSet()` selection, consumed by engine, carriers, physics and arcs. **C** its test. No rAF: selection runs in the engine's frame. | P1 |
| **P3 Primitives and central CSS** | UI agent | **C** `app/jelly-coverage.css` (import in `app/globals.css` after `jelly-material.css`; that one import line is the only globals edit). **M** `components/ui/{icon-button,switch,slider,liquid-tabs,badge,notification-badge,UserAvatar,skeleton,Tooltip,back-to-top}.tsx` (data-slot/variant/`data-jelly` attrs, tier-L markers), `components/Providers.tsx` (sonner `classNames.toast` only), `components/shared/AppToaster.tsx`. | P1 (selectors) |
| **P4 Site migration** | 2 agents split by directory | **C** `scripts/codemods/jelly-roles.mjs`. **P4a** `components/rmhcoins/**`. **P4b** `components/{feed,news,library,economy,gifting,replays,homes,site,shared,spaces,share,moderation,calendar}/**`, `app/routes/**` hits. Raw dialogs, switches and selects in those dirs move to primitives. | P3 |
| **P5 App tier** | app agent | **M** `components/shared/app-theme.css` (adapter gains haze + carrier eligibility; `--app-jelly-*` values come from 01 M2, so coordinate on the one block), `components/shared/AppShell.tsx`, the `rmhtube/rmhstudy/rmhtype/rmhcalculator/rmhmusic/studio` offenders in §2.3. | P3, 01 M2 |
| **P6 Games** | games agent | **M** `lib/game-capabilities.ts` (stamp and clear `html[data-game-state="playing"]` from the shared session hook), the `[data-jelly-zone="playfield"|"hud"]` attributes on each `FULLSCREEN_DIRS` game's stage/HUD root (one line per game), `components/rmhbox/**` migration, raw dialogs in `dunesday`/`temple-of-joy`. **M** `lib/__tests__/game-viewport-consistency.test.ts`: each game declares a playfield zone. | P1, P3 |
| **P7 Settings and a11y** | settings agent | **M** `lib/appearance/{prefs,prefs-schema,account-seed}.ts`, `app/routes/api/preferences/appearance.ts`, `prisma/schema.prisma` + one migration (`jellyMotion` **and** 03's `electricArcs`), `stores/themeStore.ts`, `components/Providers.tsx` (applier effect; coordinate with P3's one-line sonner edit), `app/routes/__root.tsx` (pre-paint), `components/settings/AppearancePanel.tsx`, `components/radial/QuickPanel.tsx`, `locales/en/settings.json` via `pnpm i18n:extract`. **C** `lib/__tests__/appearance-jelly-motion.test.ts`. | P1 |

Hand-offs:

- **01 material:**
  - read `JELLY_BUDGETS` from `lib/jelly/tiers.ts` instead of hard-coding `JELLY_CLOCK`
    numbers;
  - key carrier suppression on `data-jelly-haze="on"`;
  - honour `ambientSlots()` from the registry;
  - add `[data-sonner-toast]` through the shared `JELLY_SELECTOR`;
  - its 8-surface wording becomes "8 ambient slots of 24 rim slabs".
- **02 soft body:**
  - Tier L cap = ambient slots (8/6/4), not the engine's 24;
  - overdraw margin ≤ 2px (§4.5);
  - read `data-jelly-motion` for the calm/still damping.
- **03 arcs:**
  - import `jellyOff` from `lib/jelly/tiers.ts`, not `lib/jelly/policy.ts`;
  - the registry is `lib/jelly/registry.ts` (P2);
  - `still` forces arcs off;
  - share the single migration with P7.
  - 02's `lib/jelly/bridge.ts` and 03's `lib/jelly/bus.ts` should be one module, which
    02 and 03 should agree on.
- **05 gates/docs:**
  - build `jelly-coverage.test.ts` (§2.5);
  - amend design-language §9: its "html.reduce-motion / reduce-transparency are set by
    Settings → Appearance" bullet is stale. Replace it with the `Jelly motion` control
    and the 2.2.2 rationale;
  - §5.1's "≤24 visible shader slabs" and blur-tier wording;
  - the `docs/liquid-glass-system.md` fallback table, which this plan's §3–§5 replace.
- **Mount point:** keep `hooks/useLiquidInteractions.ts` (no rename). The registry,
  carriers, physics and arcs are lazy-mounted in its one idle callback with one teardown.

Order:

1. P1, then P2 (no visual change).
2. P3 and P7 in parallel.
3. P4a, P4b, P5 and P6 in parallel.
4. Measure (§3.5).
5. 05 removes the `data-material` flag.

Every step passes `pnpm check:consistency`.

---

## 7. Open questions for the owner

1. **OS motion signal.** Should `prefers-reduced-motion` pre-select `calm` for first-time
   visitors (§4.2)? Recommended yes for 2.2.2 robustness, but it reverses CLAUDE.md §7, so
   it is not done without the owner's approval.
2. **120 s idle freeze (§3.3).** It weakens "always-on" for unattended tabs in exchange
   for near-zero idle cost. Recommended yes.
3. **Handheld ambient arcs** are 0 in this plan, which overrides 03's "both tiers". This is
   for battery and because arcs near a thumb read as a touch error. Click arcs remain.
