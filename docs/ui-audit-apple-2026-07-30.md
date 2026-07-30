# UI Audit — converging the site on the `/design` language (2026-07-30)

> **Audience: humans and coding agents.** This audit measures the site against
> the aesthetic demonstrated on **`/design`** ("Spatial Minimalism" —
> `app/routes/design.tsx` → `components/design/LiquidGlassPage.tsx`, styled by
> `app/globals.css` §"Standalone design-system story", ≈L3894–4230) and specifies
> how to move the rest of the site onto it.
>
> Companion docs: [`design-language.md`](./design-language.md) (the system as
> currently documented), [`page-consistency.md`](./page-consistency.md) (the
> per-page checklist), [`ui-audit-2026-07-28.md`](./ui-audit-2026-07-28.md) (the
> defect audit — contrast, targets, overlap; still valid and **not** superseded).
>
> Finding IDs are stable: `SPA-0xx` systemic, `SPA-1xx` per-surface.

---

## 1. What `/design` actually specifies

The page is the only place the target language exists, and it exists there as
~270 lines of page-scoped CSS. Extracted as a spec:

| Axis               | `/design` value                                                                                                                                            | Where                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Display type**   | `--site-font-display`, **weight 500**, line-height **0.84–1.04**, letter-spacing **−0.045em → −0.07em**                                                    | `globals.css` L4026–4033, 4048–4055, 4068–4074, 4097–4103, 4120–4127 |
| Display sizes      | h1 `clamp(4rem, 11vw, 10rem)`; statement `clamp(2.6rem, 6.5vw, 7rem)`; section head `clamp(2rem, 4vw, 4.5rem)`; row title `clamp(1.65rem, 2.6vw, 2.75rem)` | same                                                                 |
| **Kicker**         | `0.625rem` / weight 700 / `0.22em` tracking / uppercase / `--site-text-dim`                                                                                | L4017–4024                                                           |
| **Lede**           | `clamp(1rem, 1.5vw, 1.3rem)`, line-height **1.65**, `--site-text-muted`                                                                                    | L4035–4041                                                           |
| **Surface**        | `1px solid --site-border` + `--site-radius` + `--site-shadow-sm` over `--site-surface`                                                                     | L3943–3956                                                           |
| **Sticky chrome**  | surface at **94%** + `backdrop-filter: blur(10px)`, `--site-radius`, hairline border                                                                       | L3902–3917                                                           |
| **Section rhythm** | `clamp(5rem, 13vw, 12rem)` block × `clamp(1.5rem, 8vw, 9rem)` inline                                                                                       | L4043–4046                                                           |
| **Section head**   | flex, `padding-bottom: clamp(2rem,5vw,4rem)`, **hairline `border-bottom`**                                                                                 | L4057–4062                                                           |
| **List rows**      | `border-bottom: 1px solid --site-border` per row, `clamp(2rem,5vw,4rem)` vertical — **hairlines, not cards**                                               | L4076–4083                                                           |
| **Inverse block**  | `--site-inverse-bg` / `--site-inverse-text`, `--site-radius`, `clamp(3rem,8vw,8rem)` padding                                                               | L4105–4127                                                           |
| **Control**        | pill (`--site-control-radius`), `1px` border at 40% ink, `0.82rem`/700, hover → solid ink                                                                  | L4129–4148                                                           |
| **Motion**         | reveal: `opacity 0→1` + `translateY(18px→0)`, **700ms `cubic-bezier(0.22,1,0.36,1)`**, per-item `--spatial-delay`                                          | L4166–4177                                                           |

**Every token it consumes already exists site-wide** — `--site-font-display`,
`--site-radius`, `--site-shadow-sm`, `--site-control-radius`, `--site-text-dim`,
`--site-section-gap`, `--site-inverse-*`. Nothing here needs new colour work.

---

## 2. The central finding

### SPA-001 [P0] The `/design` language is page-scoped CSS, so no other page _can_ adopt it

