# Design Language — Radial Avant-Garde Glass

> Audience: humans **and** coding agents. This is the reference for how the site
> looks and feels, and how to build UI that is visually native to it. For the
> step-by-step "build a page that fits" checklist, see
> [`docs/page-consistency.md`](./page-consistency.md).

The design language is **Radial Avant-Garde Glass** — a bold, experimental take
on **Apple's Liquid Glass** material, draped over a **radial** information
architecture. Two ideas, one language:

- **Radial.** The site orbits a central **RMH** mark; content radiates from the
  centre. The home feed is a vertically-scrolling **wheel** of cards (on the
  document's own scroll) that rake onto a shallow cylinder as they cross the
  focus line, led by an inline compose box; navigation lives in a fixed **RMH
  hub** that, when tapped, first **glides the orb to the middle of the screen**
  and then **blooms a pie/wedge dial** the orb radiates from. A gooey
  **metaball** cursor and a soft parallax **ring backdrop** keep the whole
  surface feeling liquid and continuous. Mobile-first, with a strict
  **high-contrast monochrome** palette.
- **Avant-garde glass.** The material is Apple's Liquid Glass used
  _theatrically_, not literally: physically-plausible layered translucent glass
  with **live optics** — a specular rim glint that tracks the scene light,
  lens-model edge refraction (with an optional chromatic **prism** on one
  flagship surface), a depth-parallaxing aurora canvas, a pointer-tracked
  diffuse light, and travelling liquid sheens — deployed for signature radial
  moments (the menu is an **expanding circular blur** growing from the centre,
  not a drawn disc; the wedges are translucent frosted sectors over it). It is
  expressed as an **elevation system of explicit CSS classes** (`.glass-fill` /
  `.glass-pane` / `.glass-chrome` / `.glass-overlay` / `.glass-inset`, plus the
  modifiers in §5.1) placed _on_ components.

**Everything rests on one contract:** a single set of CSS custom properties
(`--site-*`) that every theme re-defines. Components never hardcode colors,
radii, fonts, or shadows — they consume the contract through Tailwind utilities,
so any theme (and any accent preset layered on top) restyles the entire site
without a single component change.

> **What ships today — read this first.** Both layers are live. The **radial**
> layer (shell, hub, wheel feed, metaball cursor) ships in
> [`components/radial/`](../components/radial/README.md), and the **Liquid Glass
> material is rendered on top of it**: the radial shell no longer demotes the
> glass classes to flat cards, the aurora canvas paints and drifts behind
> everything, and surfaces are translucent by token (`--site-surface` is a tint,
> not paper) so both the `.glass-*` tiers and the many pages that simply paint
> `bg-site-surface` sample the same scene. The elevation tiers, rim glint,
> pointer light, frosted edge bevel and liquid sheen are all on.
>
> One optic is **parked**: the SVG displacement lens (`url(#glass-lens)`, §5.1
> `.glass-refract`) — current Chromium composites the displacement map into the
> bevel instead of bending the backdrop through it, so refract surfaces keep the
> frosted edge band (and the prism keeps its static chromatic rim) without the
> bend. The filters and `lib/glass-lens.ts` still ship; re-enabling is restoring
> the `@supports` upgrades in `app/globals.css` plus the `initGlassLens()` call
> in `hooks/useGlassLight.ts`. Everything else in §2, §5.1 and §7 is live.

Specs: [radial UI](../components/radial/README.md) ·
[v1 glass material](./plans/2026-07-14-liquid-glass-ui-redesign.md) ·
[v2 optics & floating shell](./plans/2026-07-21-liquid-glass-v2-optics.md).

---

## 0. Definition of done for a UI commit

Read this before touching pixels; it is the short version of everything below,
and the thing to re-read at the end of the change. A UI commit is done when all
nine hold. (`docs/page-consistency.md` §3 is the same contract expanded into a
per-page checklist with code.)

1. **Nothing is hardcoded.** Every color, radius, shadow, font and duration
   comes from a token utility (`--site-*` on the site; `--app-*` inside a
   full-screen app, §12) — no hex, no `rounded-lg`, no bespoke
   `transition: 200ms ease`. A theme the author never opened must still look
   deliberate. (§1, §12)
2. **Ink tracks its surface.** Filled surfaces take their paired foreground
   (`bg-site-accent` → `text-site-accent-fg`). Never `text-white`/`text-black`
   on a themed surface. (§1)
3. **It reuses a primitive.** If `components/ui/` has it — button, badge,
   dialog, tabs, empty state, skeleton, spinner, tooltip, copy button, confirm
   — the commit uses it rather than a local copy. A second copy of something
   shared is the single most common defect in this repo's UI history, and the
   reason §5.2 and §12 exist at all. (§5)
4. **One tab-strip grammar.** Tab strips are `<LiquidTabs>`. No hand-rolled
   `role="tablist"`, no `layoutId` capsule of your own, no active-state
   underline. This one is **CI-enforced** — see §13. (§7)
5. **Motion comes from the token set.** `lib/motion.ts` (`DURATION`, `EASE`,
   `SPRING`, `APPLE_SPRING`, `transition`, and the named variants) rather than
   ad-hoc numbers, so a global re-tune stays a one-line change. (§7)
6. **It degrades centrally, not per component.** High-contrast, reduced
   transparency, reduced motion, `perf-lite` and `forced-colors` are handled by
   the token layer and the glass classes. A component that branches on them by
   hand is a bug. Legibility must never depend on an optic: text has to hold on
   `--site-surface-opaque`. (§5.1, §7, §9)
7. **Every string is translated** through `t("key", { defaultValue })`, with
   `pnpm i18n:extract` run and the namespace registered in
   `lib/i18n/config.ts`. (§10)
8. **The keyboard and screen-reader path works.** Icon-only controls are named,
   decorative icons are `aria-hidden`, focus stays visible and undoubled. (§8,
   §9)
9. **It was actually looked at** in `default`, `.style-light` and
   `.style-high-contrast`, at a phone width and a desktop width, and once with
   reduced motion on. Three themes × two widths is the floor; the audit matrix
   in `docs/ui-audit-2026-07-28.md` §1 is the extended version.

**When the system does not have what you need**, extend the system — add the
token, add the variant, add the primitive — and say so in the commit message.
Do not solve it locally with a magic number; that is how five apps ended up
with five focus rings.

---

## 1. The token contract (`app/globals.css`)

Tailwind v4 is imported at the top of `app/globals.css`; an `@theme inline`
block binds the `--site-*` variables to utility classes. The `:root` block is
the **default theme** — the strict-monochrome Radial Avant-Garde Glass baseline (a
light palette: white canvas, ink text and accent). There is no `.style-default`
class; default is the absence of any `.style-*` class on `<html>`.

Tokens every theme defines (set in `:root`, overridden by each `.style-*`
class):

| Group             | Tokens                                                                                                                                                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backgrounds       | `--site-bg`, `--site-bg-subtle`, `--site-canvas` (the aurora painted on `<body>`)                                                                                                                                                                           |
| Surfaces          | `--site-surface`, `--site-surface-hover`, `--site-surface-active`, `--site-surface-opaque` (autofill / reduced-transparency fallback)                                                                                                                       |
| Glass material    | `--site-glass-tint`, `--site-glass-tint-strong`, `--site-glass-ink`, `--site-glass-rim`, `--site-glass-rim-soft`, `--site-glass-light`, `--site-glass-blur-{pane,chrome,overlay}`, `--site-glass-saturate`, `--site-glass-depth(-sm)`, `--site-glass-noise` |
| Borders           | `--site-border`, `--site-border-bright`, `--site-border-width` (1px default; 2px in high-contrast)                                                                                                                                                          |
| Text              | `--site-text`, `--site-text-muted`, `--site-text-dim`                                                                                                                                                                                                       |
| Accent            | `--site-accent`, `--site-accent-fg`, `--site-accent-hover`, `--site-accent-dim`                                                                                                                                                                             |
| Status            | `--site-success`, `--site-danger`, `--site-warning`                                                                                                                                                                                                         |
| Elevation / shape | `--site-shadow` (prominent: modals/popovers/floating chrome), `--site-shadow-sm` (resting: cards/surfaces), `--site-radius`, `--site-radius-sm`, `--site-control-radius` (shared button geometry)                                                           |
| Layout rhythm     | `--site-page-gutter`, `--site-section-gap`, `--site-panel-padding`, `--site-shell-gap`, `--site-sticky-edge`, `--site-sticky-primary-height`, `--site-sticky-secondary-top`, `--site-touch-target`, `--site-page-bottom-space`                              |
| Typography        | `--site-font-display`, `--site-font-body`, `--site-font-mono`                                                                                                                                                                                               |
| Motion / flourish | `--site-transition-speed` (140ms default), `--site-press-duration`, `--site-card-transform`, `--site-glow`, `--site-text-shadow`, `--site-letter-spacing`, `--site-heading-transform`                                                                       |

### Tailwind utilities — use these, never raw hex/oklch

| Purpose            | Utilities                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backgrounds        | `bg-site-bg`, `bg-site-bg-subtle`, `bg-site-surface`, `bg-site-surface-hover`, `bg-site-surface-active`                                                   |
| Borders            | `border-site-border`, `border-site-border-bright`                                                                                                         |
| Text               | `text-site-text`, `text-site-text-muted`, `text-site-text-dim`                                                                                            |
| Accent             | `bg-site-accent`, `text-site-accent`, `text-site-accent-fg`, `bg-site-accent-hover`, `bg-site-accent-dim`                                                 |
| Status             | `text-site-success`, `text-site-danger`, `text-site-warning` (and `bg-` variants)                                                                         |
| Radius             | `rounded-site`, `rounded-site-sm` (theme-aware — do not use `rounded-lg`/`rounded-xl` for site chrome)                                                    |
| Shadow             | `shadow-site` (prominent), `shadow-site-sm` (resting)                                                                                                     |
| Fonts              | `font-nunito` (body default), `font-sans` (Inter), `font-mono` (JetBrains Mono), `font-display` (Nunito), `font-serif` (Playfair), `font-comic` (Bangers) |
| Theme display font | `font-(family-name:--site-font-display)` — used for page `<h1>`s so headings adopt each theme's display face                                              |

Extra breakpoint: `xs` = 480px (defined in the `@theme inline` block).

### Foreground pairing — ink must track its surface

A filled surface is only readable if the ink on it comes from **that surface's
paired foreground token**, not from the page's ambient `--site-text`:

| Surface                                     | Ink                   |
| ------------------------------------------- | --------------------- |
| `bg-site-accent` (and `-hover`)             | `text-site-accent-fg` |
| `bg-site-danger`                            | `text-site-danger-fg` |
| `[data-contrast='inverse']`/`.site-inverse` | `--site-inverse-text` |

Forgetting the pair is the classic way to ship invisible UI: inheriting
`--site-text` onto a dark accent gives near-black on near-black, and onto a light
accent (bright yellow) gives white on white. `globals.css` now supplies each
pairing **by default** through zero-specificity `:where()` rules, so an element
that only sets a background still gets correct ink — and anything that states its
own colour still wins. Since lucide icons paint with `currentColor`, this covers
icons and text together.

Two things the safety net can't do for you:

- **Don't hardcode `text-white`/`text-black` on a themed surface.** It looks fine
  against today's accent and breaks against a user's. Name the paired token
  instead — that's what makes it track every theme and accent preset.
- **Translucent tints are a different case.** `bg-site-accent/15` with
  `text-site-accent` is correct and deliberate; the safety net only targets the
  solid fills, so tinted chips are untouched.

`--site-accent-fg` is contrast-checked at runtime by `ensureReadableAccent()`
(`lib/appearance/contrast.ts`), so a custom accent can't ship an unreadable pair.

A legacy shadcn token set (`--card`, `--primary`, `--muted`, `--border`,
`--ring`, `--radius`, `--chart-*`, `--sidebar*`) also exists for a few
shadcn-derived pieces. **Prefer `--site-*` for all new site UI.** A separate
`.dark` class exists only for Slice It game variables — it is _not_ the site
theme mechanism.

---

## 2. Themes + accent presets

Theme = a `.style-<id>` class on `<html>`; the catalog lives in
`stores/themeStore.ts` (`SITE_STYLES`, with id/label/icon/group) and the CSS for
each in `app/globals.css`. Visitors with no saved preference get `DEFAULT_STYLE`
(`default`), and persisted-but-unknown prefs self-heal in `Providers.tsx`.

The **default** (`default` = the bare `:root`, no class) is the **Radial Liquid
Glass baseline**: strict **monochrome** — a white aurora canvas, ink text, an ink
accent, hairline black borders — rendered as glass, not paper: its surfaces are
translucent white tints over the drifting canvas. Every other theme is the same
material in its own palette over its own `--site-canvas` aurora. (The old
`liquid-glass` theme id is retired — it _became_ the shell.)

Note that `SITE_STYLES` currently ships three of these — `default`, `graphite`
and `high-contrast`; the other palettes below stay in `globals.css` as complete,
ready token sets (and as the reference every user theme derives from).

| Group   | Themes                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base    | `default` (**Radial Monochrome** — the site default: strict black-&-white, ink accent, translucent white frost over a white aurora), `light` (**Glass Light** — daylight canvas, brighter white frost, dark ink), `high-contrast` (WCAG AAA, **no glass**: opaque black/white, yellow accent, 2px borders), `ultra` (**Ultra** — near-black spectral canvas, precision geometry, ice-cyan signal color, fast motion and restrained violet energy) |
| Curated | `graphite` (Graphite Glass — monochrome smoke, desaturated), `sepia` (Sepia Glass — warm parchment, amber accent), `nocturne` (Nocturne Glass — deep-navy nightscape, sky-blue aurora)                                                                                                                                                                                                                                                            |

The glass primitives live in `components/ui/liquid-glass.tsx` (`GlassPane` and
`GlassFilter` — the v2 lens-filter host mounted globally in `__root.tsx`) with a
design-lab reference at `/liquid-glass`. A **Glass clarity** slider (Settings →
Appearance, §5.46) tunes how much scene shows through in five stops
(`0 Opaque · 1 Calm · 2 Default · 3 Airy · 4 Clear`): stop 0 is the opaque
`html.reduce-transparency` mechanism (the manual equivalent of the OS
`prefers-reduced-transparency`), and stops 1/3/4 scale the `--glass-user-blur` /
`--glass-user-tint` factors the glass classes consume (stop 2 = the shipped
default). Persisted as `rmh-glass-level`, applied pre-paint by the no-flash
script; the OS override and high-contrast still win.

On top of any theme a user can pick an **accent preset** — a curated color
(`lib/appearance.ts`, `ACCENT_PRESETS`, 14 options) that overrides just the
`--site-accent*` tokens as inline styles on `<html>`, keeping everything else
from the theme. `null` = the theme's own accent.

**User themes (v2, §14)** extend the same principle to the marketplace: a
`UserTheme`'s tokens are colors + a few scalar knobs (`lib/themes/tokens.ts`,
`THEME_TOKENS_VERSION = 2`), and `themeCssVars()` derives the full `--site-*` /
`--site-glass-*` contract from them — so every purchased theme is a correct
glass tint and inherits future optics upgrades. Members create/publish (Theme
Studio, `components/themes/`); anyone buys with RMH coins. v1 token maps upcast
on read (`upcastTokens`), never rejected.

