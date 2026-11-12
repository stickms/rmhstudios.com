# Page Consistency Guide: building a page that looks native

> Audience: coding agents and contributors adding or editing pages. Companion to
> [`docs/design-language.md`](./design-language.md) (the definition of done, tokens, surfaces and the gates),
> [`design.md`](../design.md) (the statement of the language) and [`app/CLAUDE.md`](../app/CLAUDE.md)
> (routing mechanics). The single source for every value and recipe is the Steel plan,
> [`docs/plans/2026-11-11-steel-design-implementation.md`](./plans/2026-11-11-steel-design-implementation.md) ("the plan").

The site's design language is **Steel**: a flat, neutral page in one typeface, divided by hairline rules, with content hung
on a thin vertical line (the spine). Polished chrome is the only material and exists in three places (the globe, the toggle
thumb, the slider thumb). Pages look consistent because they share four things: the `_site` shell
(`components/shell/SiteShell.tsx`), the `PageLayout` title block, the `--site-*` token contract and the `t-*` type classes,
and the same route-level conventions (head and SEO, i18n, auth, loading and error states). This guide is the recipe.

---

## 1. Decide the page type first

| Type                                                                            | Where the file goes                 | Gets                                                                                   |
| ------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| Standard site page (feed, wallet, settings, admin, …)                           | `app/routes/_site/<name>.tsx`       | The site shell (sidebar and docked globe), the skip link, the `PageLayout` title block |
| Full-screen experience (game, `/login`, legal, marketing arm, Discord activity) | `app/routes/<name>.tsx` (top level) | Nothing — you own the whole viewport                                                   |

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
      {/* rows on rules */}
    </PageLayout>
  );
}
```

`PageLayout` (`components/feed/PageLayout.tsx`) supplies the title block (`t-title`, no kicker above it), an optional
description, an optional back link (`backTo`/`backLabel`), optional breadcrumbs, a `headerRight` slot and the content column
at the right measure. There is no app-frame edge, no in-page sidebar and no fixed header: the shell owns navigation (the
sidebar on desktop, the docked globe on a phone) and the page title scrolls with the page (L1).

`rightSidebar` is not an in-page column: it is portalled into the shell's margin column, which exists only on wide desktop
(L2, L6). Treat it as supplementary; anything load-bearing belongs in `children`. A page that needs no margin renders
`<NoMargin />`.

Props: `title`, `children`, `rightSidebar?`, `headerRight?`, `wide?`, `backTo?`, `backLabel?`, `breadcrumbs?`, `wrapTitle?`.

A page whose content already names itself (a profile, a thread, a conversation) uses `PageFrame`, the same column with no
header, rather than importing `AnimatedMain` directly. Widths come from `lib/layout-width.ts` (`DEFAULT_WIDTH`,
`WIDE_WIDTH`); reading content is capped at 640px (L5). Do not invent column widths.

## Which recipe

Each page picks the closest recipe in plan section 10, which fixes what the spine means on that page and what the one primary
is. A page that fits none is, per X2, a titled page of rows on rules with no spine, and the gap is recorded in plan section 18.

| Page family                                            | Recipe                                                                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Feed, replies, a person's history                      | Home, Post and replies, Profile: one dot per post on a `Spine` of `RMHarkCard`s                                                        |
| Reading                                                | Article: the table of contents is the spine; each section heading is a station, paragraphs are dotless `t-prose` items (`ArticleBody`) |
| Messages                                               | Conversation and Inbox: one dot per message from the other person, or per unread thread                                                |
| Settings and forms                                     | Settings: stations per group, each setting a row (name, one-line explanation, control at the end) (`SettingsSection`)                  |
| Search and discovery                                   | Explore: stations per kind, rows on rules                                                                                              |
| Everything else (wallet, store, admin, library, tools) | A titled page of rows on rules; no cards, no boxes                                                                                     |

## 3. The consistency checklist

Work through this for every new or edited page.

### Structure

- [ ] File in the right place (`_site/` vs top level), see §1.
- [ ] Wrapped in `PageLayout` (or `PageFrame` when the content names itself).
- [ ] Inner content has **no inline `px-*`**: the shell frame supplies the page gutter and the title sits on it, so extra
      padding indents the content a second time.
- [ ] No sidebars or navigation re-implemented; the shell owns them. The header is not sticky and nothing else is fixed on
      a phone except the globe (L1).

### Surfaces and tokens (design-language.md §0, §4)

- [ ] Colours, borders and text only via `site-*` utilities; radii via `rounded-site` and `rounded-site-sm`. No shadow on
      content.
- [ ] **Rows on rules, not boxes (R3).** A list is rows with `border-b border-site-border`; columns are divided by a 1px
      vertical rule. A bordered box is for a control or a picture. Do not write `surface-card` or `surface-panel` on a `_site`
      page; do not hand-roll `bg-site-surface border rounded-site` around content.
- [ ] Floating UI (menu, popover, dialog, toast) carries `surface-overlay` (or uses the `components/ui/` primitive that does);
      fields are `surface-field` or the `Input`, `Textarea`, `Select` primitives.
- [ ] **Ink tracks its surface.** On a filled surface use its paired foreground (`bg-site-accent` takes
      `text-site-accent-fg`); never `text-white` or `text-black` on a themed surface.
- [ ] One ink primary per view: `<Button variant="primary">`; every other button is `default` or `ghost`. Pills via `<Badge>`;
      icons from `lucide-react`.
- [ ] Type is the seven `t-*` classes; weights 400, 500, 600; sentence case; no `uppercase` or letterspacing.
- [ ] Tab strips via `<Tabs>` (`components/ui/tabs.tsx`), placed below the page title: words on a rule, the active one ink
      with a 2px underline. A role-less switcher with a pill or segment is still a tab strip. If the "tabs" are product names
      that do not fit, the page is a list of rows, not a strip.
- [ ] Logical properties (`ps-*`, `ms-*`, `border-s`), so `ar` and `ur` mirror the page.
- [ ] Spacing: 14px inside a row, 22px above a station, 26px above a page title on desktop (L7). Text fields use the
      primitive's fixed height; do not re-pad a raw `<input>`.
- [ ] **Dialogs and editors:** standard dialogs use `DialogContent` and stay centred in the visual viewport. Complex or wide
      forms pass `mobileFullscreen`; large sheet editors do the same with `SheetContent`.
- [ ] **Nothing writes a custom property to `<html>` per frame.** Root custom properties are inherited by the whole document, so
      one write per frame is a whole-document restyle per frame.

### States

- [ ] Loading: `<Skeleton>` blocks (a still `--site-bg-subtle` block, never a shimmer, M6) or `<Spinner>` (router-level
      pending is handled by `RoutePending`). Buttons that trigger async work use `<Button loading={...}>`.
- [ ] Empty: `<EmptyState icon title description action?>`.
- [ ] Errors: rely on route `errorComponent` inheritance (`components/errors/RouteErrorFallback`); throw `notFound()` in
      loaders for 404s (renders `components/errors/NotFound`). An error says what happened and what to do next.
- [ ] Feedback: `toast` from `@/lib/toast` (sonner, loaded on the first toast); never custom toast UI.
- [ ] Destructive confirmations: `await useConfirm()({ title, danger })`; never `window.confirm`.
- [ ] Copy-to-clipboard: `<CopyButton value label />`.
- [ ] Nested pages (2+ levels): orientation via `PageLayout`'s `breadcrumbs` or `backTo`.
- [ ] Signed-out (if auth-gated): redirect in `beforeLoad` (`throw redirect({ to: "/login", search: { callbackURL } })`) or
      render a one-line sign-in prompt with `<Button variant="primary">`.

### Head / SEO (see app/CLAUDE.md for details)

- [ ] `head()` returns at minimum `meta: [{ title: "X | RMH Studios" }]`.
- [ ] Public pages use `buildMeta()` and `buildCanonical()` from `@/lib/seo`; content pages add JSON-LD via `jsonLdScript(...)`
      from `@/lib/schema`.

### i18n

- [ ] Every user-facing string through `t("key", { defaultValue: "..." })`, namespace `site` for standard pages. A change of
      wording is a new key.
- [ ] `pnpm i18n:extract` run after adding strings (the owner translates later with another tool; a hand-added English key
      goes in `locales/en/<ns>.json` and in `KNOWN_UNTRANSLATED` in `lib/__tests__/i18n-catalogs.test.ts`).

### Motion and accessibility

- [ ] Motion is one of plan section 11's five (M1 to M5) and ends within 360 ms. Prefer the durations in `lib/motion.ts`.
      Nothing animates at rest: no pulse, no `infinite` keyframe, no hover lift, no entrance or stagger.
- [ ] Card to detail navigations are plain route changes (M8). No view-transition morph.
- [ ] Icon-only controls have `aria-label` or `sr-only` text; decorative icons `aria-hidden`.
- [ ] Keyboard path works. The focus ring is global (K10: `2px solid var(--site-text)`, offset 2px; on a text field it sits on
      the border and a field with no box shows none); do not suppress outlines.
- [ ] Check both editions, Day (`.style-default`) and Night (`.style-graphite`), at 390px and 1280px, and once in `ar`.
- [ ] **Colour is not the only carrier of meaning.** Status survives the colour-vision modes, which retint
      `--site-success` and `--site-danger`; pair the colour with a glyph, a label or a position. `<Badge>` already does.
- [ ] The page still reads at 125% text size and in `compact` density (Settings, Appearance).
- [ ] Mobile: bottom padding clears the globe (`pb-dock`, which `PageLayout` and `PageFrame` supply); tap targets are 44px.

### Before committing

- [ ] **`pnpm check:consistency`**, the commit gate. It scans the added lines for the rules CI fails on, runs the executable
      gates in `lib/__tests__/` (design-language.md §13), lints the changed files, typechecks and checks the generated docs,
      then prints what it cannot check. It runs itself on `git commit` via `.githooks/pre-commit` (after
      `pnpm hooks:install`) and, in agent sessions, `.claude/hooks/commit-gate.sh`. Fix what it reports; do not reach for
      `--no-verify`.
- [ ] `pnpm exec tsc --noEmit` and `pnpm lint` introduce no new warnings.
- [ ] `pnpm test`, the full suite, before you push.
- [ ] Build or dev run once so `app/routeTree.gen.ts` regenerates (never edit it by hand).
- [ ] Walk design-language.md §0 once more against the finished diff and look at the page. A green gate means you did not
      regress an enforced rule; it does not mean the page looks right.

### How consistency is enforced (what catches what)

Consistency fails when it lives in comments and memory. Each layer below catches a different class of drift; none replaces
the others.

| Layer                                                                              | Runs                                                                                                                      | Catches                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/__tests__/design-consistency.test.ts` and the other gates in `lib/__tests__/` | every commit (`pnpm check:consistency`) and `pnpm test`                                                                   | hand-rolled tab strips, raw palette colours, hardcoded radii, `transition-all`, floating UI below `surface-overlay`, the Steel token and flatness contracts, motion rules                                                                                                                                                                              |
| `lib/__tests__/ios-edge-contract.test.ts`                                          | same                                                                                                                      | the iOS edge contract: no `theme-color` on iOS, no full-viewport fixed decoration, nothing pinned flush to the top or bottom (what makes Safari paint a coloured band behind its status bar and tab bar), and a **ratchet** against any new `fixed` or `sticky` layer pinned to an edge                                                                |
| `lib/__tests__/steel-flat.test.ts`, `steel-tokens.test.ts`                         | same                                                                                                                      | `backdrop-filter`, `filter` or a gradient in site-tier CSS outside the chrome stylesheets; a deleted token anywhere; wrong token values or contrast                                                                                                                                                                                                    |
| **`pnpm audit:pages`** (`scripts/audit-pages.mjs`)                                 | on demand, before and after any change to the shell, page frame, tabs or global CSS; against a running app (`--base-url`) | in a real browser with an iPhone Safari user-agent: every visible fixed or sticky element touching a screen edge, and the page anatomy: a `PageLayout` heading, and the heading, tab strip and search field starting and ending on the same edges. `--full` adds desktop and Day. `--strict` fails on anything not in `docs/page-audit-allowlist.json` |
| `testing/e2e/steel-rest.mjs`                                                       | the `steel-rest` CI job                                                                                                   | zero animation frames at rest, one WebGL context, no workers, the globe opens and closes                                                                                                                                                                                                                                                               |

