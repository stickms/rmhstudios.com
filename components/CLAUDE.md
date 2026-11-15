# components/ — React components by feature

> Scope: guidance for working inside `components/`. Repo-wide context:
> [`/CLAUDE.md`](../CLAUDE.md). Visual rules:
> [`docs/design-language.md`](../docs/design-language.md).

Hundreds of files (`componentTsxFiles` in `docs/_generated/facts.json`) organized **by feature, one directory per game/app/domain**, plus a
few shared directories. Rule of thumb: a component used by exactly one
feature lives in that feature's directory; genuinely shared primitives live in
`ui/`.

## Directory map

| Directory       | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/`           | **Shared primitives** — Button, Badge, Card, Dialog, Input, Textarea, Select, Label, EmptyState, Skeleton, Spinner/RadialLoader, Tooltip, IconButton, CopyButton, ConfirmDialog, Breadcrumbs, BackToTop, NotificationBadge, UserAvatar, OptimizedImage/BlurImage, AnimatedCount, ViewTransitionLink, NavigationProgress, RoutePending, pagination, slider, resizable, skeletons/. Also `tabs` (`<Tabs>`, the **only** sanctioned tab strip) and `glass-filter` (the global `GlassFilter` SVG host). Always check here before writing new UI. Full API notes in `docs/design-language.md` §5. |
| `feed/`         | Feed/timeline plus the **layout system**: `SiteShell.tsx` (the shell lives in `components/shell/`), `PageLayout.tsx` (canonical page wrapper), `ContextRail.tsx` (portals a page's `rightSidebar` into the shell's desktop live rail), `AnimatedMain.tsx`, `ColumnHeader.tsx`, post cards, composer. Also `feed.css`. Navigation lives in `components/shell/` (the sidebar, the globe).                                                                                                                                                         |
| `site/`         | Site-level chrome: `CommandPalette` (mounted globally), `LanguageSwitcher`, `PasskeyManager`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `shared/`       | Cross-feature building blocks. **The full-screen app tier lives here**: `app-theme.css` (the `--app-*` token contract + chrome shared by RMHbox/RMHType/RMHStudy/RMHTube/RMHMusic), `AppShell`, `AppHeader`, `AppToaster`, `ConnectionStatus` (reconnect banner + peer-wait overlay), `useQuitGame` (hooks/) is the shared "leave this game" handler games wire to their menu Quit button. Also `GameLoadingFallback`, `GameErrorBoundary`, ChatPanel, EmojiPicker, ReactionMenu.                                                                                                                                                                                           |
| `errors/`       | `RouteErrorFallback`, `NotFound` — wired as route error/404 components.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `Providers.tsx` | Global provider stack: React Query, session (`useSession`), theme application (style-* class swap + `THEME_BG` map + `THEME_EXCLUDED_ROUTES`), i18n provider, `MotionConfig reducedMotion="user"`, sonner `<Toaster>`, CommandPalette.                                                                                                                                                                                                                                                                                                                                                                                        |
| `i18n/`         | `AppI18nProvider`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Per-game dirs   | (`balatro/` and `void-breaker/` moved to `features/<id>/ui/`, A1) `altair/`, `rmhbox/`, `slice-it/`, `velum2099/`, `void-breaker/`, `synapse-storm/`, `kowloon-knockout/`, `temple-of-joy/`, `neon-driftway/`, `lights-out/`, `cursed-logic/`, `house-always-wins/`, `laundry-sort/`, `dream-rift/`, `hearthworks/`, `signal-forge/`, `vega/`, `versecraft/`, `daily-puzzles/`, …                                                                                                                                                                                                                                                                          |
| Per-app dirs    | `rmhtube/`, `rmhmusic/`, `rmhtype/`, `rmhstudy/`, `rmhcode/`, `rmhvibe/`, `rmhladder/`, `rmhbox/`, `rmhcoins/`, `library/`, `studio/`, `creator-studio/`, `blog/`, `news/`, `predictions/`, `rideshare/`, `homes/`, `membership/`, `economy/`, `doctrine/`, `shop/` (the store's shared pieces: `ItemPicture`, `ProductTile` + `PRODUCT_GRID`, `RarityMark`, `CoinAmount`, `ItemDialog`/`ItemStage`; the market, the daily shop and the cosmetics settings draw items with them), …                                                                                                                                                                                                                                                                                                                                                                 |
| Admin/ops       | `admin/`, `moderation/`, `developer/`, `security/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Conventions

