# Design Language — rmhstudios.com

> Audience: humans **and** coding agents. This is the reference for how the site
> looks and feels, and how to build UI that is visually native to it. For the
> step-by-step "build a page that fits" checklist, see
> [`docs/page-consistency.md`](./page-consistency.md).

The whole visual system rests on one idea: **a single CSS custom-property
contract (`--site-*`) that every theme re-defines.** Components never hardcode
colors, radii, fonts, or shadows — they consume the contract through Tailwind
utilities. Because of that, all 31 themes (dark, light, high-contrast, gamer,
anime, zodiac signs, seasons, …) restyle the entire site without a single
component change.

---

## 1. The token contract (`app/globals.css`)

Tailwind v4 is imported at the top of `app/globals.css`; an `@theme inline`
block binds the `--site-*` variables to utility classes. The `:root` block is
the **default (dark) theme** — there is no `.style-default` class; default is
the absence of any `.style-*` class on `<html>`.

Tokens every theme defines (set in `:root`, overridden by each `.style-*`
class):

| Group | Tokens |
|---|---|
| Backgrounds | `--site-bg`, `--site-bg-subtle` |
| Surfaces | `--site-surface`, `--site-surface-hover`, `--site-surface-active` |
| Borders | `--site-border`, `--site-border-bright`, `--site-border-width` (1px default; 2–4px in heavy themes) |
| Text | `--site-text`, `--site-text-muted`, `--site-text-dim` |
| Accent | `--site-accent`, `--site-accent-fg`, `--site-accent-hover`, `--site-accent-dim` |
| Status | `--site-success`, `--site-danger`, `--site-warning` |
| Elevation / shape | `--site-shadow`, `--site-radius` (12px default), `--site-radius-sm` (8px default) |
| Typography | `--site-font-display`, `--site-font-body`, `--site-font-mono` |
| Motion / flourish | `--site-transition-speed` (200ms default), `--site-card-transform`, `--site-glow`, `--site-text-shadow`, `--site-letter-spacing`, `--site-heading-transform` |

### Tailwind utilities — use these, never raw hex/oklch

| Purpose | Utilities |
|---|---|
| Backgrounds | `bg-site-bg`, `bg-site-bg-subtle`, `bg-site-surface`, `bg-site-surface-hover`, `bg-site-surface-active` |
| Borders | `border-site-border`, `border-site-border-bright` |
| Text | `text-site-text`, `text-site-text-muted`, `text-site-text-dim` |
| Accent | `bg-site-accent`, `text-site-accent`, `text-site-accent-fg`, `bg-site-accent-hover`, `bg-site-accent-dim` |
| Status | `text-site-success`, `text-site-danger`, `text-site-warning` (and `bg-` variants) |
| Radius | `rounded-site`, `rounded-site-sm` (theme-aware — do not use `rounded-lg`/`rounded-xl` for site chrome) |
| Shadow | `shadow-site` |
| Fonts | `font-nunito` (body default), `font-sans` (Inter), `font-mono` (JetBrains Mono), `font-display` (Nunito), `font-serif` (Playfair), `font-comic` (Bangers) |
| Theme display font | `font-(family-name:--site-font-display)` — used for page `<h1>`s so headings adopt each theme's display face |

Extra breakpoint: `xs` = 480px (defined in the `@theme inline` block).

A legacy shadcn token set (`--card`, `--primary`, `--muted`, `--border`,
`--ring`, `--radius`, `--chart-*`, `--sidebar*`) also exists for a few
shadcn-derived pieces. **Prefer `--site-*` for all new site UI.** A separate
`.dark` class exists only for Slice It game variables — it is *not* the site
theme mechanism.

---

## 2. Themes (31 total)

Theme = a `.style-<id>` class on `<html>`. The catalog lives in
`stores/themeStore.ts` (`SITE_STYLES`, with id/label/icon/group); the CSS for
each lives in `app/globals.css`.

| Group | Themes |
|---|---|
| Base | `default` (dark, `:root`), `light`, `high-contrast` (WCAG AAA: pure black/white, yellow accent, 2px borders) |
| Vibes | `gamer` (neon green, Orbitron), `anime` (pastel pink, pill shapes), `musical` (navy/gold, Playfair), `hyperpop`, `comic-book` (Bangers, thick black borders), `cinema` (Cinzel, letterbox) |
| Culture | `gen-z`, `boomer` |
| Zodiac | `aries`, `taurus`, `gemini`, `cancer`, `leo`, `virgo`, `libra`, `scorpio`, `sagittarius`, `capricorn`, `aquarius`, `pisces` |
| Seasons | `spring`, `summer`, `autumn`, `winter` |
| School | `elementary`, `middle-school`, `high-school`, `university` |

