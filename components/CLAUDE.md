# components/ — React components by feature

> Scope: guidance for working inside `components/`. Repo-wide context:
> [`/CLAUDE.md`](../CLAUDE.md). Visual rules:
> [`docs/design-language.md`](../docs/design-language.md).

~780 files organized **by feature, one directory per game/app/domain**, plus a
few shared directories. Rule of thumb: a component used by exactly one
feature lives in that feature's directory; genuinely shared primitives live in
`ui/`.

## Directory map

| Directory | Contents |
|---|---|
| `ui/` | **Shared primitives** — Button, Badge, Card, Dialog, Input, Textarea, Select, Label, EmptyState, Skeleton, Spinner, Tooltip, NotificationBadge, UserAvatar, OptimizedImage/BlurImage, AnimatedCount, ViewTransitionLink, NavigationProgress, RoutePending, pagination, slider, resizable, skeletons/. Always check here before writing new UI. Full API notes in `docs/design-language.md` §5. |
| `feed/` | Feed/timeline plus the **layout system**: `PageLayout.tsx` (canonical page wrapper), `AnimatedMain.tsx`, `LeftSidebar`, `MobileNav`, post cards, composer. Also `feed.css`. |
| `site/` | Site-level chrome: `CommandPalette` (mounted globally), `LanguageSwitcher`, `PasskeyManager`. |
| `shared/` | Cross-feature building blocks: `GameLoadingFallback`, `GameErrorBoundary`, ChatPanel, EmojiPicker, ReactionMenu. |
| `errors/` | `RouteErrorFallback`, `NotFound` — wired as route error/404 components. |
| `Providers.tsx` | Global provider stack: React Query, session (`useSession`), theme application (style-* class swap + `THEME_BG` map + `THEME_EXCLUDED_ROUTES`), i18n provider, `MotionConfig reducedMotion="user"`, sonner `<Toaster>`, CommandPalette. |
| `i18n/` | `AppI18nProvider`. |
| Per-game dirs | `altair/`, `rmhbox/`, `slice-it/`, `velum2099/`, `void-breaker/`, `synapse-storm/`, `kowloon-knockout/`, `temple-of-joy/`, `neon-driftway/`, `lights-out/`, `cursed-logic/`, `house-always-wins/`, `laundry-sort/`, `cookgame/`, `dream-rift/`, `forest-explorer/`, `signal-forge/`, `vega/`, `versecraft/`, `daily-puzzles/`, `rmh-farming-sim/`, … |
| Per-app dirs | `rmhtube/`, `rmhmusic/`, `rmhtype/`, `rmhstudy/`, `rmhcode/`, `rmhvibe/`, `rmhladder/`, `rmhbox/`, `rmhcoins/`, `library/`, `studio/`, `creator-studio/`, `blog/`, `news/`, `predictions/`, `rideshare/`, `homes/`, `membership/`, `economy/`, `doctrine/`, … |
| Admin/ops | `admin/`, `moderation/`, `developer/`, `security/`. |

## Conventions

- **Styling:** only `--site-*` token utilities (`bg-site-surface`,
  `text-site-text-muted`, `rounded-site`, `shadow-site`, …). Merge classes
  with `cn()` from `@/lib/utils`. No hardcoded colors, radii, or fonts —
  31 themes depend on it.
- **Variants:** use `class-variance-authority` for components with variant
  APIs (see `ui/button.tsx`, `ui/badge.tsx`). Set a `data-slot="..."`
  attribute on new primitives — themes restyle components through
  `[data-slot]` selectors in `globals.css`.
- **Icons:** `lucide-react` only. Decorative icons get `aria-hidden`;
  icon-only buttons get `aria-label`/`sr-only` text.
- **Strings:** every user-visible string through `t("key", { defaultValue })`.
  Component namespaces are `c-<area>` (e.g. `c-ui`, `c-rmhbox`); pages mostly
  use `site`. Run `pnpm i18n:extract` after adding strings.
- **Motion:** framer-motion inline props; global `MotionConfig` already
  respects reduced motion. Use `hooks/useReducedMotion` for imperative
  animation and `hooks/useCelebration` for confetti.
- **Toasts:** `import { toast } from "sonner"` — the themed `<Toaster>` is
  already mounted in `Providers.tsx`.
- **Session:** client components read auth via `useSession()` from
  `@/components/Providers` — don't fetch `/api/auth` manually.
- **User display data:** render avatars/names via `useFreshUser` /
  `stores/userDisplayStore` so they update live; the shared Prisma select for
  user shapes is `userDisplaySelect` in `lib/user-display.ts`.
- **Server code:** never import `@/lib/*.server` modules from components.
  Fetch through API routes, loaders, or server functions.
- **Accessibility:** jsx-a11y lint runs at warn — don't add new warnings.
  Prefer Radix-based `ui/` primitives over hand-rolled interactive widgets.

## Adding UI — decision tree

1. Does a `ui/` primitive already do it? Use it.
2. Is it a variant of an existing primitive? Extend the CVA variants rather
   than forking the component.
3. Feature-specific? Put it in that feature's directory next to its users.
4. Needed by 2+ features? Then it belongs in `ui/` (primitive) or `shared/`
   (composite) — with `data-slot`, tokens, i18n, and a11y from day one.