Themes differ **only through the `--site-*` token contract** — there are no
per-theme `[data-slot]` component overrides or full-page background effects on
site chrome anymore (those belonged to the retired themes). Full-page effects
(scanlines, grain, particle fields) still exist, but only inside individual
games/apps, scoped to their own variable groups. **Shared primitives still set
`data-slot` attributes** so future themes (or games) can hook them.

### Theme runtime (how switching works)

Everything is data-driven from `SITE_STYLES`: the settings gallery, the runtime
class-swap, the anti-FOUC inline script, and the account-sync API validation
all derive from it — so **adding a theme is just a `.style-<id>` CSS block plus
a `SITE_STYLES` entry** (with its `bg`); nothing else needs editing.

- `stores/themeStore.ts` — Zustand `useThemeStore { style, setStyle, preview,
setPreview, accent, setAccent }`. `THEME_BG` is derived from `SITE_STYLES`.
- `components/Providers.tsx` — an effect swaps the `style-*` class on `<html>`
  (Dark/`default` needs none — it uses `:root`), applies the accent override,
  persists to `localStorage`, and updates `<meta name="theme-color">` + body
  background. It also **self-heals** any persisted-but-unknown style back to
  `DEFAULT_STYLE`. Games/app routes are excluded (`THEME_EXCLUDED_ROUTES`) —
  they own their styling; an `app-route` class is toggled on `<html>` for them.
