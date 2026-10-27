# Jelly groups: fewer pills, more parents (design)

Date: 2026-10-27 · Scope: main site (`_site` shell + pages) and shared UI (`components/ui/`, `components/radial/`, `components/feed/`, `components/site/`). Out of scope: the full-screen game/app tier (`--app-*`).

## Intent

Today almost every control is its own capsule: top-bar buttons, tab segments, filter chips, action rows. Each is a separate jelly body with its own rim, so a bar of four buttons reads as four raised pills inside a bar that is already a jelly pill. The owner wants the **group** to be the body and its members to lie **flat inside it**, the way the feed's compose + jump-to-top control already works (`radial-feed__compose`: one body, plain children). Menus and selects already follow this ("one rounded slab, rows are plain text"). Tab groups should too: the selected tab is a soft **glow lying flat on the parent**, not a raised thumb.

## Goals

- A shared `JellyGroup` primitive that is the one way to build a cluster of related controls.
- Top bar: the buttons are flat members of the bar. Hover/press wash and the unread dot remain; no per-button rim.
- `LiquidTabs`: sheet is the parent; the selected tab is a flat accent glow that morphs between tabs; no raised thumb. Its public API is unchanged, so its ~100 call sites convert without edits.
- An audit of the site tier that classifies every pill cluster as _group_ or _legitimately standalone_, and converts the groups. The audit is written down (`docs/jelly-group-audit.md`) so it can be re-run by grep.
- Docs updated: the "every button, field and tab is a pill" rule in `docs/design-language.md` and the matching lines in `CLAUDE.md`.

## Non-goals

- Games and full-screen apps (`--app-*`, `components/shared/`), a later pass if wanted.
- Engine work: no change to `lib/liquid/glass/engine.ts`, `lib/jelly/physics.ts` or `lib/jelly/arcs/`.
- A new CI gate or lint rule (owner decision: gates already take too long).
- Changing layout, hit areas or touch targets.

## Anti-goals (a failure even if it works)

- Two rims on one line: a member that still draws its own edge inside a parent.
- Any new per-component pointer loop, `backdrop-filter`, `infinite` keyframe, box-shadow, or animated root property (CLAUDE.md §4).
- Losing the selected-state signal in `high-contrast`/forced colors, where today's rule keeps a filled accent thumb.
- Turning every standalone element into a group. A lone primary action, avatar, badge or dot stays itself.

## Constraints from the codebase

- Controls are jelly bodies **by default** (`lib/jelly/physics.ts` presses every control; `data-fluid-press` is an alias). A flat member must opt out with the documented `data-jelly="off"`; the parent keeps the press.
- Nested bodies mold, never stack (`roomFor`, `NEST_GAP` in `lib/liquid/glass/policy.ts`); a member must not carry a glass role class.
- No `overflow: hidden` directly around a body; `--jelly-margin` (16px) stays unclipped around the parent.
- Concentric radii in 8px steps: a member's radius is the parent's minus its inset. Controls up to 48px tall are pills (24px), taller boxes are rounded rectangles.
- Hover/selected washes reuse the existing `data-evert` state layer (opacity transition, no keyframes). Selected glow is `--site-accent` mixed into transparent, text stays 4.5:1 in all three themes.
- Tabs keep their a11y: roving arrows, `aria-selected`/`aria-current`, overflow scroll + edge fade, `layoutId` scoped by `useId`.
- Motion tokens only (`SPRING`, `EASE`, `DURATION`).

## Approaches considered

- **A. One primitive, converted by hand (chosen).** Visible, reviewable per-call-site changes; groups are a design choice made by a person.
- **B. Engine/CSS rule that flattens every child of a glass role.** Least code, but silently changes cards inside panels that must stay separate bodies. Rejected.
- **C. A plus a CI gate for pill clusters.** Best long-term guard, rejected by the owner for CI time. The audit doc is the substitute: it records what was converted so a later pass can find regressions with one grep.

## Design

### `JellyGroup` (`components/ui/jelly-group.tsx`, `data-slot="jelly-group"`)

- Renders the parent: a rounded slab taking a glass role by context (`role="chrome" | "pane" | "fill"`, default `fill`; sticky bars pass `chrome`). It is the only body in the cluster and carries the press, haze and rim.
- `JellyGroup.Item` (`data-slot="jelly-group-item"`): sets `data-jelly="off"`, `data-evert`, flat shape (`border-radius` concentric to the parent), no border, transparent fill. Hover and keyboard focus show the soft wash; `selected` adds the flat accent glow (`data-evert~='select'`-style, driven by `aria-pressed`/`aria-selected`/`aria-current`/`data-selected`). Items are `asChild`-capable so a `<Link>` or Radix trigger can be a member.
- Props: `orientation` (`horizontal` default), `size` (`sm|default`, mirrors the existing control heights), `inset` (default 4px). Optional `Divider` member: a short soft separator, the same as menus.
- Structure rule: groups are one level deep. A group never contains a group.
- Degradation: the parent already goes opaque in `high-contrast`/`reduce-transparency`/`perf-lite`; items keep a visible selected cue there (filled accent in high contrast, as today).