`.spatial-design-*` selectors are used by exactly **one** component
(`components/design/LiquidGlassPage.tsx`). There is no shared vocabulary for the
kicker, the hairline section head, the hairline row list, the inverse block, or
the reveal — so any page wanting this look must copy CSS, which is why none have.

Measured adoption of the pieces that _are_ tokenised:

| Token / class            | Files using it |
| ------------------------ | -------------- |
| `--site-font-display`    | 44             |
| `--site-section-gap`     | **3**          |
| `--site-inverse-*`       | **3**          |
| `.spatial-design-kicker` | **1**          |

**Fix (the mechanism for this whole migration):** promote the language out of the
page into the shared layer — a display type scale as tokens, plus a small set of
structural classes — then adopt it in the two components that every content route
already goes through. Details in §4.

### SPA-002 [P0] Three competing page-header languages, and the winner is the smallest type

A content route's `<h1>` is styled three times:

1. `components/feed/feed.css` L286–293 — `.page-heading` as a bordered, shadowed
   surface card.
2. `components/radial/radial.css` L2231–2240 — `.radial-shell .page-heading`
   **strips** that card (border/background/shadow → none) and sets
   `font-size: clamp(1.4rem, 5.5vw, 3.4rem)`.
3. `/design` — `clamp(4rem, 11vw, 10rem)`.

Rule 2 wins on every `_site` route. So the shared header tops out at **3.4rem**
where the reference is **10rem**, and the two rules fight: one paints a card, the
other unpaints it. Net effect — 64 `PageLayout` routes render a _flattened_ header
that is neither the card language nor the display language.

**Fix:** one header language. Fold rules 1 and 2 into a single tokenised header
that uses the `/design` type scale, and delete the override.

### SPA-003 [P1] Reveal-on-scroll is implemented five different ways, one of which hides content

`data-spatial-reveal` (`/design`), `useReveal` (`rmh-capital/shared.tsx`,
`rmh-pmc/shared.tsx`), `LibraryReveal.tsx`, framer `whileInView`
(`membership/MembershipPanel.tsx`), `MDXAnimations.tsx`, `RoadmapSection.tsx`.

They disagree on timing, distance and easing, and the `opacity: 0` default is the
root cause of **AUD-006** in the 2026-07-28 audit (whole pages rendering blank
when the observer doesn't fire — `/pricing`'s plan grid, `/rmh-capital`'s ~4,700px
body). A single shared reveal fixes the inconsistency _and_ that P2 defect.

**Fix:** one reveal primitive, matching `/design`'s curve (700ms,
`cubic-bezier(0.22,1,0.36,1)`, 18px), that is **visible by default** and only
hides once JS has armed the observer.

### SPA-004 [P1] Cards where the reference uses hairlines

`/design` separates list rows with a `1px` bottom border and nothing else. The
site's habit is a bordered+shadowed card per row (`.page-heading`, `glass-pane`
sections, settings rows, rail widgets). At three or four rows this reads as a
stack of boxes rather than an editorial list, and it is the single biggest
visual difference after type size.

**Fix:** a shared hairline-row list, and prefer it over card-per-item for
homogeneous lists. (Cards stay correct for heterogeneous content — a post, a
product, a game.)

### SPA-005 [P2] No shared section rhythm

`--site-section-gap` is `clamp(1rem, 2vw, 1.5rem)` and used in 3 files;
`/design` breathes at `clamp(5rem, 13vw, 12rem)` — an order of magnitude more.
Content pages set their own ad-hoc `space-y-*`. There is no token for "the gap
between two major sections of a page".

**Fix:** add a section-rhythm token pair (tight/major) and a shared section
wrapper; leave `--site-section-gap` meaning what it means today so nothing
shifts underneath existing callers.

### SPA-006 [P2] The display scale is re-typed per page instead of tokenised

`--site-font-display` appears in 44 files, each with its own `clamp()`, weight
and tracking. There is no `--site-display-1`. So "make the headings match
`/design`" currently means editing 44 files, and any new page invents a 45th
scale.

**Fix:** four display-scale tokens carrying size **and** the weight/leading/
tracking that make the look, so a heading is one class.

---

## 3. What is already right (do not "fix" these)