- **No-flash SSR:** an inline `themeScript` in `app/routes/__root.tsx` applies
  the persisted class + accent _before hydration_, deriving the background from
  the `THEME_BG` map (also from `SITE_STYLES`), so there is no hand-copied
  theme→background map to keep in sync.

---

## 3. Typography & fonts

- Body default is `font-nunito antialiased` (set on `<body>` in `__root.tsx`).
- Fonts load from **Google Fonts `<link>`s**, not @fontsource, for site chrome:
  Nunito + Inter are critical (loaded in `__root.tsx` head); decorative theme
  fonts (JetBrains Mono, Playfair Display, Bangers, Bebas Neue, Orbitron,
  Cinzel, Pacifico, Space Grotesk, Permanent Marker, Caveat, Dancing Script,
  Patrick Hand) are deferred via `requestIdleCallback` (`deferredFontsScript`).
  `@fontsource/ibm-plex-*` and `@fontsource/newsreader` are used by specific
  games only.
- Recurring text patterns:
  - Page `<h1>`: `font-(family-name:--site-font-display) font-bold text-lg text-site-text`
  - Body: `text-site-text`; secondary: `text-sm text-site-text-muted`; faint: `text-site-text-dim`
  - Dialog title: `text-lg font-semibold leading-none tracking-tight`
  - Mono accents (counts, section labels): `font-mono text-xs uppercase tracking-widest`
  - Chips/pills: use `<Badge>` (or `inline-flex items-center gap-1 rounded-full text-xs font-medium`)

## 4. Iconography & emoji