Beyond tokens, themes can override component look via `[data-slot="..."]`
selectors (cards, buttons, section headings, navbar) and add full-page
background effects (scanlines, blobs, grain, halftone) via `body` pseudo
elements. Those effects are disabled on mobile (≤767px) and under reduced
motion. **This is why shared primitives set `data-slot` attributes — keep
doing that in new primitives.**

### Theme runtime (how switching works)

- `stores/themeStore.ts` — Zustand `useThemeStore { style, setStyle }`.
- `components/Providers.tsx` — an effect swaps the `style-*` class on
  `<html>`, persists to `localStorage["rmh-style"]`, and updates
  `<meta name="theme-color">` + body background from its `THEME_BG` map.
  Games/app routes are excluded (`THEME_EXCLUDED_ROUTES`) — they own their
  styling; an `app-route` class is toggled on `<html>` for them.
- **No-flash SSR:** an inline `themeScript` in `app/routes/__root.tsx` applies
  the persisted class *before hydration*; a `bodyThemeScript` sets the body
  background first thing in `<body>`. If you add a theme, update both the CSS,
  `SITE_STYLES`, and the hardcoded theme→background map in `__root.tsx` /
  `Providers.tsx`.

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

Always reach for these before writing new markup. Helper: `cn()` from
`@/lib/utils` (= `twMerge(clsx(...))`).

