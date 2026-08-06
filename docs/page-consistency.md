# Page Consistency Guide — building a page that looks native

> Audience: coding agents and contributors adding or editing pages. Companion
> to [`docs/design-language.md`](./design-language.md) (tokens, themes,
> primitives) and [`app/CLAUDE.md`](../app/CLAUDE.md) (routing mechanics).

The site's design language is **Radial Avant-Garde Glass** (see
[`design-language.md`](./design-language.md)): a radial shell — fixed ring
backdrop, drifting aurora, slim top bar, and a central **RMH hub** that blooms
into the **liquid globe** you turn to navigate — wrapping content rendered in
the **Liquid Glass material**, in a strict high-contrast **monochrome** palette.
The glass is shipped, not aspirational: surfaces are translucent tints over the
shared aurora, every tier carries a rim glint, and the tier class is what the
degradation switches (high contrast, reduced transparency, `perf-lite`) act on.
Pages look consistent because they share four things: the `_site` **radial
shell**, the `PageLayout` column system, the `--site-*` token contract, and the
same route-level conventions (head/SEO, i18n, auth, loading and error states).
This guide is the recipe.

---

## 1. Decide the page type first

| Type                                                                            | Where the file goes                 | Gets                                                                             |
| ------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| Standard site page (feed, wallet, settings, admin, …)                           | `app/routes/_site/<name>.tsx`       | Radial shell (ring backdrop, top bar, central hub nav), skip link, page entrance |
| Full-screen experience (game, `/login`, legal, marketing arm, Discord activity) | `app/routes/<name>.tsx` (top level) | Nothing — you own the whole viewport                                             |

This split is deliberate. Games, `login`, `secret/*`, the legal pages
(`terms`, `privacy`, `cookies`, `copyright`, `security`) and `discord/*` are
intentionally top-level — do not "fix" them into `_site/`.

---

## 2. Canonical standard page

```tsx
// app/routes/_site/example.tsx
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';

export const Route = createFileRoute('/_site/example')({
  head: () => ({ meta: [{ title: 'Example | RMH Studios' }] }),
  component: ExamplePage,
});

function ExamplePage() {
  const { t } = useTranslation('site');
  return (
    <PageLayout title={t('example-title', { defaultValue: 'Example' })}>
      <div className="px-4 pt-4 pb-12 max-w-2xl mx-auto">{/* content */}</div>
    </PageLayout>
  );
}
```

`PageLayout` (`components/feed/PageLayout.tsx`) supplies a **flat, transparent
big-type header** — its h1 in the theme display font, sitting directly on the
radial ring backdrop (the radial content layer strips the old bordered header
capsule) — plus an optional back arrow (`backTo`/`backLabel`), optional
breadcrumbs, and the width-constrained center column. There is **no `border-r`
app-frame edge** and no in-page sidebar — the shell owns navigation (the radial
hub everywhere, plus a persistent nav rail ≥1120px). The center column carries
`pb-dock` to clear the mobile safe area.

`rightSidebar` is **not** an in-page column: it is portalled into the shell's
live rail, which exists only ≥1440px. Treat it as supplementary — anything
load-bearing belongs in `children`.

Props: `title`, `children`, `rightSidebar?`, `headerRight?`,
`wide?`, `backTo?`, `backLabel?`, `breadcrumbs?`.

**The header is not sticky.** The radial content layer unpins page-level sticky
chrome — headers, tab strips, search bars — so every `_site` route flows on the
document's own scroll like the feed. That is what lets mobile Safari collapse its
toolbars. Don't re-pin one.

### Feed-column variant

Pages that render a raw column (achievements, bookmarks) skip `PageLayout` and
use `AnimatedMain` directly:

```tsx
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';

<AnimatedMain className="w-full min-w-0 pb-dock" targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}>
  {/* column content */}
</AnimatedMain>;
```

(No trailing spacer div is needed any more — the shell's frame is a grid and
owns the rail track.)

Widths come from `lib/layout-width.ts`: `DEFAULT_WIDTH` 648, `WIDE_WIDTH` 800,
`WIDE_NO_RIGHT_SIDEBAR_WIDTH` 952. Don't invent new column widths — they are the
page's _preference_ (`--main-target`), and the shell raises the floor on wide
screens (`--rad-measure`) so the column uses the window it is given. Pass
`wide` (or `wide` on `PageLayout`) when the page should take the whole content
track instead.

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
- [ ] **Ink tracks its surface.** On a filled surface, use that surface's paired
      foreground — `bg-site-accent` → `text-site-accent-fg`, `bg-site-danger` →
      `text-site-danger-fg`. `globals.css` supplies these by default (zero
      specificity), so a background-only element is already correct; what you
      must not do is hardcode `text-white`/`text-black` on a themed surface —
      it survives today's accent and breaks against a user's. Translucent tints
      (`bg-site-accent/15` + `text-site-accent`) are a separate, correct pattern
      and are untouched.
