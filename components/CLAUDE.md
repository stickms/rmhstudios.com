# components/ — React components by feature

> Scope: guidance for working inside `components/`. Repo-wide context:
> [`/CLAUDE.md`](../CLAUDE.md). Visual rules:
> [`docs/design-language.md`](../docs/design-language.md).

~860 files organized **by feature, one directory per game/app/domain**, plus a
few shared directories. Rule of thumb: a component used by exactly one
feature lives in that feature's directory; genuinely shared primitives live in
`ui/`.

## Directory map

| Directory       | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/`           | **Shared primitives** — Button, Badge, Card, Dialog, Input, Textarea, Select, Label, EmptyState, Skeleton, Spinner/RadialLoader, Tooltip, IconButton, CopyButton, ConfirmDialog, Breadcrumbs, BackToTop, NotificationBadge, UserAvatar, OptimizedImage/BlurImage, AnimatedCount, ViewTransitionLink, NavigationProgress, RoutePending, pagination, slider, resizable, skeletons/. Also the glass layer: `liquid-glass` (GlassPane + the global GlassFilter host), `liquid-tabs` (the **only** sanctioned tab strip), `liquid-morph`. Always check here before writing new UI. Full API notes in `docs/design-language.md` §5. |
| `feed/`         | Feed/timeline plus the **layout system**: `SiteShell.tsx` (site-wide chrome, delegates to `radial/RadialShell`), `PageLayout.tsx` (canonical page wrapper), `ContextRail.tsx` (portals a page's `rightSidebar` into the shell's desktop live rail), `AnimatedMain.tsx`, `ColumnHeader.tsx`, post cards, composer. Also `feed.css`. Navigation lives in `radial/RadialHub` plus the desktop `radial/RadialNavRail`; the old left rail and mobile push-drawer are gone.                                                                                                                                                         |
| `site/`         | Site-level chrome: `CommandPalette` (mounted globally), `LanguageSwitcher`, `PasskeyManager`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `shared/`       | Cross-feature building blocks. **The full-screen app tier lives here**: `app-theme.css` (the `--app-*` token contract + chrome shared by RMHbox/RMHType/RMHStudy/RMHTube/RMHMusic), `AppShell`, `AppHeader`, `AppToaster`, `ConnectionStatus` (reconnect banner + peer-wait overlay), `GameBackLink` (the "leave this game" corner control). Also `GameLoadingFallback`, `GameErrorBoundary`, ChatPanel, EmojiPicker, ReactionMenu.                                                                                                                                                                                           |
| `errors/`       | `RouteErrorFallback`, `NotFound` — wired as route error/404 components.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `Providers.tsx` | Global provider stack: React Query, session (`useSession`), theme application (style-* class swap + `THEME_BG` map + `THEME_EXCLUDED_ROUTES`), i18n provider, `MotionConfig reducedMotion="user"`, sonner `<Toaster>`, CommandPalette.                                                                                                                                                                                                                                                                                                                                                                                        |
| `i18n/`         | `AppI18nProvider`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Per-game dirs   | `altair/`, `rmhbox/`, `slice-it/`, `velum2099/`, `void-breaker/`, `synapse-storm/`, `kowloon-knockout/`, `temple-of-joy/`, `neon-driftway/`, `lights-out/`, `cursed-logic/`, `house-always-wins/`, `laundry-sort/`, `cookgame/`, `dream-rift/`, `forest-explorer/`, `signal-forge/`, `vega/`, `versecraft/`, `daily-puzzles/`, `rmh-farming-sim/`, …                                                                                                                                                                                                                                                                          |
| Per-app dirs    | `rmhtube/`, `rmhmusic/`, `rmhtype/`, `rmhstudy/`, `rmhcode/`, `rmhvibe/`, `rmhladder/`, `rmhbox/`, `rmhcoins/`, `library/`, `studio/`, `creator-studio/`, `blog/`, `news/`, `predictions/`, `rideshare/`, `homes/`, `membership/`, `economy/`, `doctrine/`, …                                                                                                                                                                                                                                                                                                                                                                 |
| Admin/ops       | `admin/`, `moderation/`, `developer/`, `security/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Conventions

- **Styling:** only `--site-*` token utilities (`bg-site-surface`,
  `text-site-text-muted`, `rounded-site`, `shadow-site`, …). Merge classes
  with `cn()` from `@/lib/utils`. No hardcoded colors, radii, or fonts —
  the theme system depends on it, and raw palette classes plus
  `rounded-lg`/`-xl`/`-2xl` fail CI on the site tier.