- **`lucide-react` is the icon library.** (`react-icons` appears in exactly one
  legacy file — don't add more.) `Button` auto-sizes child SVGs to `size-4`.
- Decorative icons get `aria-hidden`; icon-only buttons get an `sr-only` label
  or `aria-label`. Directional icons that must mirror in RTL take `.rtl-flip`.
- Emoji render through Twemoji (`TwemojiProvider` in `components/ui/`) for
  cross-platform consistency.

---

## 5. Shared primitives (`components/ui/`)

### 5.1 The glass elevation classes (use these for surfaces)

Glass is opt-in per element via these classes (in `app/globals.css`). Pick by
role, not by looks — the tier decides blur cost (see the redesign doc §6 budget:
≤8 backdrop-filters per viewport, **0** on repeated list items).

| Class                               | Tier            | Use for                                                                                             |
| ----------------------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| `.glass-fill`                       | L1 (no blur)    | Repeated content: cards, list rows, table rows, grid tiles. Cheap, unlimited.                       |
| `.glass-pane`                       | L2 (blur+noise) | Singular panels: heroes, composers, settings sections, tier cards. Budgeted.                        |
| `.glass-chrome` (`--aside` variant) | L3              | Persistent chrome: sidebar, sticky headers, mobile dock. Condenses on scroll via `[data-scrolled]`. |
| `.glass-overlay`                    | L4              | Floating UI: dialogs, popovers, menus, command palette, toasts, tooltips.                           |
| `.glass-inset`                      | —               | Recessed wells: inputs, search fields.                                                              |
| `.glass-scrim`                      | —               | Dialog/drawer backdrops.                                                                            |

Modifiers layer **on top of** a tier class. Each carries a per-page budget —
they are signature moments, not defaults:

| Modifier                                     | Budget      | What it adds                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.glass-interactive` + `data-glass-light=""` | unlimited   | Hover tint-raise, springy press flex (`--ease-glass`), pointer-tracked diffuse highlight (`::after`), and — on `.glass-fill` — the hover-only specular rim glint.                                                                                                                                                                                                                                                                 |
| `.glass-refract` + `data-glass-lens`         | **≤2/page** | Lens-model edge refraction (v2): the backdrop bends through a displacement height field at the pane edge. Hero/chrome only, never in scroll containers. `data-glass-lens` opts into per-element filter sizing (`lib/glass-lens.ts`; Chromium bends the backdrop, Gecko/WebKit displace a mirrored aurora copy — §3.6). Pressing deepens the bend (`:active`, ×1.6, §3.7). Not compatible with `.glass-chrome--aside` (see below). |
| `.glass-refract--prism`                      | **≤1/page** | True chromatic dispersion (R/G/B displaced at different magnitudes) + fringe. Sanctioned users: login card, command palette, `/store` featured tier, design lab.                                                                                                                                                                                                                                                                  |
| `.glass-liquid` (or `<GlassPane liquid>`)    | **≤3/page** | Ambient travelling sheen (light over wet glass), painted as a background layer (v2) so it **composes freely** with `.glass-refract` and `.glass-interactive`. Signature surfaces only, never on list items.                                                                                                                                                                                                                       |
| `.glass-sheen-hover`                         | unlimited   | One-shot sheen sweep on hover — primary CTAs (`Button` `default`/`accent` have it built in).                                                                                                                                                                                                                                                                                                                                      |
| `.glass-bevel-sm`                            | unlimited   | Narrow 6px optics ring for small capsules — the `LiquidTabs` sheet pill (§5.45), plus discs like BackToTop.                                                                                                                                                                                                                                                                                                                       |
| `.glass-opaque`                              | —           | Escape hatch for full-screen fixed takeovers that must hide the page.                                                                                                                                                                                                                                                                                                                                                             |

Sticky glass uses the shared layout contract rather than local `top-*` values:

- `.site-sticky-chrome` is the primary floating header for a column. It owns
  the viewport edge, inline gutter, z-index, radius, and the breathing room
  below the surface.
- `.site-sticky-secondary` is the cascade level for an independent sticky
  below the primary. Its offset clears the compact 56px primary header plus
  `--site-section-gap`.
- `.site-sticky-contained` is for a sticky toolbar inside its own editor or
  scroll region; it does not add page margins.

Related controls should still be merged into a single sticky surface. Use the
secondary level only when the two surfaces mount independently.

**The rim glint comes free** (v2, §4.35): `.glass-pane`/`.glass-overlay`/`.glass-chrome`
(and the `--aside` variant) paint an always-on specular as a **border-box
background layer** — it lives in the 1px border ring while the structural border
itself goes transparent, so glass reads as one lit sheet, not an outlined frame.
Its bright segment tracks the global scene light (`--light-x/--light-y`, written
by `useGlassLight`; absent = a static top sun; touch/perf-lite fall back to an
element-anchored top-edge sun). `.glass-fill` + `.glass-interactive` glints on
hover only (its `--glass-glint-hover` multiplier fades 0→1). Wells
(`.glass-inset`, half-strength border), scrims, and plain fills carry no glint.
Pseudo contract: `::before` is refraction-only (the masked lens band) or the aside
blur; `::after` is the pointer light — never add a third owner.

Rules: never put a backdrop tier (`.glass-pane/chrome/overlay`) on an ancestor of
a `position:fixed` element (`backdrop-filter` creates a containing block — use
`.glass-chrome--aside`, which blurs on `::before`). `high-contrast`,
`prefers-reduced-transparency`, `html.reduce-transparency`, and `html.perf-lite`
all degrade these classes automatically — no per-component branching.

`html.perf-lite` is applied by **`lib/perf-tier.ts`** (from `Providers.tsx`) off
two conservative device facts: `navigator.deviceMemory < 4`, or
`hardwareConcurrency <= 2`. It is read in a dozen places (both aurora layers, the
radial blob field, `.lg-goo`, the GL shader-tier gate, `glass-lens`,
`canvas2d-fx`, `useGlassLight`, `useLiquidBackground`, liquid morph/pop) and
until 2026-07-30 **nothing ever set it**, so every one of those degradations was
dead code and the weakest machine on the site rendered the full effect stack.
Deliberately capability reads and not a measured-fps probe: a tier that can flip
mid-session restyles the document under the user for reasons they can't see.

The `Card` primitive is L1 `.glass-fill` by default; pass `pane` for L2 and
`interactive` for the pointer light. Inputs/Textarea/Select are `.glass-inset`;
Dialog is `.glass-overlay` + `.glass-scrim`; the shell chrome is `.glass-chrome`.

### 5.2 Primitive catalog

Always reach for these before writing new markup. Helper: `cn()` from
`@/lib/utils` (= `twMerge(clsx(...))`).

| Component                                                                   | File                                                     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button` / `buttonVariants`                                                 | `components/ui/button.tsx`                               | CVA. Variants: `default`, `destructive`, `danger`, `outline`, `secondary`, `ghost`, `link`, `accent`, `accent-outline`, `accent-ghost`. Sizes: `xs`, `sm`, `default`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`. `asChild` supported. **`loading` prop** (+ optional `loadingText`) shows an inline spinner, sets `aria-busy`, and disables the button — reach for this instead of hand-rolling `disabled={x}` + a separate `<Loader2>`.                                                                                                                                            |
| `Badge` / `badgeVariants`                                                   | `components/ui/badge.tsx`                                | CVA pill. Variants: `default`, `accent`, `solid`, `success`, `warning`, `danger`, `outline`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Card` + Header/Title/Description/Action/Content/Footer                     | `components/ui/card.tsx`                                 | `bg-site-surface border border-site-border rounded-site shadow-site`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Dialog` (Radix wrapper)                                                    | `components/ui/dialog.tsx`                               | Centered, viewport-clamped glass content with safe internal spacing and a translated close control. Pass `mobileFullscreen` for complex/wide editors; they consume the phone visual viewport with safe-area padding, then return to a centered dialog from `sm`.                                                                                                                                                                                                                                                                                                                        |
| `Input`, `Textarea`                                                         | `components/ui/input.tsx`, `textarea.tsx`                | `bg-site-surface`, `rounded-site-sm`, hairline border, accent focus ring.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Select`                                                                    | `components/ui/select.tsx`                               | Styled **native** `<select>` + lucide chevron (not Radix Select). **§15.6 exemption:** the option list is the OS-rendered native popup — it cannot be glass-styled or given the liquid-pop metaball open/close, so `Select` stays native by deliberate v1 decision (a custom listbox is an a11y-significant rewrite — propose separately).                                                                                                                                                                                                                                              |
| `Label`                                                                     | `components/ui/label.tsx`                                | Radix Label.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `EmptyState`                                                                | `components/ui/empty-state.tsx`                          | Canonical zero-state: `{icon, title, description, action}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Skeleton`                                                                  | `components/ui/skeleton.tsx`                             | Canonical loading placeholder. Defaults to a gentle `animate-pulse`; pass **`shimmer`** for a travelling highlight sweep (reduced-motion-safe) — nicer for above-the-fold / hero placeholders.                                                                                                                                                                                                                                                                                                                                                                                          |
| `Spinner` / `RadialLoader`                                                  | `components/ui/spinner.tsx`, `radial-loader.tsx`         | Canonical loading mark (`role="status"`) for **standalone / section loading** (accent-coloured, centred). It renders the **radial loading mark** — blobs orbiting a pulsing core, fused by the goo filter inside the radial shell — so a wait speaks the same language as the hub. `RadialLoader` is the bare mark (inherits `currentColor`, `decorative` drops the live region); `Spinner` is it in the accent. A bare inline `<Loader2 className="animate-spin" />` inside a button/label is still fine — it inherits `currentColor`, where `<Spinner>` would paint accent-on-accent. |
| `Tooltip`                                                                   | `components/ui/Tooltip.tsx`                              | Portal + framer-motion. Shows on **hover and keyboard focus**, dismisses on Escape, wires `aria-describedby`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `IconButton`                                                                | `components/ui/icon-button.tsx`                          | Icon-only `Button` that requires a `label` (becomes `aria-label` **and** a `Tooltip`). Reach for this instead of a bare `<button aria-label>`.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `CopyButton` / `useClipboard`                                               | `components/ui/copy-button.tsx`, `hooks/useClipboard.ts` | Canonical copy-to-clipboard: icon → check, sonner toast, `execCommand` fallback. Don't hand-roll `navigator.clipboard.writeText` + `useState`.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ConfirmDialog` / `useConfirm`                                              | `components/ui/confirm-dialog.tsx`                       | Themed promise-based confirm — `await confirm({ title, description, danger })`. Replaces native `window.confirm` (which ignores themes/i18n/a11y). `<ConfirmProvider>` is already mounted in `Providers`.                                                                                                                                                                                                                                                                                                                                                                               |
| `Breadcrumbs`                                                               | `components/ui/breadcrumbs.tsx`                          | "Where am I" trail for nested pages; also a `breadcrumbs?` prop on `PageLayout`. Last item is the current page (`aria-current`).                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `BackToTop`                                                                 | `components/ui/back-to-top.tsx`                          | Floating scroll-to-top button, mounted once in the `_site` shell (targets the window **and** the mobile `[data-scroll-root]` scroller).                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `NotificationBadge`                                                         | `components/ui/notification-badge.tsx`                   | Count pill (`bg-site-danger`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `UserAvatar`                                                                | `components/ui/UserAvatar.tsx`                           | Default fallback `/images/social/default_avatar.png`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `OptimizedImage`, `BlurImage`                                               | `components/ui/`                                         | Image loading.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `AnimatedCount`, `ViewTransitionLink`, `NavigationProgress`, `RoutePending` | `components/ui/`                                         | Motion/navigation helpers. `RoutePending` is the router-wide pending fallback.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Pagination, Slider (Radix), Resizable, `skeletons/PostCardSkeleton`         | `components/ui/`                                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Surfaces outside `Card`: `bg-site-surface border border-site-border
rounded-site`; hover affordance `hover:bg-site-surface-hover
hover:border-site-border-bright` (or `hover:border-site-accent`). Dividers:
`divide-y divide-site-border`.

Toasts: **sonner**. A themed global `<Toaster>` is mounted in
`components/Providers.tsx`; pages just `import { toast } from "sonner"`.

`SheetContent` follows the same rule: ordinary pickers are horizontally
centered floating bottom sheets on phones, while `mobileFullscreen` is reserved
for large editors such as Edit Profile. Do not hand-position wide mobile modals
with viewport offsets; use the shared option so safe areas, scrolling, and
close-button clearance stay consistent.

---

## 6. Layout system & page anatomy

The `_site` layout route delegates to `components/feed/SiteShell.tsx`, which now
renders the **radial shell** ([`components/radial/RadialShell.tsx`](../components/radial/RadialShell.tsx)):
a fixed parallax **ring backdrop**, a slim sticky **utility top bar** (brand ·
search · inbox · avatar), the **frame**, the central **RMH hub** (`RadialHub`),
and a site-wide gooey **pointer metaball** (fine pointers only — it replaces a
cursor, so phones never mount it). The single
`<main id="main-content">` landmark lives inside the frame; **pages never add
their own sidebars or page-frame** (and `AnimatedMain` renders a `<div>` — the
shell's `<main>` is the one landmark).

**The frame is responsive by track count.** Mobile is one column. From 1120px
the shell adds a persistent **navigation rail**, and from 1440px a **live rail**
(who's online, the daily loop, friends online, trending, who to follow, plus
whatever a page portals in through `PageLayout`'s `rightSidebar`). They are grid
tracks, not overlays, so they cannot ride over the content, and each is
`display: none` below the width that affords it. The frame itself is capped
(`--rad-frame-max`, 96rem → 116rem at 1800px): filling the window means filling
it with content, not stretching one reading column across a 34-inch display. See
[`components/radial/README.md`](../components/radial/README.md) for the width
table and the overlap-bound rules.

The hub is a phase state machine: tapping the fixed orb **glides it to the
centre of the screen** (`centering`), then opens the menu (`open`) as an
**expanding circular blur** grows from the centre and translucent sectors bloom
around the orb — no drawn colour disc. The dial is **double-decked**: two
concentric rings of annulus sectors around a hole the orb settles into, because
sixteen destinations on a single ring gave slivers too narrow to label or hit.
Closing reverses it (the blur contracts, then the orb glides home). The hub
remains the navigator on mobile and the fast full-screen switcher on desktop,
where the nav rail shows the same map without a click.

**Every top-bar control previews before it navigates.** Search drops a live
result list, the bell the latest notifications, the inbox recent threads, the
avatar a compact account menu — each with a footer link through to the full
page, so nothing is hidden behind the preview
([`QuickPanel`](../components/radial/QuickPanel.tsx) owns anchoring, the viewport
clamp, dismissal and focus).

The home (`/`) is a **radial feed**
([`RadialFeed`](../components/radial/RadialFeed.tsx) → `RadialWheel`): a wheel of
cards raked onto a shallow cylinder on the **document's own scroll** (no inner
scroll region — that is what lets mobile Safari collapse its toolbars), led by an
inline compose box, with a floating compose button that opens the new-rmhark
modal. From 1280px it becomes a **deck** — the wheel keeps the primary column and
an independent second feed (Following · News · Games) runs beside it. Every other
`_site` route flows the same way — natural document scroll, **no pinned/sticky
page chrome** — inside the frame's content track on the backdrop. The radial shell
keeps its **layout** opinions on content pages — it strips PageLayout's header
card down to flat big type and unpins sticky headers/tabs/search so every page
flows like the feed — but it no longer touches the **material**: the glass classes
render at full strength inside the shell, over the ring backdrop and the aurora.

Two page archetypes (see `docs/page-consistency.md` for full code):

1. **Standard content page** — wrap in `components/feed/PageLayout.tsx`:
   `PageLayout({ title, children, rightSidebar?, headerRight?, wide?, backTo?, backLabel?, breadcrumbs? })`.
   In the radial shell its `.page-heading` renders as a **flat, transparent
   big-type header** floating directly on the ring backdrop (the radial content
   layer strips the old bordered header capsule), followed by the content column.
   `rightSidebar` is **portalled into the shell's live rail** on wide screens and
   dropped on narrow ones, so it is supplementary content, never load-bearing.
2. **Feed-column / bespoke page** — use `AnimatedMain` directly with a target
   width from `lib/layout-width.ts`, or (home) the radial wheel.

Column widths come from `lib/layout-width.ts`: `DEFAULT_WIDTH = 648`,
`WIDE_WIDTH = 800`, `WIDE_NO_RIGHT_SIDEBAR_WIDTH = 952`. Those are the page's
_preference_, published as `--main-target`; on a wide screen the shell grants the
column a larger floor (`--rad-measure`) so a desktop window is not held to a
2019-era constant, and `min(100%, …)` keeps either from overflowing its track.
`wide` pages take the whole content track. Inner content is
usually `px-4 pt-4 pb-12 max-w-2xl mx-auto`; the column always carries
`pb-dock` and **no `border-r`** — there is no app-frame edge. Repeated content
floats as spaced cards (`space-y-3 px-3`); hairline `divide-y` rhythm lives
_inside_ container cards, not between page-level sections.

Full-screen experiences (games, `/login`, legal pages, Discord activities) live
at the **top level** of `app/routes/` — outside `_site/` — and deliberately get
no shell (no radial chrome — they own their own look; the aurora canvas is
gated off there too, via `html.app-route`).

---

## 7. Motion

- **Radial motion (the shipped layer).** The radial UI is CSS/rAF-driven and
  framer-motion-free for the shell: the feed **wheel** rakes each card onto a
  shallow cylinder on a rAF window-scroll pass with cached offsets (no layout
  thrash — `RadialWheel`), the **hub** glides the orb to centre then blooms the
  wedges under an expanding `clip-path` **circular blur** (CSS-only phase
  machine), the **pointer metaball** trails on one rAF tick with delta-time
  easing so it is identical at 60Hz and 240Hz (`MetaballCursor` — mouse only; an
  SVG alpha ramp fuses it into a shape with no plate and no blend mode, and it
  replaces the native cursor while a mouse drives it, standing down to a still
  native cursor image under a full-screen frosted overlay because a
  `backdrop-filter` is re-blurred in full by anything moving above it),
  the **ring backdrop** parallaxes to the pointer, and page headers/heroes rise
  in on mount (`radial-page-rise`). All of it is `transform`/`opacity` only and gated off
  under reduced motion; optional scroll **haptics** (`navigator.vibrate`) tick
  as cards cross the focus line.
- **framer-motion** is the animation library. Reach for the shared motion
  system in **`lib/motion.ts`** rather than hand-typing durations/easings:
  it exports the timing tokens (`DURATION`, `EASE`, `SPRING`, `APPLE_SPRING`,
  `pressable`, `transition`) and ready-made variants (`fade`, `fadeRise`,
  `fadeDown`, `scaleIn`, `popIn`, `overlay`, `modalContent`,
  `staggerContainer`/`staggerItem`). Keeping enters, exits, and lists on these
  tokens is what makes motion feel like one system — smooth and quick (nothing
  here is slower than 0.3s). Inline props are still fine for one-offs, but
  prefer `transition` / a named variant so a global re-tune stays a one-line
  change.
- **Tween or spring — the rule.** Tweens (`DURATION`/`EASE`) are for state
  changes with no gesture behind them: cross-fades, colour shifts, reveals.
  **`APPLE_SPRING`** is for anything the user _acts on_ — presses, drags, sheet
  dismissals, morphing containers — because a spring is interruptible: grab a
  moving element mid-flight and it retargets from its current velocity instead
  of snapping. It is parameterised the way SwiftUI does it, by perceptual
  `duration` + `bounce` rather than stiffness, which is why the same preset
  settles in the same perceived time whether it travels 4px or 400px. Presets:
  `smooth` (no bounce, the default), `snappy` (controls/toggles), `bouncy`
  (reactions, celebratory pops), `sheet` (presentation), `press`. Spread
  **`pressable`** onto a tappable surface for the standard press
  acknowledgement rather than re-deriving a scale.
- **iOS large title:** `components/ui/large-title.tsx` is the collapsing
  title/nav-bar pair. Scroll position maps _continuously_ onto
  scale/opacity/translation and onto the bar's scroll-edge material, so the
  title tracks the finger 1:1 and reverses mid-gesture instead of popping
  between two states at a CSS threshold. Transform/opacity only — the collapse
  costs no layout. Reduced motion collapses it to a static title with a
  permanent bar.
- **Depth from pointer/tilt:** `hooks/usePointerParallax.ts` returns
  spring-smoothed MotionValues at three fixed depths (0 = glued to the surface,
  1 = furthest back), fed by pointer position on fine-pointer hardware and by
  `deviceorientation` on touch. Compose two or three depths in one card — a
  single sliding layer is just movement; layers moving at different rates read
  as depth. No React render runs per frame.
- `<MotionConfig reducedMotion="user">` wraps the app (`Providers.tsx`), so
  framer-motion automatically respects OS reduced-motion.
- CSS motion: `.page-root > *` runs the `page-enter` animation (0.16s fade +
  4px rise), suppressed on history-back (`html.nav-pop`) and during View
  Transitions (`html.vt-active`). Feed items use `.feed-item-enter`.
  Shared-element View Transitions go through `lib/view-transition.ts`.
- **Living backdrop (Liquid Glass material — v2, two layers):** part of the
  glass layer, so it is dormant under the flat monochrome default
  (`--site-canvas` is `none`) and returns with the optics. The aurora canvas
  (`body::before`)
  runs an ultra-slow transform-only `aurora-drift` keyframe, and a far-field
  layer (`body::after`, per-theme `--site-aurora-far-*` stops) counter-drifts
  at `-0.6×` the pointer parallax — so pointer motion produces visible depth.
  `hooks/useLiquidBackground.ts` (one rAF-throttled listener, mounted in
  `Providers.tsx` next to `useGlassLight`) writes `--aurora-mx/--aurora-my`;
  both layers are gated off under reduced motion and `html.perf-lite`, and
  stop in high-contrast (canvas is `none` there).
- **The scene light:** `hooks/useGlassLight.ts` also writes 8px-quantized
  `--light-x/--light-y` on `<html>` (fine pointers only, static under reduced
  motion) — every glass rim's specular glint answers it. Its per-element
  duty (`--glass-px/--glass-py` for the `::after` diffuse hotspot) and the
  `lib/glass-lens.ts` per-element lens-filter generator both initialize from
  the same single listener. On touch devices `useLiquidBackground.ts` maps
  `deviceorientation` to the same `--light-x/--light-y` under `html.tilt-live`
  (opt-in on iOS via Settings → Appearance). The aurora follows that input,
  while coarse-pointer rim glints stay element-anchored; fixed backgrounds can
  otherwise composite a frame behind their scrolling parent on mobile.
- **Looking at an object (device attitude):** the tilt light above is a lean;
  inspecting something is a full rotation, so it works in quaternions instead.
  `hooks/useDeviceAttitude.ts` (maths in `lib/device-attitude.ts`, no three.js —
  it ships on ordinary pages) emits a smoothed **orbit** per animation frame:
  the device's change of heading and elevation since the viewer opened is
  applied to the object about its own axes, so turning to your left brings its
  right-hand face round to meet you and raising the phone looks down over its
  top. Deliberately not the object's raw relative attitude — that is faithful
  but tumbles, because a phone is held pitched back and a turn about the world's
  vertical then arrives as a rotation about a tilted axis. Consent is the same
  site-wide `rmh-motion-ok`; reduced motion removes it (the control does not
  render), and a drag/arrow-key path composes on top so desktops and anyone with
  motion off get the same object. Rendered with CSS 3D — see
  `components/library/Book3DViewer.tsx`, where a library book is a real
  six-faced volume with a printed spine and a block of pages.
- **Shader/DOM synchronization:** liquid bodies unregister in layout-effect
  cleanup and re-sample before paint on route/tab commits. Scroll, nested scroll,
  elastic touch movement, `visualViewport` changes, page resume, and layout-shift
  events wake the normally-idle sampler. A liquid pop settles immediately onto
  its real panel when either endpoint moves mid-animation, preventing a cached
  GPU bud, rim, or shadow from detaching from its DOM owner.
- **Liquid tabs:** tab strips use `components/ui/liquid-tabs.tsx` — each rides
  its own L1 **glass sheet** (`glass-fill glass-bevel-sm rounded-full` pill,
  `sheet` prop default) placed **below** the hero/page-title capsule, never
  inside header chrome (§5.45; see `page-consistency.md`). The active capsule is
  a `layoutId` glass pill that flows between tabs on `SPRING.snappy` and jumps
  under reduced motion; on capable engines it also **morphs** — velocity
  squash/stretch plus a `#glass-goo` metaball trail (`liquid-morph.tsx`, §5.47),
  stripped under reduced-motion / perf-lite / high-contrast. Link-based or
  `aria-controls`-rich tab bars keep their own markup and add the `layoutId`
  capsule directly (creator studio, RMHLadder).
- **Liquid opens:** card→detail navigations morph the clicked glass slab into
  the detail hero via `runViewTransition(el, { liquid: true })` + `liquidVTName()`
  (`lib/view-transition.ts`, §5.48) — the VT name is set at click time and
  cleared after; the detail's secondary content (comments, metadata, related
  lists) then staggers in via `staggerContainer`/`fadeRise`. No-VT browsers get
  instant nav + the stagger.
- `hooks/useReducedMotion.ts` — SSR-safe boolean for JS animations CSS can't
  reach; `prefersReducedMotion()` for imperative checks.
- `hooks/useCelebration.ts` — confetti/fireworks; lazy-loads canvas-confetti,
  no-ops under reduced motion, and reads `--site-accent`/`--site-success` off
  the DOM so bursts match the active theme.
- Two `@media (prefers-reduced-motion: reduce)` blocks in `globals.css`
  collapse animations/transitions to 0.01ms (keeping spinner/pulse feedback)
  and disable theme background effects.

---

## 8. Interaction & focus states

Global (in `globals.css`):

- Keyboard focus: `:focus-visible { outline: 2px solid var(--site-accent); outline-offset: 2px }`
  covers every interactive element (links, buttons, `[role]`, `[tabindex]`).
  Text inputs opt out (border + caret instead); `Button` opts out too (via its
  `data-slot="button"`) and draws its own softer
  `focus-visible:ring-site-accent/50 ring-2 ring-offset-2`. **Don't add another
  `focus-visible:ring` to an element the global outline already covers — you'll
  get a doubled indicator.** Reach for a self-drawn ring only when the element
  is excluded from (or not matched by) the global rule.
- Selection uses the accent with its `--site-accent-fg` text; native controls
  get `accent-color: var(--site-accent)`; scrollbars are thin and themed.
- **Scrollbars show on scroll, not always.** Every scrollbar on the site — the
  document's, both desktop rails', every panel and every full-screen app tier's —
  is painted transparent while its scroller is idle and fades in only while that
  scroller is actually being scrolled. `lib/scrollbar-reveal.ts` (installed once
  from `Providers.tsx`) stamps `data-scrolling` on the scrolled element and clears
  it ~900ms after it stops; the `§Scrollbars` block in `globals.css` is what
  paints. Two things to know before touching it: the reveal is done with **colour,
  never `scrollbar-width`**, so the gutter stays reserved and revealing a
  scrollbar can never reflow the page; and per the engine note in that block,
  Chromium ignores `::-webkit-scrollbar*` rules on any element that has a standard
  `scrollbar-width` — which `* { scrollbar-width: thin }` gives every element — so
  the standard properties are the live path there and the `::-webkit-*` rules are
  the older-WebKit fallback. An app tier sets its hover colour with
  `--sb-thumb-hover`, not a `:hover` rule of its own.
- **Cross-engine consistency:** the accent outline replaces every browser's
  default focus ring; Firefox's `::-moz-focus-inner` dotted border and
  `:-moz-ui-invalid` red validation glow are neutralized; `::placeholder` is
  themed at `opacity: 1` (Gecko dims it otherwise); autofilled fields are
  repainted to theme colors (WebKit/Blink); scrollbars are themed for both
  `scrollbar-width`/`scrollbar-color` (Gecko) and `::-webkit-scrollbar`
  (WebKit/Blink).
- Tap highlight removed; active press feedback is `opacity: 0.6`.
- Inputs hold a 16px font floor below 640px (prevents iOS zoom).

---

## 9. Accessibility

- `eslint-plugin-jsx-a11y` runs at "warn" (curated rules in
  `eslint.config.mjs`) — don't introduce new warnings.
- Prefer native elements and the Radix-based primitives in `components/ui/`
  over hand-rolled widgets.
- Patterns to copy: skip link in `_site.tsx` (`sr-only focus:not-sr-only` →
  `#main-content`), `role="status"` + label on loaders, `aria-hidden` on
  decorative icons, `aria-label` on icon-only links/buttons.
- RTL locales are first-class: `<html dir>` is set pre-paint from
  `RTL_LOCALES` in `lib/i18n/config.ts` (today `ar` and `ur` — read the
  constant, don't hardcode a locale test). Use logical spacing where possible
  and `.rtl-flip` on directional icons.
- `high-contrast` is an explicit theme choice (there is no
  `@media (prefers-contrast)` hook) — test new UI against `.style-high-contrast`
  and `.style-light`, not just the default dark theme.

---

## 10. Strings (i18n)

Every user-facing string goes through `t()` with a `defaultValue` (English is
the authoritative source):

```tsx
const { t } = useTranslation('site');
t('wallet-title', { defaultValue: 'Wallet' });
```

Namespace conventions (files under `locales/en/`):

| Namespace                                                               | Used for                       |
| ----------------------------------------------------------------------- | ------------------------------ |
| `site`                                                                  | most `_site/` pages            |
| `common`, `nav`, `pages`, `shared`, `feed`                              | core shell + feed              |
| `admin`, `library`, `rideshare`, `groups`, `builds`, `user-builds`, `v` | feature areas                  |
| `c-<area>` (e.g. `c-ui`, `c-rmhbox`)                                    | component strings              |
| `r-<area>` (e.g. `r-strategies`)                                        | route/experience entry strings |

After adding strings run `pnpm i18n:extract` (populates all
`locales/*/<ns>.json`), and `pnpm i18n:coverage` to check locale coverage.
See `lib/CLAUDE.md` §i18n for the full pipeline (resource generation, RTL,
lazy locale chunks).

---

## 11. Do / Don't summary

**Do**

- Use `--site-*` utilities (`bg-site-surface`, `text-site-text-muted`,
  `rounded-site`, …) for every color, radius, shadow, and font.
- Use `components/ui/` primitives, `PageLayout`/`AnimatedMain`, `EmptyState`,
  `Skeleton`, `Spinner`, sonner toasts, lucide icons.
- Give buttons in-flight feedback with `<Button loading>` (not a hand-rolled
  `disabled` + `<Loader2>`), and animate with the tokens/variants in
  `lib/motion.ts` instead of ad-hoc `duration`/`ease` numbers.
- Add `data-slot="..."` to new shared primitives so themes can restyle them.
- Wire every string through `t(..., { defaultValue })`.
- Test in `default`, `light`, and `high-contrast` themes and under reduced
  motion.

**Don't**

- Hardcode hex/oklch colors, `rounded-lg`, custom shadows, or font families in
  site UI.
- Re-add navigation/sidebars inside a page (the `_site` shell owns them).
- Use `react-icons`, an ad-hoc **standalone** `Loader2` where `<Spinner>`
  belongs (inline `Loader2` inheriting a button's colour is fine), or
  hand-rolled dialogs.
- Put a full-screen experience under `_site/`, or a standard page outside it.
- Bypass Twemoji for emoji or `jsonLdScript()` for JSON-LD.
- Re-implement something `components/shared/` already provides for full-screen
  apps (shell, header, toaster, connection status) — see §12.

---

## 12. The full-screen app tier (`--app-*`)

The site's `--site-*` contract stops at the `_site` shell. Full-screen apps
(**RMHbox, RMHType, RMHStudy, RMHTube, RMHMusic**) live at the top level of
`app/routes/`, are excluded from the theme system (`THEME_EXCLUDED_ROUTES`), and
have their own parallel contract — which is deliberately the **same shape**, so
what you know from §1 transfers.

`components/shared/app-theme.css` owns it: an `--app-*` token set
(`--app-bg`/`-subtle`, `--app-surface`/`-hover`/`-active`, `--app-border`(`-bright`),
`--app-text`/`-muted`/`-dim`, `--app-accent`/`-fg`/`-hover`/`-dim`,
`--app-success`/`-danger`/`-warning`/`-info`/`-rare`, `--app-font-*`,
`--app-radius`/`-sm`/`-lg`, `--app-shadow`/`-sm`,
`--app-duration-fast`/`-duration`/`-slow` + `--app-ease`, density and
`--app-safe-*` inset tokens) **plus every behaviour built on it** — scrollbars,
focus rings, `::placeholder`, Gecko's focus/validation quirks, tap-highlight and
double-tap-zoom suppression, the iOS sub-16px input-zoom floor, `dvh` heights,
and deliberate degradation for `backdrop-filter`,
`prefers-reduced-transparency`, `forced-colors` and print.

**An app ships only its palette.** Each app's CSS is a class
(`rmhbox-theme`, …) that redefines the `--app-*` values — RMHbox's is ~30 lines.
Components read `--app-*` directly; there is no per-app alias layer.

The shared pieces, all in `components/shared/`:

| Piece                                      | What it owns                                                                                                                                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppShell`                                 | Root wrapper: palette class + appearance modifier (`dark`/`light`/`high-contrast`, unknown values falling back to dark rather than stranding the app), `color-scheme` hint, density, toaster, connection chrome. |
| `AppHeader`                                | The app bar as a three-column grid — genuinely centred title that truncates instead of overlapping, steps aside below 640px, back label collapsing to its arrow below 480px with an `sr-only` name.              |
| `AppToaster` + `lib/shared/app-toast`      | One toast store and container for every app; timers are tracked, so a hand-dismissed toast doesn't leave a second one running and a route change cancels rather than leaks.                                      |
| `ConnectionStatus`                         | Reconnect banner + peer-wait overlay, so every socket-backed app reports an outage the same way, in the same place, with `reconnecting` distinguished from `connecting`.                                         |
| `GameLoadingFallback`, `GameErrorBoundary` | Loading/error surfaces for game routes (strings in the `shared` namespace).                                                                                                                                      |

**The rule:** a new full-screen app writes a palette class and mounts
`AppShell`/`AppHeader`. Adding a sixth copy of the shell, the header, the toast
store or the connection banner is the defect this tier was created to end — a
fix to any of it previously had to be made five times, and in practice never
was. Games with a bespoke visual identity (Temple of Joy, Slice It, Neon
Driftway) keep their own scoped variable groups in `globals.css`; they are
exempt from the palette, not from the shared behaviour.

---

## 13. What is enforced automatically

Most of this document is convention. A slice of it is executable, and runs in
the normal suite (`pnpm exec vitest run`, gated by `web-ci.yml`):

- **`lib/__tests__/design-consistency.test.ts` — one tab-strip grammar.** A
  static source scan over `components/` + `app/routes/` that fails on:
  (1) `role="tablist"` outside `components/ui/liquid-tabs.tsx` and its
  documented allowlist; (2) an `aria-selected` element that also carries a
  `border-b`/`underline` marker; (3) an inline tab-capsule `layoutId` outside
  the sanctioned renderer; (4) the conditional accent-underline bar shape
  (`absolute` + `bottom-0` + hairline height + `bg-site-accent`). The
  allowlists are short and each entry is justified in the file — **new tab
  strips get no entry**. The test also asserts it scanned >200 files, so a
  broken walker can't make the rules vacuously pass.
  Its own docstring records the one rule it _can't_ automate: a role-less
  switcher that marks its active slot some other way (an accent pill, a
  segmented control, a `flex-1` button row with an active tint) still belongs
  on `LiquidTabs`. Reviewers catch those by eye.
- **`lib/__tests__/appearance-contrast.test.ts`** — `ensureReadableAccent()`
  keeps a custom accent from shipping an unreadable `--site-accent-fg` pair.
- **`lib/__tests__/i18n-catalogs.test.ts` / `i18n-config.test.ts`** — catalog
  and namespace-registry integrity for §10.
- **`lib/__tests__/raf-loop-allowlist.test.ts`** — keeps rAF loops (the §7
  radial motion layer) to the sanctioned owners instead of one per feature.
- **`pnpm lint`** — `eslint-plugin-jsx-a11y` at "warn"; the bar is no _new_
  warnings versus the base branch.

A green suite means you did not regress the enforced rules. It does not mean
the change looks right — §0.9 is still a human looking at three themes.