- [ ] Surfaces via `Card` (L1 `.glass-fill` by default; `pane` for L2,
      `interactive` for the hover tint-raise + hover-raised rim glint + press
      flex) or the glass elevation classes
      (design-language.md §5.1) — repeated rows/tiles use `.glass-fill` (no
      blur), singular panels `.glass-pane`, floating UI `.glass-overlay`. Raw
      `bg-site-surface` still works (degrades to a translucent L1 tint).
- [ ] Buttons via `<Button variant size>`; pills via `<Badge>`; icons from
      `lucide-react`.
- [ ] Tab strips via `<LiquidTabs>` (`components/ui/liquid-tabs.tsx`) — the
      active capsule flows between tabs. Each strip rides its own glass **sheet**
      (`sheet` prop, default on) and sits **below** the hero / page-title
      capsule in the content flow, separated by the standard gutter — never
      inside the sticky header (§5.45). A strip that must stay
      sticky keeps a `top` offset clearing the floating header but remains its
      own sheet; on narrow screens wrap it in `tab-sheet-scroll` so it scrolls
      horizontally instead of clipping. Exception: tab bars that are really
      route links (RMHLadder) or need richer ARIA (`aria-controls`) keep their
      own markup and add the `layoutId` capsule + sheet wrapper directly. Every
      such custom capsule still carries the §5.47 morph underlay (`useLiquidMorph` + the two-layer outer-`layoutId`/inner-material span split) — a strip is
      either fully liquid or it isn't shipped (§15.1).
- [ ] **Spacing rhythm (§15.4):** use `--site-section-gap` (12–16px) between
      sibling glass elements in a column; responsive `SiteShell` gutters between
      columns; `PageLayout`/`.site-sticky-chrome` owns the gap from a page header
      to the first content below it. Internal padding at the
      primitive's canonical value, never a cramped per-page override: text
      inputs/wells `px-3 py-2` (with 44px targets restored for coarse pointers), card content
      `px-4 py-3`+, menu/list rows ≥12px inline padding (text never touches the
      glass edge).
- [ ] **Dialogs and editors:** standard dialogs use `DialogContent` and remain
      horizontally centered within the visual viewport. Complex or wide forms
      pass `mobileFullscreen`; large sheet editors do the same with
      `SheetContent`. Keep sibling controls at `gap-2` or greater, section groups
      at `gap-3`/`space-y-3` or greater, and leave close-control clearance in the
      shared header instead of adding one-off offsets.
- [ ] **Sticky stacking (§15.5):** a column has **one sticky group**. Either
      _merge_ related co-stickies (tabs + search) into a single sticky glass
      container, or _cascade_ independent stickies with cumulative `top` offsets
      using `.site-sticky-secondary` (which accounts for the condensed header,
      viewport edge, and section gutter). Primary column chrome uses
      `.site-sticky-chrome`; editor-internal sticky bars use
      `.site-sticky-contained`. Never pin two stickies to the same `top` — they
      overlap and hide each other while scrolled.
- [ ] Liquid Glass optics are **live**, inside the radial shell included: the
      tier you pick paints real material (tint, blur where the tier has it, rim
      glint on panes/overlays/chrome, hover glint on fills) and every degradation
      is central, so never branch per-component. Never rely on an optic for
      **legibility** — text has to hold on `--site-surface-opaque` too, because
      high-contrast, reduced transparency and perf-lite all collapse to it. Opt
      into the rationed extras only when a page's spec says so: `.glass-refract`
      (≤2/page, hero/chrome only — a frosted edge bevel today; the displacement
      lens is parked, see design-language.md), `.glass-refract--prism` (≤1/page,
      static chromatic rim), `.glass-liquid` ambient sheen (≤3/page),
      `.glass-sheen-hover` (primary CTAs).