- **Surfaces take a glass elevation class by role**, not an equivalent box:
  `.glass-fill` for repeated content (cards, rows, tiles — a shader slab when on
  screen, within the viewport budget), `.glass-pane` for singular panels, `.glass-chrome` for sticky
  chrome, `.glass-overlay` for anything floating (dialogs, popovers, menus,
  toasts — CI-enforced, because L1 is not a slab and a menu on it ghosts),
  `.glass-inset` for fields. `bg-site-surface border border-site-border
rounded-site shadow-site-sm` renders the same _box_ and none of the
  _material_ — no haze, no rim, no soft body, and nothing for
  `perf-lite` to switch off. Budget per tier
  (`lib/jelly/tiers.ts`): at most 24 rim slabs, 8 animated haze canvases and 24 CSS
  flow carriers on a desktop, fewer on phones (roles first, cards, then controls). **No box-shadow
  on any UI surface** — shadow tokens are zero; the refracting edge is the depth.
- **Plasmatic Jelly material.** Every role is a hazy translucent slab with
  always-on internal motion, the refracting lit rim of liquid glass, a soft body
  and electric arcs — all drawn by document services, never by a component.
  `lib/liquid/glass/engine.ts` draws the rim (a canvas appended as the host's LAST
  child, `z-index: -2` in an isolated stacking context) and, for the ambient slots,
  a `.jelly-haze-canvas`; `lib/jelly/flow-carriers.ts` injects a `.jelly-flow` span
  as the host's FIRST child elsewhere; `lib/jelly/physics.ts` squashes/wobbles
  hosts through the CSS `translate`/`scale` properties; `lib/jelly/arcs/` draws
  arcs on one body-level canvas. **There is no `backdrop-filter` in any glass role,
  and you must not add one** — the haze is shader- or transform-drawn. Floating
  glass (`chrome`, `overlay`) refracts a snapshot of the page; a `pane` is lit only
  unless it opts in (`data-liquid-glass="refract"`, keep text away from its edge).
  Opt an element out with `data-jelly="off"` (aliases `data-liquid-material="off"`,
  `data-fluid-press="none"`); opt a gesture subtree out with
  `data-jelly-scope="off"` (alias `data-liquid-motion="off"`) and a game
  play-field with `data-jelly-zone="playfield"`. Do not put `:first-child` /
  `:last-child` rules on the direct children of a glass role (the carrier and the
  canvas are children). **Nothing `position: fixed` inside a jelly host** — a host that can
  carry a transform is its containing block; portal it. Never add per-card pointer
  listeners, CSS hover lifts, framer `whileHover`/`whileTap` scale, `infinite`
  keyframes, arc drawing, gradient-position animation, or inherited root variable
  writes in frames. `app/liquid-glass.css` + `app/jelly-material.css` are the
  complete fallback tier. Layout never changes: hosts squash within 4px/3% and
  neighbours nudge ≤1.5px. See
  [`docs/plasmatic-jelly-system.md`](../docs/plasmatic-jelly-system.md).
- **Variants:** use `class-variance-authority` for components with variant
  APIs (see `ui/button.tsx`, `ui/badge.tsx`). Set a `data-slot="..."`
  attribute on new primitives — themes restyle components through
  `[data-slot]` selectors in `globals.css`.
- **Icons:** `lucide-react` only. Decorative icons get `aria-hidden`;
  icon-only buttons get `aria-label`/`sr-only` text.
- **Strings:** every user-visible string through `t("key", { defaultValue })`.
  Component namespaces are `c-<area>` (e.g. `c-ui`, `c-rmhbox`); pages mostly
  use `site`. Run `pnpm i18n:extract` after adding strings.
- **Motion:** framer-motion inline props and shared motion tokens; global
  `MotionConfig` uses the same scheme for every account and device. Do not add
  reduced-motion preference branches. Use `hooks/useCelebration` for confetti.
- **Toasts:** `import { toast } from "sonner"` — the themed `<Toaster>` is
  already mounted in `Providers.tsx`.
- **Session:** client components read auth via `useSession()` from
  `@/components/Providers` — don't fetch `/api/auth` manually.
- **Multiplayer lobbies hand out a link, not just a code.** Every lobby has a
  copy-the-invite-link control built on `hooks/useLobbyLink`, and every
  multiplayer entry point consumes `?lobby=CODE` through `useLobbyInviteJoin`
  (which joins once the socket is up and then strips the param). Two games —
  RMHbox and Altair — address their lobby by path instead (`/rmhbox/<code>`), so
  they pass `path` rather than `code`; casino tables need `tab` + `game` in the
  link too (`components/rmhcoins/TableInvite`). A game that gates on sign-in
  routes login back through `lobbyReturnPath()` so the invite survives the
  detour. Don't hand-roll a share URL: `lib/lobby-link.ts` owns the shape.
- **User display data:** render avatars/names via `useFreshUser` /
  `stores/userDisplayStore` so they update live; the shared Prisma select for
  user shapes is `userDisplaySelect` in `lib/user-display.ts`.
- **Server code:** never import `@/lib/*.server` modules from components.
  Fetch through API routes, loaders, or server functions.
