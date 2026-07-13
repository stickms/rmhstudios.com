# Page Consistency Guide — building a page that looks native

> Audience: coding agents and contributors adding or editing pages. Companion
> to [`docs/design-language.md`](./design-language.md) (tokens, themes,
> primitives) and [`app/CLAUDE.md`](../app/CLAUDE.md) (routing mechanics).

Pages on rmhstudios.com look consistent because they share four things: the
`_site` shell, the `PageLayout` column system, the `--site-*` token contract,
and the same route-level conventions (head/SEO, i18n, auth, loading and error
states). This guide is the recipe.

---

## 1. Decide the page type first

| Type | Where the file goes | Gets |
|---|---|---|
| Standard site page (feed, wallet, settings, admin, …) | `app/routes/_site/<name>.tsx` | Left sidebar, mobile nav, skip link, page-enter animation |
| Full-screen experience (game, `/login`, legal, marketing arm, Discord activity) | `app/routes/<name>.tsx` (top level) | Nothing — you own the whole viewport |

This split is deliberate. Games, `login`, `secret/*`, the legal pages
(`terms`, `privacy`, `cookies`, `copyright`, `security`) and `discord/*` are
intentionally top-level — do not "fix" them into `_site/`.

---

## 2. Canonical standard page

```tsx
// app/routes/_site/example.tsx
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageLayout } from "@/components/feed/PageLayout";

export const Route = createFileRoute("/_site/example")({
  head: () => ({ meta: [{ title: "Example | RMH Studios" }] }),
  component: ExamplePage,
});

function ExamplePage() {
  const { t } = useTranslation("site");
  return (
    <PageLayout title={t("example-title", { defaultValue: "Example" })}>
      <div className="px-4 pt-4 pb-12 max-w-2xl mx-auto">
        {/* content */}
      </div>
    </PageLayout>
  );
}
```

`PageLayout` (`components/feed/PageLayout.tsx`) supplies the sticky
translucent header (`sticky top-0 z-10 h-15 bg-site-bg/85 backdrop-blur-md
border-b border-site-border`), the h1 in the theme display font, mobile menu
button, optional back arrow (`backTo`/`backLabel`), optional right sidebar,
and the width-constrained bordered center column.

Props: `title`, `children`, `rightSidebar?`, `headerExtra?`, `headerRight?`,
`wide?`, `backTo?`, `backLabel?`.

### Feed-column variant

Pages that render a raw column (achievements, bookmarks) skip `PageLayout` and
use `AnimatedMain` directly:

```tsx
import { AnimatedMain } from "@/components/feed/AnimatedMain";
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from "@/lib/layout-width";

<AnimatedMain
  className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
  targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
>
  {/* column content */}
</AnimatedMain>
<div className="hidden lg:block w-4 shrink-0" />
```

Widths come from `lib/layout-width.ts`: `DEFAULT_WIDTH` 648, `WIDE_WIDTH` 800,
`WIDE_NO_RIGHT_SIDEBAR_WIDTH` 952. Don't invent new column widths.

---

## 3. The consistency checklist

Work through this for every new or edited page:

### Structure
- [ ] File in the right place (`_site/` vs top level) — see §1.
- [ ] Wrapped in `PageLayout` (or the `AnimatedMain` column pattern).
- [ ] Inner content padded `px-4 pt-4 pb-12` (usually with `max-w-2xl mx-auto`).
- [ ] No sidebars/nav re-implemented — the shell owns them.

### Visual tokens (see design-language.md §1)
- [ ] Colors/borders/text only via `site-*` utilities; radii via
      `rounded-site`/`rounded-site-sm`; shadows via `shadow-site`.
- [ ] Surfaces via `Card` or `bg-site-surface border border-site-border rounded-site`.
- [ ] Buttons via `<Button variant size>`; pills via `<Badge>`; icons from
      `lucide-react`.

### States
- [ ] Loading: `<Skeleton>` blocks (add `shimmer` for hero placeholders) or
      `<Spinner>` (router-level pending is already handled by `RoutePending`).
      Buttons that trigger async work use `<Button loading={…}>` for in-flight
      feedback — never a hand-rolled `disabled` + `<Loader2>`.
- [ ] Empty: `<EmptyState icon title description action?>`.
- [ ] Errors: rely on route `errorComponent` inheritance
      (`components/errors/RouteErrorFallback`); throw `notFound()` in loaders
      for 404s (renders `components/errors/NotFound`).
