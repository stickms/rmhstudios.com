# Design Language — rmhstudios.com

> Audience: humans **and** coding agents. This is the reference for how the site
> looks and feels, and how to build UI that is visually native to it. For the
> step-by-step "build a page that fits" checklist, see
> [`docs/page-consistency.md`](./page-consistency.md).

The whole visual system rests on one idea: **a single CSS custom-property
contract (`--site-*`) that every theme re-defines.** Components never hardcode
colors, radii, fonts, or shadows — they consume the contract through Tailwind
utilities. Because of that, every theme — the base themes (Glass Dark, Glass
Light, High Contrast), the curated set (Graphite / Sepia / Nocturne Glass), and
any accent preset layered on top — restyles the entire site without a single
component change.

**Liquid Glass is the material system, not a theme.** The site's default look is
physically-plausible layered glass with **live optics** (v2): translucent
surfaces over a **two-layer, depth-parallaxing aurora canvas** that flows and
follows pointer / device motion; a **specular rim glint on every glass
surface** that tracks the scene light (the pointer on desktop, a fixed top
"sun" otherwise); **lens-model edge refraction** (a real displacement height
field, Chromium-enhanced) with an optional chromatic **prism** dispersion on
one flagship surface per page; a pointer-tracked diffuse light on interactive
elements; and travelling **liquid sheens** on signature surfaces. The shell
itself is **floating glass**: an inset rounded sidebar rail, floating header
capsules, and content panes separated by aurora gutters instead of an
app-frame of borders.
It is expressed as an **elevation system of explicit CSS classes**
(`.glass-fill` / `.glass-pane` / `.glass-chrome` / `.glass-overlay` /
`.glass-inset`, plus the modifiers in §5.1) placed _on_ components. Every
theme is a _tint_ of that glass; `high-contrast` turns the glass off (opaque,
blur-free). Specs: [v1 material system](./plans/2026-07-14-liquid-glass-ui-redesign.md)
· [v2 optics & floating shell](./plans/2026-07-21-liquid-glass-v2-optics.md).

---

## 1. The token contract (`app/globals.css`)

Tailwind v4 is imported at the top of `app/globals.css`; an `@theme inline`
block binds the `--site-*` variables to utility classes. The `:root` block is
the **default (dark) theme** — there is no `.style-default` class; default is
the absence of any `.style-*` class on `<html>`.

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
| Elevation / shape | `--site-shadow` (prominent: modals/popovers/floating chrome), `--site-shadow-sm` (resting: cards/surfaces), `--site-radius` (18px default), `--site-radius-sm` (12px default)                                                                               |
| Typography        | `--site-font-display`, `--site-font-body`, `--site-font-mono`                                                                                                                                                                                               |
| Motion / flourish | `--site-transition-speed` (200ms default), `--site-card-transform`, `--site-glow`, `--site-text-shadow`, `--site-letter-spacing`, `--site-heading-transform`                                                                                                |

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

A legacy shadcn token set (`--card`, `--primary`, `--muted`, `--border`,
`--ring`, `--radius`, `--chart-*`, `--sidebar*`) also exists for a few
shadcn-derived pieces. **Prefer `--site-*` for all new site UI.** A separate
`.dark` class exists only for Slice It game variables — it is _not_ the site
theme mechanism.

---

## 2. Themes (6, all glass tints) + accent presets

The catalog is a tight, tasteful set — every theme is a **tint of the glass**
over its own `--site-canvas` aurora. Theme = a `.style-<id>` class on `<html>`
(the default `Glass Dark` is the bare `:root` — no class). The catalog lives in
`stores/themeStore.ts` (`SITE_STYLES`, with id/label/icon/group); the CSS for
each lives in `app/globals.css`. Visitors with no saved preference get
`DEFAULT_STYLE` (`default`). The old `liquid-glass` id is retired — it _became_
the default; persisted prefs self-heal in `Providers.tsx`.

| Group   | Themes                                                                                                                                                                                                                                                                                  |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base    | `default` (**Glass Dark** — the site default: aurora-lit deep-ocean canvas, translucent surfaces, specular rims), `light` (**Glass Light** — daylight canvas, brighter white frost, dark ink), `high-contrast` (WCAG AAA, **no glass**: opaque black/white, yellow accent, 2px borders) |
| Curated | `graphite` (Graphite Glass — monochrome smoke, desaturated), `sepia` (Sepia Glass — warm parchment, amber accent), `nocturne` (Nocturne Glass — deep-navy nightscape, sky-blue aurora)                                                                                                  |

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