- **Tokens and themes.** The `--site-*` contract, 16 locales, the light/graphite/
  high-contrast trio and `ensureReadableAccent()` all stay exactly as they are.
  This migration is type, rhythm and structure — **no palette changes**.
- **The radial shell chrome** (hub orb, ring backdrop, rails, pointer metaball)
  is untouched by everything above. `/design` happens to be a standalone page
  with its own nav, but nothing in §2 requires removing the shell — see §6.
- **`LiquidTabs`** is already a proper Apple segmented control as of the
  preceding commit (equal segments filling the track, wrapping instead of
  scrolling, `--site-radius` track).
- **Accessibility work from the 2026-07-28 audit** — 44px targets, contrast
  floors, heading outlines. The new type scale must not regress them.

---

## 4. The migration mechanism

Ordered so each step makes the next cheaper, and so the first step alone moves
64 routes.

**Step 1 — tokenise the language (`app/globals.css`).**
`--site-display-1..4` (size + weight + leading + tracking), `--site-kicker-*`,
`--site-section-block`, `--site-reveal-*`. Zero visual change on its own.

**Step 2 — a shared structural vocabulary (`app/globals.css`).**
`.site-display-1..4`, `.site-kicker`, `.site-section`, `.site-section-head`
(hairline), `.site-rows` (hairline-divided list), `.site-inverse-block`,
`.site-reveal`. These are the classes `/design` should have been built from.

**Step 3 — adopt in the two shared components.**
`PageLayout` (64 routes) and `ColumnHeader`. Delete the competing
`radial.css .radial-shell .page-heading` override (SPA-002).

**Step 4 — one reveal primitive** replacing the five (SPA-003), visible by
default.

**Step 5 — rebuild `/design` on the shared vocabulary.** The reference page must
consume the system it defines, otherwise it drifts from what it documents and
this audit's spec becomes unverifiable.

**Step 6 — per-route adoption.** ~140 routes with bespoke layouts. This is the
long tail and it is _not_ covered by steps 1–5; see §5 for the ordering.

---

## 5. Adoption status by surface

| Surface                                                                                              | Routes | Covered by steps 1–5?                                                                            |
| ---------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| `PageLayout` routes (settings, notifications, bookmarks, tournaments, developer, predictions, …)     | 64     | **Yes** — header, kicker, rhythm                                                                 |
| `ColumnHeader` columns (messages, market, communities, study, …)                                     | ~14    | **Yes** — header                                                                                 |
| `/design`                                                                                            | 1      | **Yes** — rebuilt on the vocabulary                                                              |
| Marketing / editorial (`/pricing`, `/roadmap`, `/rmh-capital`, `/rmh-pmc`, `/adaptive-intelligence`) | ~8     | Partly — reveal unified; hero/section type needs per-page work                                   |
| Bespoke experience pages (`/library`, creator studio, studio, `/homes`)                              | ~12    | No — own layouts, own CSS files                                                                  |
| Feed surfaces (`RadialFeed`, `RmharkCard`, composer)                                                 | ~6     | No — deliberately its own compact language                                                       |
| Full-screen apps + games (`--app-*` tier)                                                            | ~30    | **No, and out of scope** — separate token contract by design (`components/shared/app-theme.css`) |

---

## 6. Open decisions (not taken by this audit)

1. **Does the radial chrome survive?** `/design` has a plain sticky nav and a
   footer; the site has the hub orb, ring backdrop and pointer metaball. Steps
   1–5 keep the shell and restyle only what pages render inside it. Replacing the
   shell with a `/design`-style top nav is a much larger, separate decision and is
   deliberately **not** part of this audit.
2. **Should the full-screen app tier follow?** The `--app-*` contract exists
   precisely so apps/games can own their look. Left alone.
3. **Micro-caps floor.** `/design`'s kicker is `0.625rem` (10px), which the
   2026-07-28 audit flagged as below the 11px legibility floor (AUD-002). The
   shared `.site-kicker` uses **0.6875rem (11px)** instead — a deliberate
   deviation from the reference in favour of the accessibility finding.