- [ ] Feedback: `toast` from `sonner` — never custom toast UI.
- [ ] Destructive confirmations: `await useConfirm()({ title, danger })` — never
      native `window.confirm` (it ignores the theme system, i18n, and focus-trapping).
- [ ] Copy-to-clipboard: `<CopyButton value={…} label={…} />` — don't re-roll
      `navigator.clipboard.writeText` + a local `copied` state.
- [ ] Nested pages (2+ levels): give orientation via `PageLayout`'s
      `breadcrumbs` / `backTo` props (or the `<Breadcrumbs>` primitive).
- [ ] Signed-out (if auth-gated): either redirect in `beforeLoad`
      (`throw redirect({ to: "/login", search: { callbackURL } })`) or render a
      centered sign-in prompt with `<Button variant="accent">`.

### Head / SEO (see app/CLAUDE.md for details)
- [ ] `head()` returns at minimum `meta: [{ title: "X | RMH Studios" }]`.
- [ ] Public/marketing pages: use `buildMeta()` + `buildCanonical()` from
      `@/lib/seo`; content pages add JSON-LD via `jsonLdScript(...)` from
      `@/lib/schema`.

### i18n
- [ ] Every user-facing string through `t("key", { defaultValue: "…" })`,
      namespace `site` for standard pages (see design-language.md §10 for the
      namespace map).
- [ ] `pnpm i18n:extract` run after adding strings.

### Motion & accessibility
- [ ] framer-motion for JS animation (MotionConfig already gates reduced
      motion); gate imperative animation with `useReducedMotion()`. Prefer the
      shared tokens/variants in `lib/motion.ts` over ad-hoc `duration`/`ease`.
- [ ] Icon-only controls have `aria-label` or `sr-only` text; decorative icons
      `aria-hidden`.
- [ ] Keyboard path works (focus-visible rings are global; don't suppress
      outlines).
- [ ] Check `.style-light` and `.style-high-contrast`, not just default dark.
- [ ] Mobile: bottom padding clears the mobile nav (`pb-16 md:pb-0` on the
      column — PageLayout does this); tap targets comfortable at 480px
      (`xs` breakpoint).

### Before pushing
- [ ] `pnpm exec tsc --noEmit` and `pnpm lint` introduce no *new* warnings.
- [ ] Dev server run once so `app/routeTree.gen.ts` regenerates (never edit it
      by hand).

---

## 4. Full-screen games/apps

Games own their viewport but still share:

- `components/shared/GameLoadingFallback.tsx` and
  `components/shared/GameErrorBoundary.tsx` (strings in the `shared`
  namespace).
- Auth via the same session (`useSession()` from `@/components/Providers`, or
  a `beforeLoad` redirect).
- Reduced-motion respect where feasible (canvas/WebGL excluded).
- The theme class is *suppressed* on game routes (`THEME_EXCLUDED_ROUTES` in
  `components/Providers.tsx`) — game UIs use their own palettes, often defined
  as dedicated variable groups in `globals.css` (e.g. `--temple-*`,
  `--slice-*`, `--neon-*`).
- Realtime games connect through `lib/<game>/socket.ts` singletons — see
  `server/CLAUDE.md` for ports, paths, and event naming.

---

## 5. Common drift patterns to avoid

These are the mistakes that make a page feel "off" — reviewers will flag them:

1. Hardcoded colors (`bg-zinc-900`, `text-white`, hex values) instead of
   `site-*` tokens — breaks every theme at once.
2. `rounded-lg`/`rounded-2xl` instead of `rounded-site*` — hardcodes a radius
   that ignores each theme's `--site-radius` (18px) / `--site-radius-sm` (12px).
3. Custom headers instead of `PageLayout`'s sticky header.
4. Arbitrary column widths instead of `lib/layout-width.ts` constants.
5. Hand-rolled modals/spinners/empty states/copy-buttons instead of the
   `components/ui/` primitives, or native `window.confirm` instead of
   `useConfirm`.
6. Untranslated strings (missing `t()`), or `t()` without `defaultValue`.
7. Forgetting `pb-16 md:pb-0` on custom columns → content hidden behind the
   mobile bottom nav.
8. Adding `react-icons`, new font imports, or one-off animation systems.