Rules of the road:

- **The allowlist and the ratchet only shrink.** A finding is fixed, not listed; a listing needs the owner's review and a
  reason, and a stale entry is reported so it gets deleted.
- **A new layer pinned to an edge is a design decision, not a styling detail.** Float it off the edge, make it in-flow, or
  hide it on `html.ios-webkit`. Do not paint `theme-color` on iOS and do not add a full-viewport fixed layer.
- **Page frame drift is found by measurement, not by eye.** `pnpm audit:pages --routes /a,/b` says which edge differs. Fix
  the page to use `PageLayout` and the shared gutter instead of its own wrapper padding.
- **Extend the guards when you extend the system.** A new shared primitive gets a gate in `lib/__tests__/` (or an audit metric)
  in the same commit that adds it.

---

## 4. Full-screen games/apps

**Apps** (RMHbox, RMHType, RMHStudy, RMHTube, RMHMusic) are not freeform: they
share the `--app-*` token contract and chrome in `components/shared/`
(`app-theme.css`, `AppShell`, `AppHeader`, `AppToaster` + `lib/shared/app-toast`,
`ConnectionStatus`). A new app writes **a palette class and nothing else** —
mount `AppShell` with it, use `AppHeader` for the app bar. See
[`design-language.md`](./design-language.md) §10; writing a sixth shell, header
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