- [ ] **Nothing on the page reacts to pointer _position_.** No `pointermove`
      listener, no gradient or background position driven by a cursor, no
      per-card sheen or tilt hook — all of that was retired site-wide
      (design-language.md §5.1.1), because moving a gradient repaints the whole
      element at pointer rate. Hover is a state (`:hover`, a class), never a
      coordinate; if you want light on a surface, the tier class already paints
      it.
- [ ] **Nothing writes a custom property to `<html>` per frame.** Root custom
      properties are inherited by the entire document and have no invalidation
      set, so one such write per frame is a whole-document restyle per frame —
      it was the single biggest cost the site ever shipped
      (`performance-audit-2026-08-01.md`). Write to the element that reads the
      value.

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
- [ ] Card→detail navigations (posts, images, books, blog/news) open with the
      liquid morph: `runViewTransition(el, { liquid: true })` + `liquidVTName()`
      (`lib/view-transition.ts`, §5.48), then stagger the detail's secondary
      content — don't hard-cut into a detail view.
- [ ] Icon-only controls have `aria-label` or `sr-only` text; decorative icons
      `aria-hidden`.
- [ ] Keyboard path works (focus-visible rings are global; don't suppress
      outlines).
- [ ] Focus ring stays visible against the surface it lands on — the global
      ring is `2px solid var(--site-accent)` (offset 2px), so any theme whose
      `--site-accent` approaches its `--site-surface` must be checked. Tab to the
      skip link (`_site.tsx`, the first focus stop) under `.style-high-contrast`
      specifically: the ring vs. surface must clear WCAG 1.4.11 (≥3:1).
- [ ] Check the two other **shipped** themes — `.style-graphite` (Midnight, the
      dark twin) and `.style-high-contrast` (glass off entirely) — plus
      reduced-transparency, not just the Daylight default.
- [ ] **Colour is not the only carrier of meaning.** Status must survive the
      colour-vision modes (design-language.md §2.1), which retint
      `--site-success`/`--site-danger`/`--site-warning` — so pair the colour with
      a glyph, a label or a position. `<Badge>` already does; use it rather than
      a bare tinted dot.
- [ ] The page still reads at 125% text size and in `compact` density
      (Settings → Appearance) — both are token-level and neither should need a
      per-page override.
- [ ] Mobile: bottom padding clears the floating dock
      (`pb-[calc(env(safe-area-inset-bottom,0px)+92px)] md:pb-0` on the column —
      PageLayout does this); tap targets comfortable at 480px (`xs` breakpoint).

### Before committing

- [ ] **`pnpm check:consistency`** — the commit gate. It scans the added lines
      for the rules CI fails on, runs the executable gates in `lib/__tests__/`
      (design-language.md §13), lints the changed files, typechecks and checks
      the generated docs, then prints what it cannot check. It runs itself on
      `git commit` via `.githooks/pre-commit` (after `pnpm hooks:install`) and,
      in agent sessions, `.claude/hooks/commit-gate.sh`. Fix what it reports —
      don't reach for `--no-verify`.
- [ ] `pnpm exec tsc --noEmit` and `pnpm lint` introduce no _new_ warnings.
- [ ] `pnpm exec vitest run` — the full suite, before you push.
- [ ] Dev server run once so `app/routeTree.gen.ts` regenerates (never edit it
      by hand).
- [ ] Walk design-language.md §0 (definition of done) once more against the
      finished diff. A green gate means you did not regress an enforced rule;
      it does not mean the page looks right.

---

## 4. Full-screen games/apps

**Apps** (RMHbox, RMHType, RMHStudy, RMHTube, RMHMusic) are not freeform: they
share the `--app-*` token contract and chrome in `components/shared/`
(`app-theme.css`, `AppShell`, `AppHeader`, `AppToaster` + `lib/shared/app-toast`,
`ConnectionStatus`). A new app writes **a palette class and nothing else** —
mount `AppShell` with it, use `AppHeader` for the app bar. See
[`design-language.md`](./design-language.md) §12; writing a sixth shell, header
or toast store is the exact drift that tier exists to prevent.

**Games** own their viewport and their look, but still share:

- `components/shared/GameLoadingFallback.tsx` and
  `components/shared/GameErrorBoundary.tsx` (strings in the `shared`
  namespace).
- Auth via the same session (`useSession()` from `@/components/Providers`, or
  a `beforeLoad` redirect).
- Reduced-motion respect where feasible (canvas/WebGL excluded).
- The theme class is _suppressed_ on game routes (`THEME_EXCLUDED_ROUTES` in
  `components/Providers.tsx`) — game UIs use their own palettes, often defined
  as dedicated variable groups in `globals.css` (e.g. `--temple-*`,
  `--slice-*`, `--neon-*`).