| Component | File | Notes |
|---|---|---|
| `Button` / `buttonVariants` | `components/ui/button.tsx` | CVA. Variants: `default`, `destructive`, `danger`, `outline`, `secondary`, `ghost`, `link`, `accent`, `accent-outline`, `accent-ghost`. Sizes: `xs`, `sm`, `default`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`. `asChild` supported. **`loading` prop** (+ optional `loadingText`) shows an inline spinner, sets `aria-busy`, and disables the button — reach for this instead of hand-rolling `disabled={x}` + a separate `<Loader2>`. |
| `Badge` / `badgeVariants` | `components/ui/badge.tsx` | CVA pill. Variants: `default`, `accent`, `solid`, `success`, `warning`, `danger`, `outline`. |
| `Card` + Header/Title/Description/Action/Content/Footer | `components/ui/card.tsx` | `bg-site-surface border border-site-border rounded-site shadow-site`. |
| `Dialog` (Radix wrapper) | `components/ui/dialog.tsx` | Themed content, `bg-black/70 backdrop-blur-sm` overlay, built-in close X with translated `sr-only` label. |
| `Input`, `Textarea` | `components/ui/input.tsx`, `textarea.tsx` | `bg-site-bg`, `rounded-site-sm`, accent focus ring. |
| `Select` | `components/ui/select.tsx` | Styled **native** `<select>` + lucide chevron (not Radix Select). |
| `Label` | `components/ui/label.tsx` | Radix Label. |
| `EmptyState` | `components/ui/empty-state.tsx` | Canonical zero-state: `{icon, title, description, action}`. |
| `Skeleton` | `components/ui/skeleton.tsx` | Canonical loading placeholder. Defaults to a gentle `animate-pulse`; pass **`shimmer`** for a travelling highlight sweep (reduced-motion-safe) — nicer for above-the-fold / hero placeholders. |
| `Spinner` | `components/ui/spinner.tsx` | Canonical spinner (lucide `Loader2`, `role="status"`) for **standalone / section loading** (accent-coloured, centred). A bare inline `<Loader2 className="animate-spin" />` inside a button/label is fine — it inherits `currentColor` so it contrasts its container; forcing `<Spinner>` there would paint it accent-on-accent. |
| `Tooltip` | `components/ui/Tooltip.tsx` | Portal + framer-motion. Shows on **hover and keyboard focus**, dismisses on Escape, wires `aria-describedby`. |
| `IconButton` | `components/ui/icon-button.tsx` | Icon-only `Button` that requires a `label` (becomes `aria-label` **and** a `Tooltip`). Reach for this instead of a bare `<button aria-label>`. |
| `CopyButton` / `useClipboard` | `components/ui/copy-button.tsx`, `hooks/useClipboard.ts` | Canonical copy-to-clipboard: icon → check, sonner toast, `execCommand` fallback. Don't hand-roll `navigator.clipboard.writeText` + `useState`. |
| `ConfirmDialog` / `useConfirm` | `components/ui/confirm-dialog.tsx` | Themed promise-based confirm — `await confirm({ title, description, danger })`. Replaces native `window.confirm` (which ignores themes/i18n/a11y). `<ConfirmProvider>` is already mounted in `Providers`. |
| `Breadcrumbs` | `components/ui/breadcrumbs.tsx` | "Where am I" trail for nested pages; also a `breadcrumbs?` prop on `PageLayout`. Last item is the current page (`aria-current`). |
| `BackToTop` | `components/ui/back-to-top.tsx` | Floating scroll-to-top button, mounted once in the `_site` shell (targets the window **and** the mobile `[data-scroll-root]` scroller). |
| `NotificationBadge` | `components/ui/notification-badge.tsx` | Count pill (`bg-site-danger`). |
| `UserAvatar` | `components/ui/UserAvatar.tsx` | Default fallback `/images/social/default_avatar.png`. |
| `OptimizedImage`, `BlurImage` | `components/ui/` | Image loading. |
| `AnimatedCount`, `ViewTransitionLink`, `NavigationProgress`, `RoutePending` | `components/ui/` | Motion/navigation helpers. `RoutePending` is the router-wide pending fallback. |
| Pagination, Slider (Radix), Resizable, `skeletons/PostCardSkeleton` | `components/ui/` | — |

Surfaces outside `Card`: `bg-site-surface border border-site-border
rounded-site`; hover affordance `hover:bg-site-surface-hover
hover:border-site-border-bright` (or `hover:border-site-accent`). Dividers:
`divide-y divide-site-border`.

Toasts: **sonner**. A themed global `<Toaster>` is mounted in
`components/Providers.tsx`; pages just `import { toast } from "sonner"`.

---

## 6. Layout system & page anatomy

The `_site` layout route (`app/routes/_site.tsx`) provides the shell:
`LeftSidebar` (fixed desktop aside, `md:w-16 xl:w-64`), `MobileNav` (bottom
bar), skip link, and `<main id="main-content">` with the `.page-root` enter
animation. **Pages never re-add sidebars.**

Two page archetypes (see `docs/page-consistency.md` for full code):

1. **Standard content page** — wrap in
   `components/feed/PageLayout.tsx`:
   `PageLayout({ title, children, rightSidebar?, headerExtra?, headerRight?, wide?, backTo?, backLabel? })`.
   It renders the sticky translucent header
   (`sticky top-0 z-10 h-15 bg-site-bg/85 backdrop-blur-md border-b border-site-border`),
   the bordered center column, and a right sidebar or spacer.
2. **Feed-column page** — use `AnimatedMain` directly with a target width from
   `lib/layout-width.ts`.

Column widths come from `lib/layout-width.ts`: `DEFAULT_WIDTH = 648`,
`WIDE_WIDTH = 800`, `WIDE_NO_RIGHT_SIDEBAR_WIDTH = 952`. Inner content is
usually `px-4 pt-4 pb-12 max-w-2xl mx-auto`; the column always carries
`border-r border-site-border pb-16 md:pb-0` (the `pb-16` clears the mobile
bottom nav). Vertical rhythm via `space-y-*` / `divide-y divide-site-border`.

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

- Keyboard focus: `:focus-visible { outline: 2px solid var(--site-accent); outline-offset: 2px }`.
  Text inputs opt out (border + caret instead); `Button` draws its own
  `focus-visible:ring-site-accent/40 ring-[3px]`.
- Selection color uses the accent; native controls get
  `accent-color: var(--site-accent)`; scrollbars are thin and themed.
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
const { t } = useTranslation("site");
t("wallet-title", { defaultValue: "Wallet" });
```

Namespace conventions (files under `locales/en/`):

| Namespace | Used for |
|---|---|
| `site` | most `_site/` pages |
| `common`, `nav`, `pages`, `shared`, `feed` | core shell + feed |
| `admin`, `library`, `rideshare`, `groups`, `builds`, `user-builds`, `v` | feature areas |
| `c-<area>` (e.g. `c-ui`, `c-rmhbox`) | component strings |
| `r-<area>` (e.g. `r-strategies`) | route/experience entry strings |

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