- **Styling:** only `--site-*` token utilities (`bg-site-surface`,
  `text-site-text-muted`, `rounded-site`, `shadow-site`, …). Merge classes
  with `cn()` from `@/lib/utils`. No hardcoded colors, radii, or fonts —
  the theme system depends on it, and raw palette classes plus
  `rounded-lg`/`-xl`/`-2xl` fail CI on the site tier.
- **Content has no surface; only floating UI and fields do.** On a `_site` page content sits
  on the page and a list is rows on 1px rules (S1, S2, R3): no card, no box, no
  `surface-card`. The roles in `app/styles/steel-surfaces.css` are `.surface-overlay` for
  anything floating (dialogs, popovers, menus, toasts: CI-enforced, floating UI below the
  overlay tier fails), `.surface-field` for fields, `.surface-chrome` for a bar and
  `.surface-press` for a pressable host. `surface-card` and `surface-panel` exist only for
  full-screen games and apps (L8), where `app-theme.css` draws them. **No box-shadow on any UI
  surface** except an overlay's (T4).
- **Steel, not Plasmatic Jelly.** The glass, jelly and arc material was deleted in Steel phase 6
  and its leftover names in phase 7 (`data-jelly*` other than `data-jelly-motion`, the `Reveal`
  wrappers, the `glass-*` classes). Polished chrome is the globe and the toggle and slider
  thumbs only (R2); see [`design.md`](../design.md) and the Steel plan.
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
- **Toasts:** `import { toast } from "@/lib/toast"` — never from `sonner`
  (eslint fails on it). The first toast loads sonner and its themed `<Toaster>`
  through `<ToastHost>` in `Providers.tsx`; toasts raised meanwhile are queued.
- **Session:** client components read auth via `useSession()` from
  `@/components/Providers` — don't fetch `/api/auth` manually. Shell and
  globally mounted components never import `@/lib/auth-client` statically
  (it would put Better Auth's client back on every page): load it with
  `await import('@/lib/auth-client')` at the click, and use `readSession()`
  from `@/lib/session/live-session` for a socket token.
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
- [ ] **Rows on rules, not boxes** — a group of content is rows with a 1px rule between
      them, hung on the spine where the recipe says so. `.surface-overlay` is for anything
      floating, `.surface-field` for fields. Never a hand-rolled
      `bg-site-surface border rounded-site` box around content (R3).
- [ ] **Ink tracks its surface** (`bg-site-accent` → `text-site-accent-fg`),
      never `text-white`/`text-black` on a themed surface.
- [ ] **A switcher is a tab strip** even without `role="tablist"` — an accent
      pill, a segmented control, a `flex-1` button row with an active tint all
      belong on `<Tabs>`. The gate only catches the obvious shapes; this
      one is on you.
- [ ] **Motion from `lib/motion.ts`** (`DURATION`/`EASE`/`SPRING`/
      `APPLE_SPRING`, the named variants), not ad-hoc numbers; anything the
      user drags is a spring, not a duration.
- [ ] **Strings through `t("key", { defaultValue })`** in the `c-<area>`
      namespace, `pnpm i18n:extract` run, key present in `locales/en/`. New
      namespace ⇒ also register it in `NAMESPACES` (`lib/i18n/config.ts`).
- [ ] **Looked at in both themes × two widths** — Daylight and `.style-graphite`,
      phone and desktop, once with Globe motion `still`.
      Nothing in CI can do this for you (design-language.md §0.9).
- [ ] **iOS bars stay clear**: nothing new is `fixed`/`sticky` flush to the top or bottom
      edge, and no new full-viewport fixed layer (hide it on `html.ios-webkit`).
      `ios-edge-contract.test.ts` blocks the static cases; run `pnpm audit:pages` for a
      shell, page-frame or global-CSS change.
- [ ] **Bottom-anchored `position: fixed` UI follows Safari's toolbar**: write `bottom: calc(<offset> + var(--vv-follow, 0px))`
      (app/globals.css, "Bottom-anchored fixed UI that follows Safari's toolbar, in CSS only"), never a bare
      `bottom: <offset>`. `--vv-follow` is `100% - 100dvh` on iOS WebKit and `0px` elsewhere, so the element stays on the
      visible area while the toolbar resizes, resolved by layout with no script. Don't add a script that measures and
      writes the position: it runs on the main thread and trails the toolbar. There is no exception: the docked globe follows the same way (`components/shell/globe-nav.css`);
      `--vv-shift` and its probe are gone (`lib/__tests__/viewport-follow-css.test.ts`).
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