- Realtime games connect through `lib/<game>/socket.ts` singletons — see
  `server/CLAUDE.md` for ports, paths, and event naming.

---

## 5. Common drift patterns to avoid

These are the mistakes that make a page feel "off" — reviewers will flag them:

1. Hardcoded colors (`bg-zinc-900`, `text-white`, hex values) instead of
   `site-*` tokens — breaks every theme at once. CI-enforced for site-tier
   files (design-language.md §13 rule 5). Two legitimate escapes, both
   tokenised: a chip that sits **on a photograph** uses the
   `--site-media-*` contract (theme-tracking ink over someone's snapshot is
   the wrong answer), and a domain-fixed palette — a playing card, a roulette
   pocket — gets a scoped variable group like `--casino-*`.
2. `rounded-lg`/`rounded-2xl` instead of `rounded-site*` — hardcodes a radius
   that ignores each theme's `--site-radius` / `--site-radius-sm`. CI-enforced
   (§13 rule 6). `rounded-full` and `rounded-none` are shapes, not radii, and
   stay fine.
2b. A dropdown / popover / menu / tooltip on `.glass-fill` instead of
   `.glass-overlay`. L1 has **no backdrop blur** — it is the tier for repeated
   cards — so a menu built on it is transparent over whatever it opened on top
   of. CI-enforced (§13 rule 7).
2b2. `transition-all`. It makes the engine watch every animatable property
   including the layout ones, so a state change that touches `width` or `gap`
   animates a reflow. Name what moves (`transition-colors`,
   `transition-transform`, `transition-[a,b]`, or plain `transition`).
   CI-enforced (§13 rule 8). And if a layout property IS what you want to
   animate, reach for a transform first — a progress bar is `scaleX` on a
   full-width fill, not an animated `width`.
2c. A bare `duration-200` / `duration-300` instead of `duration-site` /
   `duration-site-fast` / `duration-site-slow`, which follow the theme's
   `--site-transition-speed`. Anything the user *drags* is a spring
   (`APPLE_SPRING`), not a duration at all.
3. A custom page header instead of `PageLayout`'s — or re-pinning one. The
   shell's header is a flat, transparent big-type block floating on the ring
   backdrop, and the radial content layer deliberately **unpins** page-level
   sticky chrome so every route flows on the document's own scroll (which is the
   only way mobile Safari collapses its toolbars).
4. Arbitrary column widths instead of `lib/layout-width.ts` constants.
5. Hand-rolled modals/spinners/empty states/copy-buttons instead of the
   `components/ui/` primitives, or native `window.confirm` instead of
   `useConfirm`.
6. Untranslated strings (missing `t()`), or `t()` without `defaultValue`.
7. Forgetting the bottom padding (`pb-dock`) on custom columns → content hidden
   behind the floating mobile dock. `.pb-dock` clears the dock, the home
   indicator, and iOS Safari's floating tab bar (via `--safe-bottom`) on mobile
   and collapses to 0 at md+.
   Also: putting a backdrop tier (`.glass-pane/chrome/overlay`) on repeated list
   items (blur cost) or on an ancestor of a `position:fixed` element (containing
   block) — see design-language.md §5.1.
8. Adding `react-icons`, new font imports, or one-off animation systems.
8b. Re-introducing cursor tracking — a `pointermove` listener, a hover hotspot,
   a card tilt, a "follow the mouse" glow. The whole class of effect was removed
   in one pass (design-language.md §5.1.1). Same for a reveal-on-scroll that
   defaults to `opacity: 0`: use `useReveal`, whose hidden state is opt-in and
   therefore cannot strand content when the JS does not arrive.
9. Re-adding app-frame edges: `border-r border-site-border` on page columns,
   full-bleed `sticky top-0 border-b` headers, or a re-implemented sidebar — the
   radial shell owns the chrome (ring backdrop, top bar, central hub nav), and
   PageLayout's header is a flat big-type block floating on the backdrop, not a
   bordered capsule.
10. Hand-rolling a `layoutId` tab capsule instead of `LiquidTabs`, or stacking
    `.glass-refract` onto a `.glass-chrome--aside` element (its `::before` is the
    blur carrier, so the lens band has nowhere to live — see design-language.md
    §5.1). The aside's glint rides its own border-box background layer now (§4.35),
    not a pseudo.