| Class                                        | Tier            | Use for                                                                                                                                                                    |
| -------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.glass-fill`                                | L1 (no blur)    | Repeated content: cards, list rows, table rows, grid tiles. Cheap, unlimited.                                                                                              |
| `.glass-pane`                                | L2 (blur+noise) | Singular panels: heroes, composers, settings sections, tier cards. Budgeted.                                                                                               |
| `.glass-chrome` (`--aside` variant)          | L3              | Persistent chrome: sidebar, sticky headers, mobile dock. Condenses on scroll via `[data-scrolled]`.                                                                        |
| `.glass-overlay`                             | L4              | Floating UI: dialogs, popovers, menus, command palette, toasts, tooltips.                                                                                                  |
| `.glass-inset`                               | —               | Recessed wells: inputs, search fields.                                                                                                                                     |
| `.glass-scrim`                               | —               | Dialog/drawer backdrops.                                                                                                                                                   |
| `.glass-interactive` + `data-glass-light=""` | modifier        | Hover tint-raise, springy press flex (`--ease-glass`), pointer-tracked diffuse highlight (`::after`), and — on `.glass-fill` — the hover-only specular rim glint.          |
| `.glass-refract` + `data-glass-lens`         | modifier        | Lens-model edge refraction (v2): the backdrop bends through a displacement height field at the pane edge. Hero/chrome only, **≤2 per page**, never in scroll containers. `data-glass-lens` opts into per-element filter sizing (`lib/glass-lens.ts`; Chromium bends the backdrop, Gecko/WebKit displace a mirrored aurora copy — §3.6). Pressing deepens the bend (`:active`, ×1.6, §3.7). Not compatible with `.glass-chrome--aside` (its `::before` is the blur carrier, so the lens band has nowhere to live). |
| `.glass-refract--prism`                      | modifier        | True chromatic dispersion (R/G/B displaced at different magnitudes) + fringe. **≤1 per page**; sanctioned users: login card, command palette, `/store` featured tier, design lab. |
| `.glass-liquid` (or `<GlassPane liquid>`)    | modifier        | Ambient travelling sheen (light over wet glass), painted as a background layer (v2) so it **composes freely** with `.glass-refract` and `.glass-interactive`. Signature surfaces only, **≤3 per page**, never on list items. |
| `.glass-sheen-hover`                         | modifier        | One-shot sheen sweep on hover — primary CTAs (`Button` `default`/`accent` have it built in). Unlimited.                                                                     |
| `.glass-bevel-sm`                            | modifier        | Narrow 6px optics ring for small capsules — the `LiquidTabs` sheet pill (§5.45), plus discs like BackToTop.                                                                |
| `.glass-opaque`                              | —               | Escape hatch for full-screen fixed takeovers that must hide the page.                                                                                                      |

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

The `Card` primitive is L1 `.glass-fill` by default; pass `pane` for L2 and
`interactive` for the pointer light. Inputs/Textarea/Select are `.glass-inset`;
Dialog is `.glass-overlay` + `.glass-scrim`; the shell chrome is `.glass-chrome`.

### 5.2 Primitive catalog

Always reach for these before writing new markup. Helper: `cn()` from
`@/lib/utils` (= `twMerge(clsx(...))`).

| Component                                                                   | File                                                     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button` / `buttonVariants`                                                 | `components/ui/button.tsx`                               | CVA. Variants: `default`, `destructive`, `danger`, `outline`, `secondary`, `ghost`, `link`, `accent`, `accent-outline`, `accent-ghost`. Sizes: `xs`, `sm`, `default`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`. `asChild` supported. **`loading` prop** (+ optional `loadingText`) shows an inline spinner, sets `aria-busy`, and disables the button — reach for this instead of hand-rolling `disabled={x}` + a separate `<Loader2>`. |
| `Badge` / `badgeVariants`                                                   | `components/ui/badge.tsx`                                | CVA pill. Variants: `default`, `accent`, `solid`, `success`, `warning`, `danger`, `outline`.                                                                                                                                                                                                                                                                                                                                                 |
| `Card` + Header/Title/Description/Action/Content/Footer                     | `components/ui/card.tsx`                                 | `bg-site-surface border border-site-border rounded-site shadow-site`.                                                                                                                                                                                                                                                                                                                                                                        |
| `Dialog` (Radix wrapper)                                                    | `components/ui/dialog.tsx`                               | Themed content, `bg-black/70 backdrop-blur-sm` overlay, built-in close X with translated `sr-only` label.                                                                                                                                                                                                                                                                                                                                    |
| `Input`, `Textarea`                                                         | `components/ui/input.tsx`, `textarea.tsx`                | `bg-site-surface`, `rounded-site-sm`, hairline border, accent focus ring.                                                                                                                                                                                                                                                                                                                                                                    |
| `Select`                                                                    | `components/ui/select.tsx`                               | Styled **native** `<select>` + lucide chevron (not Radix Select).                                                                                                                                                                                                                                                                                                                                                                            |
| `Label`                                                                     | `components/ui/label.tsx`                                | Radix Label.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `EmptyState`                                                                | `components/ui/empty-state.tsx`                          | Canonical zero-state: `{icon, title, description, action}`.                                                                                                                                                                                                                                                                                                                                                                                  |
| `Skeleton`                                                                  | `components/ui/skeleton.tsx`                             | Canonical loading placeholder. Defaults to a gentle `animate-pulse`; pass **`shimmer`** for a travelling highlight sweep (reduced-motion-safe) — nicer for above-the-fold / hero placeholders.                                                                                                                                                                                                                                               |
| `Spinner`                                                                   | `components/ui/spinner.tsx`                              | Canonical spinner (lucide `Loader2`, `role="status"`) for **standalone / section loading** (accent-coloured, centred). A bare inline `<Loader2 className="animate-spin" />` inside a button/label is fine — it inherits `currentColor` so it contrasts its container; forcing `<Spinner>` there would paint it accent-on-accent.                                                                                                             |
| `Tooltip`                                                                   | `components/ui/Tooltip.tsx`                              | Portal + framer-motion. Shows on **hover and keyboard focus**, dismisses on Escape, wires `aria-describedby`.                                                                                                                                                                                                                                                                                                                                |
| `IconButton`                                                                | `components/ui/icon-button.tsx`                          | Icon-only `Button` that requires a `label` (becomes `aria-label` **and** a `Tooltip`). Reach for this instead of a bare `<button aria-label>`.                                                                                                                                                                                                                                                                                               |
| `CopyButton` / `useClipboard`                                               | `components/ui/copy-button.tsx`, `hooks/useClipboard.ts` | Canonical copy-to-clipboard: icon → check, sonner toast, `execCommand` fallback. Don't hand-roll `navigator.clipboard.writeText` + `useState`.                                                                                                                                                                                                                                                                                               |
| `ConfirmDialog` / `useConfirm`                                              | `components/ui/confirm-dialog.tsx`                       | Themed promise-based confirm — `await confirm({ title, description, danger })`. Replaces native `window.confirm` (which ignores themes/i18n/a11y). `<ConfirmProvider>` is already mounted in `Providers`.                                                                                                                                                                                                                                    |
| `Breadcrumbs`                                                               | `components/ui/breadcrumbs.tsx`                          | "Where am I" trail for nested pages; also a `breadcrumbs?` prop on `PageLayout`. Last item is the current page (`aria-current`).                                                                                                                                                                                                                                                                                                             |
| `BackToTop`                                                                 | `components/ui/back-to-top.tsx`                          | Floating scroll-to-top button, mounted once in the `_site` shell (targets the window **and** the mobile `[data-scroll-root]` scroller).                                                                                                                                                                                                                                                                                                      |
| `NotificationBadge`                                                         | `components/ui/notification-badge.tsx`                   | Count pill (`bg-site-danger`).                                                                                                                                                                                                                                                                                                                                                                                                               |
| `UserAvatar`                                                                | `components/ui/UserAvatar.tsx`                           | Default fallback `/images/social/default_avatar.png`.                                                                                                                                                                                                                                                                                                                                                                                        |
| `OptimizedImage`, `BlurImage`                                               | `components/ui/`                                         | Image loading.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `AnimatedCount`, `ViewTransitionLink`, `NavigationProgress`, `RoutePending` | `components/ui/`                                         | Motion/navigation helpers. `RoutePending` is the router-wide pending fallback.                                                                                                                                                                                                                                                                                                                                                               |
| Pagination, Slider (Radix), Resizable, `skeletons/PostCardSkeleton`         | `components/ui/`                                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Surfaces outside `Card`: `bg-site-surface border border-site-border
rounded-site`; hover affordance `hover:bg-site-surface-hover
hover:border-site-border-bright` (or `hover:border-site-accent`). Dividers:
`divide-y divide-site-border`.

Toasts: **sonner**. A themed global `<Toaster>` is mounted in
`components/Providers.tsx`; pages just `import { toast } from "sonner"`.

---

## 6. Layout system & page anatomy

The `_site` layout route (`app/routes/_site.tsx`) provides the **floating
glass shell** (v2): the desktop sidebar is an inset rounded rail
(`glass-chrome--aside` panel with `m-3 rounded-site` inside the fixed aside,
`md:w-16 xl:w-64` spacer geometry unchanged), `MobileSidebarShell` (mobile
drawer + dock), skip link, aurora gutters between rail/content/right-rail
(`md:gap-4 xl:gap-6 md:px-4` on the shell flex row), and the single
`<main id="main-content">` with the `.page-root` enter animation. **Pages
never re-add sidebars** (and `AnimatedMain` renders a `<div>` — the shell's
`<main>` is the one landmark).

Two page archetypes (see `docs/page-consistency.md` for full code):

1. **Standard content page** — wrap in
   `components/feed/PageLayout.tsx`:
   `PageLayout({ title, children, rightSidebar?, headerExtra?, headerRight?, wide?, backTo?, backLabel?, breadcrumbs? })`.
   It renders the **floating header capsule**
   (`.glass-chrome sticky top-2 mx-2 rounded-site shadow-site-sm md:top-3 md:mx-3`,
   condensing on scroll via `data-scrolled`: shorter, more opaque, more blur,
   brighter glint), the transparent center column, and a right sidebar
   (a `sticky top-3 space-y-3` floating widget stack) or spacer.
2. **Feed-column page** — use `AnimatedMain` directly with a target width from
   `lib/layout-width.ts`.

Column widths come from `lib/layout-width.ts`: `DEFAULT_WIDTH = 648`,
`WIDE_WIDTH = 800`, `WIDE_NO_RIGHT_SIDEBAR_WIDTH = 952`. Inner content is
usually `px-4 pt-4 pb-12 max-w-2xl mx-auto`; the column always carries
`pb-dock` (clears the mobile dock) and **no `border-r`** — the old app-frame
edge is gone. Repeated content floats as spaced `.glass-fill` cards
(`space-y-3 px-3`); hairline `divide-y` rhythm lives *inside* container
cards, not between page-level sections.

Full-screen experiences (games, `/login`, legal pages, Discord activities) live
at the **top level** of `app/routes/` — outside `_site/` — and deliberately get
no shell.

---

## 7. Motion

- **framer-motion** is the animation library. Reach for the shared motion
  system in **`lib/motion.ts`** rather than hand-typing durations/easings:
  it exports the timing tokens (`DURATION`, `EASE`, `SPRING`, `transition`)
  and ready-made variants (`fade`, `fadeRise`, `fadeDown`, `scaleIn`, `popIn`,
  `overlay`, `modalContent`, `staggerContainer`/`staggerItem`). Keeping enters,
  exits, and lists on these tokens is what makes motion feel like one system
  — smooth and quick (nothing here is slower than 0.3s). Inline props are still
  fine for one-offs, but prefer `transition` / a named variant so a global
  re-tune stays a one-line change.
- `<MotionConfig reducedMotion="user">` wraps the app (`Providers.tsx`), so
  framer-motion automatically respects OS reduced-motion.
- CSS motion: `.page-root > *` runs the `page-enter` animation (0.22s fade +
  6px rise), suppressed on history-back (`html.nav-pop`) and during View
  Transitions (`html.vt-active`). Feed items use `.feed-item-enter`.
  Shared-element View Transitions go through `lib/view-transition.ts`.
- **Living backdrop (v2 — two layers):** the aurora canvas (`body::before`)
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
  `deviceorientation` to the same `--light-x/--light-y` under `html.tilt-live`,
  so tilting the phone slides the glint across every pane (§5.5x C; opt-in on
  iOS via the Settings → Appearance tilt row).
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
- RTL locales (`ar`, `ur`, `fa`) are first-class: `<html dir>` is set
  pre-paint; use logical spacing where possible and `.rtl-flip` on directional
  icons.
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