These are the mistakes that make a page feel "off"; reviewers flag them:

1. Hardcoded colours (`bg-zinc-900`, `text-white`, hex values) instead of `site-*` tokens. CI-enforced for site-tier files
   (design-language.md §13 rule 5). Two tokenised escapes: a chip that sits **on a photograph** uses the `--site-media-*`
   contract, and a domain-fixed palette (a playing card, a roulette pocket) gets a scoped variable group like `--casino-*`.
2. `rounded-lg`, `rounded-2xl` instead of `rounded-site*`. CI-enforced (§13 rule 6). `rounded-full` and `rounded-none` are
   shapes, not radii.
   2b. A dropdown, popover, menu or tooltip that is not `surface-overlay`: it would be transparent over whatever it opened on
   top of. CI-enforced (§13 rule 7).
   2c. `transition-all` (it makes the engine watch layout properties). Name what moves (`transition-colors`,
   `transition-[a,b]`). CI-enforced (§13 rule 8). If a layout property is what you want to animate, reach for a transform.
3. A custom page header instead of `PageLayout`'s, or a sticky one. The title scrolls with the page.
4. Arbitrary column widths instead of `lib/layout-width.ts`.
5. Hand-rolled modals, spinners, empty states or copy buttons instead of the `components/ui/` primitives, or native
   `window.confirm` instead of `useConfirm`.
6. Untranslated strings (missing `t()`), or `t()` without `defaultValue`.
7. Forgetting the bottom padding (`pb-dock`) on a custom column, so content hides behind the globe. `.pb-dock` clears the
   globe, the home indicator and iOS Safari's floating tab bar on a phone and collapses at desktop widths.
8. Adding `react-icons`, a new font, or a one-off animation system. A gradient, blur, glow, shadow or idle animation on content.
9. A card: a bordered or filled box around a group of content, a tile with a picture and a caption inside a box, a "widget".
   Use rows on rules (R3).
10. Hand-rolling a `layoutId` tab capsule instead of `Tabs`, or an uppercase eyebrow above a heading (`site-section-label` and
    `site-kicker` are sentence case).

Search and filter controls immediately follow the relevant tabs, before promotional or summary content. Loading states reserve
space, use the shell column measure, and do not insert a second gutter. Controls share `--site-control-radius`; pictures and
overlays use `--site-radius`.