### Top bar (`components/radial/RadialShell.tsx`, `radial.css`)

Search, messages, bell, display, and Sign in become flat members of the bar (`data-fluid-press` removed from each; `data-jelly="off"`). The bar is already `glass-chrome`. The avatar stays a circular member. Unread dot unchanged. No change to the panels they open.

### `LiquidTabs` (`components/ui/liquid-tabs.tsx`, tab styles in `globals.css`)

Keep the component, API, keyboard model and overflow behaviour. Replace the raised "thumb" (`data-tab-thumb`: surface, hairline, small shadow) with a flat glow element on the same `layoutId` morph. The sheet is the group parent. `--tab-thumb-*` variables remain as the re-skin hook (Slice It! and similar), mapped to the glow. High contrast keeps the filled accent.

### Menus, selects, search

`anchored-menu`/`select`/`menu` already match the model; the audit verifies them and fixes drift only. Text fields stay `glass-inset` (their own role) and are not folded into groups; a toolbar of field + dropdown is spaced, not merged (builder may revisit if it looks wrong at phone width).

### Audit method and conversion order

1. Inventory: grep the site tier for clusters of two or more adjacent pill-styled siblings (`rounded-full`/`--site-control-radius` with button/link/chip children), within `components/{ui,radial,feed,site,...}` outside game/app dirs and `app/routes/_site/**` plus top-level non-game routes that use the site shell.
2. Classify each in `docs/jelly-group-audit.md`: **group** (convert), **standalone** (keep: lone primary action, avatar, badge/tag, dot, progress), **n/a** (game/app tier, deferred).
3. Convert in reviewable commits, in this order: primitive + docs; top bar; `LiquidTabs`; shared UI clusters (pagination, horizontal scroller chips, reaction/engagement action rows, selection bar, RSVP/segment-like controls); site pages and feed/profile/settings rows; finish by filling the audit doc.

### Docs

Rewrite the pill statement in `docs/design-language.md` (§ on corner scale/controls and §13) and the "controls are pills" lines in `CLAUDE.md` to state the group rule: a cluster of related controls is one body with flat members; a lone control may still be a pill. Add `JellyGroup` to the primitives table.

## Verification (no new gate)

Existing tests stay green (`design-consistency`, `site-infinite-animation`, tab-strip checks; adjust a rule only if it encodes the old thumb, and say so in the commit). Because the new look cannot be tested mechanically, each stage is checked by screenshots in Daylight, `.style-graphite`, `.style-high-contrast`, phone and desktop widths, and jelly motion `still`, using the pre-installed Chromium.

## Decisions made without the owner (flag when reading)

- Fields stay separate `glass-inset` bodies rather than joining a group.
- Badges/tags stay standalone pills; they are labels, not controls.
- No engine change; flat members use the existing `data-jelly="off"` opt-out.
- Selected tab glow replaces the raised thumb everywhere, including routes that re-skin it.

## Left to the builder

Exact CSS token names and glow strength, the precise inset per size, how `Divider` renders, the audit inventory itself, and per-call-site judgment on group vs standalone (record it in the audit doc).

## Resolutions from the builder check (my calls unless marked "owner")

- **Press feel:** attributes and CSS only, no engine change. Members carry `data-jelly="off"`; a press anywhere in the group presses the **parent** body (its dent follows the pointer across members). `JellyGroup.Item` must set the attribute itself, including when `asChild` wraps a `<Link>` or Radix trigger.
- **What draws the glow:** a tinted, **feathered** fill, the same recipe as the dropdown row glow (`radial-gradient` of `--site-accent` at `--row-glow-strength`, fading to nothing at the edges), driven by the existing opacity state layer. No hard edge, no shadow, no keyframe, so it cannot read as a second rim. The tab morph moves this element with the existing `layoutId` spring. Plasma and `roomFor` are not involved: the glow is not a body.
- **Size:** a group takes the outer size the old cluster had; members shrink by the inset (default 4px). The top bar height and the 44px coarse-pointer touch target do not change, and tab call sites do not reflow.
- **Group in a card:** a group inside a `glass-pane` or `glass-fill` card is its own `fill` body and molds inside the card (`roomFor`). A cluster that has no parent worth a body stays standalone rather than becoming a body-less group.
- **Tiebreaker for ambiguous clusters:** convert only if the members sit on one row (or scroll in one row), are the same kind of control, and are mutually related (tabs, segmented choices, toolbars, action rows, pagination). Chips that wrap onto several lines, or that are added and removed independently (tags, filters the user builds), stay standalone. Record each ambiguous call in the audit doc.
- **Acceptance:** the builder captures before/after screenshots for each stage (themes and widths as above) and attaches them to the PR; the owner reviews them there. No stored baseline.
- **Open, owner decision (asked in chat):** `LiquidTabs` and the `--tab-thumb-*` variables are also used by games/apps (`components/slice-it`, `laundry-sort`, `rmhtube` watch party, `rmhtype`, `daily-puzzles`, `app-theme.css`, and a few more). Default if not answered: they inherit the new flat glow, because the primitive is shared and a legacy mode would keep the old thumb alive, but their own pages are otherwise not audited.