- **Accessibility:** jsx-a11y lint runs at warn — don't add new warnings.
  Prefer Radix-based `ui/` primitives over hand-rolled interactive widgets.
- **Full-screen games/apps:** use the shared viewport primitives in
  `app/globals.css` — `.app-viewport` (a shell that never scrolls), `.app-page`
  (a full-screen screen that IS a document — landing, lobby, results),
  `.app-screen` (a menu that scrolls instead of clipping),
  `.app-stage-fit`/`.app-stage` (a fixed-aspect playfield), `.app-hud` (chrome
  inset by the device safe area). Five rules, each a shipped bug before it was a
  rule: edge-pinned controls add `var(--safe-*)`; `aspect-ratio` never sits
  beside a `max-*` clamp; anything that centres AND scrolls uses
  `items-center-safe`/`justify-center-safe`; a full-screen canvas clamps its DPR
  (`gameSurfaceDpr()` in 2D, `lib/render/tier.ts` in 3D) and never reallocates
  itself per frame; and a screen whose content is a column you read top to
  bottom scrolls the DOCUMENT (`.app-page`), never a `flex-1 overflow-y-auto`
  box inside a viewport-height shell — mobile Safari only collapses its
  address/tab bars for document scroll. Rules 2–4 are gated by
  `lib/__tests__/game-viewport-consistency.test.ts`; the full rationale is
  [`docs/design-language.md`](../docs/design-language.md) §12.1.

## Adding UI — decision tree

1. Does a `ui/` primitive already do it? Use it.
2. Is it a variant of an existing primitive? Extend the CVA variants rather
   than forking the component.
3. Feature-specific? Put it in that feature's directory next to its users.
4. Needed by 2+ features? Then it belongs in `ui/` (primitive) or `shared/`
   (composite) — with `data-slot`, tokens, i18n, and a11y from day one.

## Before you commit UI

`pnpm check:consistency` (repo `CLAUDE.md` → "The commit gate") is the gate;
`.claude/hooks/commit-gate.sh` and `.githooks/pre-commit` run it for you. It
catches the mechanical half — raw palette colours, hardcoded radii,
`transition-all`, dead `tailwindcss-animate` classes, a hand-rolled tab strip
or `layoutId` capsule, floating UI below L4. Everything below is the half it
cannot see, and it is the half that decides whether the change looks native:

- [ ] **A primitive, not a second copy of one.** A duplicated button, modal,
      spinner, empty state or copy button is this repo's most common defect
      (design-language.md §0.3). Check `ui/` before writing anything.
- [ ] **Elevation by role, not by eye** — `.glass-fill` repeated content ·
      `.glass-pane` singular panels · `.glass-chrome` sticky chrome ·
      `.glass-overlay` anything floating · `.glass-inset` fields. Never a
      hand-rolled `bg-site-surface border rounded-site` box: it paints the box
      and none of the material, and the degradation tiers have nothing to
      switch off.
- [ ] **Ink tracks its surface** (`bg-site-accent` → `text-site-accent-fg`),
      never `text-white`/`text-black` on a themed surface.
- [ ] **A switcher is a tab strip** even without `role="tablist"` — an accent
      pill, a segmented control, a `flex-1` button row with an active tint all
      belong on `<LiquidTabs>`. The gate only catches the obvious shapes; this
      one is on you.
- [ ] **Motion from `lib/motion.ts`** (`DURATION`/`EASE`/`SPRING`/
      `APPLE_SPRING`, the named variants), not ad-hoc numbers; anything the
      user drags is a spring, not a duration.
- [ ] **Strings through `t("key", { defaultValue })`** in the `c-<area>`
      namespace, `pnpm i18n:extract` run, key present in `locales/en/`. New
      namespace ⇒ also register it in `NAMESPACES` (`lib/i18n/config.ts`).
- [ ] **Looked at in both themes × two widths** — Daylight and `.style-graphite`,
      phone and desktop, once with jelly motion `still`.
      Nothing in CI can do this for you (design-language.md §0.9).
- [ ] **iOS bars stay clear**: nothing new is `fixed`/`sticky` flush to the top or bottom
      edge, and no new full-viewport fixed layer (hide it on `html.ios-webkit`).
      `ios-edge-contract.test.ts` blocks the static cases; run `pnpm audit:pages` for a
      shell, page-frame or global-CSS change.
- [ ] **Keyboard + screen reader**: icon-only controls named, decorative icons
      `aria-hidden`, focus ring visible against the surface it lands on, no new
      jsx-a11y warnings.
- [ ] Full-screen game/app work also holds the §12.1 viewport contract —
      `lib/__tests__/game-viewport-consistency.test.ts` gates three of its five
      rules; safe-area insets, DPR clamping and per-frame canvas reallocation
      are yours to check.

When the system does not have what you need, **extend the system** — add the
token, the variant, the primitive — and say so in the commit message. A magic
number solved locally is how five apps ended up with five focus rings.
